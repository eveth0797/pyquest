/* =========================================================
   PYQUEST — App: mapa, niveles, combate por tests,
   motor adaptativo (maestría por tema, pistas, modo reto,
   repaso espaciado) y persistencia en localStorage.
   ========================================================= */
(() => {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const WORLDS = window.PQ_WORLDS, LEVELS = window.PQ_LEVELS;
  const KEY = "pyquest.v1";
  const DAY = 86400000;

  /* ---------------- ESTADO ---------------- */
  const def = () => ({ xp: 0, done: {}, code: {}, attempts: {}, hintsUsed: {}, mastery: {}, streak: 0, lastDay: "", achievements: {}, sound: true, firstSeen: Date.now() });
  let S; try { S = Object.assign(def(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { S = def(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
  const todayStr = () => new Date().toISOString().slice(0, 10);

  /* ---------------- PROGRESIÓN ---------------- */
  const levelFromXP = xp => { let l = 1, need = 100, r = xp; while (r >= need) { r -= need; l++; need = Math.round(need * 1.18); } return { l, r, need }; };
  const worldLevels = w => LEVELS.filter(x => x.world === w);
  const isDone = id => !!S.done[id];
  function isUnlocked(lv) {
    const idx = LEVELS.indexOf(lv);
    if (idx === 0) return true;
    if (lv.boss) return worldLevels(lv.world).filter(x => !x.boss).every(x => isDone(x.id));
    const prev = LEVELS[idx - 1];
    if (prev.world !== lv.world) return isDone(prev.id); // primer nivel del mundo: requiere el jefe anterior
    return isDone(prev.id);
  }
  const mastery = t => S.mastery[t] ?? 0.2;
  function updateMastery(topic, passed, attempts, hints) {
    let m = mastery(topic);
    if (passed) m += (1 - m) * 0.4 / (1 + 0.4 * Math.max(0, attempts - 1)) * (hints ? 0.6 : 1);
    else m -= m * 0.06;
    S.mastery[topic] = Math.max(0, Math.min(1, m));
  }
  const challengeOn = lv => (lv.extra || []).length > 0 && mastery(lv.topic) >= 0.55;
  function reviewQueue() {
    const now = Date.now();
    return LEVELS.filter(lv => { const d = S.done[lv.id]; if (!d) return false; const interval = [1, 3, 7, 14, 30][Math.min(4, d.reviews || 0)] * DAY * (d.stars >= 3 ? 1.5 : 1); return now - (d.at || 0) > interval || mastery(lv.topic) < 0.45; }).slice(0, 6);
  }
  function nextRecommended() {
    const open = LEVELS.filter(lv => isUnlocked(lv) && !isDone(lv.id));
    if (open.length) return open[0];
    return reviewQueue()[0] || null;
  }

  /* ---------------- PYTHON WORKER ---------------- */
  let worker = null, pending = null, msgId = 0, pyState = "off", pyBooted = false; const pkgsLoaded = new Set();
  function makeWorker() {
    worker = new Worker("js/worker.js");
    worker.onmessage = ev => {
      const m = ev.data;
      if (m.status === "loading") return setPy("Cargando Python (Pyodide)… la primera vez tarda unos segundos");
      if (m.status === "pkg") return setPy(`Cargando ${m.pkg}…`);
      if (m.ok) pyBooted = true;
      if (pending && m.id === pending.id) { clearTimeout(pending.timer); const p = pending; pending = null; setPy("Python listo ✓", "ok"); p.resolve(m); }
    };
    worker.onerror = e => { if (pending) { clearTimeout(pending.timer); pending.resolve({ ok: false, error: "Error del worker: " + e.message }); pending = null; } };
  }
  function setPy(text, cls = "") { pyState = text; const el = $("#pyStatus"); el.textContent = "🐍 " + text; el.className = "pystatus " + cls; }
  function runPython(code, tests, packages, timeoutMs) {
    if (!worker) { makeWorker(); pyBooted = false; pkgsLoaded.clear(); }
    const newPkgs = (packages || []).filter(p => !pkgsLoaded.has(p)); newPkgs.forEach(p => pkgsLoaded.add(p));
    timeoutMs = timeoutMs || (pyBooted ? 15000 : 90000) + (newPkgs.length ? 60000 : 0);
    return new Promise(resolve => {
      const id = ++msgId;
      const timer = setTimeout(() => { worker.terminate(); worker = null; pending = null; setPy("Reiniciado tras timeout", "bad"); resolve({ ok: false, error: `⏱️ Tu programa tardó más de ${timeoutMs / 1000}s (¿bucle infinito o algoritmo demasiado lento?)` }); }, timeoutMs);
      pending = { id, resolve, timer };
      worker.postMessage({ id, code, tests, packages: packages || [] });
    });
  }

  /* ---------------- SONIDO ---------------- */
  let actx; function beep(fs, type = "square", dur = 0.08, vol = 0.05) {
    if (!S.sound) return; try { actx = actx || new AudioContext(); fs.forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f; const t = actx.currentTime + i * dur; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.5); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur * 1.6); }); } catch {}
  }

  /* ---------------- UI GENERAL ---------------- */
  function toast(msg, cls = "") { const t = document.createElement("div"); t.className = "toast " + cls; t.innerHTML = msg; $("#toasts").appendChild(t); setTimeout(() => t.remove(), 3200); }
  function hud() {
    const L = levelFromXP(S.xp);
    $("#plLevel").textContent = L.l; $("#xpFill").style.width = (L.r / L.need * 100) + "%"; $("#xpText").textContent = `${L.r}/${L.need} XP`;
    $("#streak").textContent = S.streak; $("#doneCount").textContent = `${Object.keys(S.done).length}/${LEVELS.length}`;
  }
  function show(screen) { $$(".screen").forEach(s => s.classList.toggle("show", s.id === "scr-" + screen)); window.scrollTo(0, 0); }

  /* ---------------- MAPA ---------------- */
  function renderMap() {
    hud(); show("map");
    const rec = nextRecommended();
    $("#worlds").innerHTML = WORLDS.map(w => {
      const lvs = worldLevels(w.id), n = lvs.filter(l => isDone(l.id)).length, locked = !isUnlocked(lvs[0]);
      return `<section class="world ${locked ? "locked" : ""}" style="--wc:${w.color}">
        <header><span class="wi">${w.icon}</span><div><h3>Mundo ${w.id} · ${w.name}</h3><small>Jefe: ${w.boss} · ${n}/${lvs.length}</small></div></header>
        <div class="path">${lvs.map(lv => { const u = isUnlocked(lv), d = S.done[lv.id];
          return `<button class="node ${lv.boss ? "boss" : ""} ${d ? "done" : ""} ${u ? "" : "lock"} ${rec && rec.id === lv.id ? "rec" : ""}" data-lv="${lv.id}" ${u ? "" : "disabled"} title="${esc(lv.title)}">
            <span>${lv.boss ? "👑" : d ? "✓" : u ? lv.id.split("-")[1] : "🔒"}</span>${d ? `<i>${"★".repeat(d.stars || 1)}</i>` : ""}</button>`; }).join('<b class="link"></b>')}</div>
      </section>`;
    }).join("");
    // panel adaptativo
    const topics = [...new Set(LEVELS.map(l => l.topic))];
    $("#mastery").innerHTML = topics.map(t => `<div class="ms"><span>${t}</span><div class="bar"><div class="fill" style="width:${mastery(t) * 100}%"></div></div><b>${Math.round(mastery(t) * 100)}%</b></div>`).join("");
    const rq = reviewQueue();
    $("#review").innerHTML = rq.length ? rq.map(l => `<button class="chip" data-lv="${l.id}">🔁 ${esc(l.title)}</button>`).join("") : "<small>Nada que repasar ahora. ¡Sigue avanzando!</small>";
    $("#recBtn").textContent = rec ? `▶ Continuar: ${rec.title}` : "🏆 ¡Completaste todo!"; $("#recBtn").dataset.lv = rec ? rec.id : "";
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-lv]"); if (b && b.dataset.lv && !b.disabled) openLevel(b.dataset.lv); });

  /* ---------------- NIVEL ---------------- */
  let cur = null, startT = 0, hintTimer = null;
  function openLevel(id) {
    cur = LEVELS.find(l => l.id === id); if (!cur) return;
    const w = WORLDS.find(x => x.id === cur.world);
    startT = Date.now();
    show("level");
    document.documentElement.style.setProperty("--wc", w.color);
    $("#lvWorld").textContent = `${w.icon} Mundo ${w.id} · ${w.name}`;
    $("#lvTitle").textContent = cur.title;
    $("#lvStory").textContent = cur.story;
    $("#lvTheory").innerHTML = cur.theory;
    $("#lvTask").innerHTML = cur.task;
    $("#lvPractice").textContent = "💡 Buena práctica: " + cur.practice;
    const ch = challengeOn(cur);
    $("#challenge").hidden = !ch;
    $("#editor").value = S.code[cur.id] || cur.starter;
    updateGutter();
    $("#console").innerHTML = `<span class="dim">Pulsa ▶ Ejecutar (Ctrl+Enter). Cada test que pase daña al enemigo.</span>`;
    // enemigo
    const nTests = cur.tests.length + (ch ? cur.extra.length : 0);
    $("#enemy").innerHTML = `<div class="foe ${cur.boss ? "boss" : ""}">${cur.boss ? "🐉" : ["👾", "🦇", "🐍", "🤖", "👻", "🧟"][LEVELS.indexOf(cur) % 6]}</div><div class="foe-name">${cur.boss ? w.boss : "Bug de " + cur.topic}</div><div class="hp"><div class="hpfill" id="hpFill" style="width:100%"></div><span id="hpText">${nTests}/${nTests}</span></div>`;
    renderHints();
    clearInterval(hintTimer); hintTimer = setInterval(renderHints, 5000);
    $("#solutionBtn").hidden = (S.attempts[cur.id] || 0) < 4;
    $("#editor").focus();
  }
  function hintsAvailable() {
    const att = S.attempts[cur.id] || 0, secs = (Date.now() - startT) / 1000, m = mastery(cur.topic);
    const fast = m < 0.3 ? 0.5 : 1; // adaptativo: si te cuesta, las pistas llegan antes
    let n = 1; if (att >= 1 * fast || secs > 90 * fast) n = 2; if (att >= 2 * fast || secs > 180 * fast) n = 3;
    return n;
  }
  function renderHints() {
    if (!cur || !$("#scr-level").classList.contains("show")) return;
    const used = S.hintsUsed[cur.id] || 0, avail = hintsAvailable();
    $("#hints").innerHTML = cur.hints.map((h, i) => i < used ? `<li class="open">${esc(h)}</li>` : i < avail ? `<li><button class="btn ghost sm" data-hint="${i}">🔓 Revelar pista ${i + 1} (−10% XP)</button></li>` : `<li class="dim">🔒 Pista ${i + 1}: se desbloquea con más intentos o tiempo</li>`).join("");
  }
  $("#hints").addEventListener("click", e => { const b = e.target.closest("[data-hint]"); if (!b) return; S.hintsUsed[cur.id] = Math.max(S.hintsUsed[cur.id] || 0, +b.dataset.hint + 1); save(); renderHints(); beep([440]); });
  $("#solutionBtn").onclick = () => { if (!confirm("¿Ver la solución? Completar el nivel así no dará XP, pero aprenderás de ella.")) return; S.hintsUsed[cur.id] = 99; $("#editor").value = cur.solution; updateGutter(); save(); };
  $("#resetCode").onclick = () => { if (confirm("¿Restaurar el código inicial?")) { $("#editor").value = cur.starter; updateGutter(); } };
  $("#backMap").onclick = () => { clearInterval(hintTimer); renderMap(); };

  /* ---------------- EDITOR (ligero) ---------------- */
  const ed = $("#editor");
  function updateGutter() { const n = ed.value.split("\n").length; $("#gutter").textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n"); }
  ed.addEventListener("input", () => { updateGutter(); if (cur) { S.code[cur.id] = ed.value; save(); } });
  ed.addEventListener("scroll", () => { $("#gutter").scrollTop = ed.scrollTop; });
  ed.addEventListener("keydown", e => {
    if (e.key === "Tab") { e.preventDefault(); const s = ed.selectionStart, en = ed.selectionEnd; ed.setRangeText("    ", s, en, "end"); updateGutter(); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    else if (e.key === "Enter") { // auto-indentación
      const s = ed.selectionStart, line = ed.value.slice(0, s).split("\n").pop(); let ind = line.match(/^\s*/)[0]; if (/:\s*$/.test(line)) ind += "    ";
      e.preventDefault(); ed.setRangeText("\n" + ind, s, ed.selectionEnd, "end"); updateGutter();
    }
  });

  /* ---------------- EJECUTAR = COMBATE ---------------- */
  $("#runBtn").onclick = () => run();
  let running = false;
  async function run() {
    if (running || !cur) return; running = true; $("#runBtn").disabled = true;
    const ch = challengeOn(cur), tests = cur.tests.concat(ch ? cur.extra : []);
    $("#console").innerHTML = `<span class="dim">⚙️ Ejecutando…</span>`;
    const r = await runPython(ed.value, tests, cur.packages);
    running = false; $("#runBtn").disabled = false;
    S.attempts[cur.id] = (S.attempts[cur.id] || 0) + 1;
    if (!r.ok) { $("#console").innerHTML = `<div class="err">${esc(r.error)}</div>`; shake(); beep([200, 150], "sawtooth"); save(); return; }
    const res = JSON.parse(r.json);
    let html = res.stdout ? `<div class="out"><b>Salida:</b>\n${esc(res.stdout)}</div>` : "";
    if (res.error) {
      html += `<div class="err">💥 ${esc(res.error)}</div>`; $("#console").innerHTML = html; shake(); beep([200, 150], "sawtooth");
      updateMastery(cur.topic, false); save(); renderHints(); $("#solutionBtn").hidden = S.attempts[cur.id] < 4; return;
    }
    // animación de combate: cada test pasa = golpe
    const n = res.results.length; let alive = n;
    html += `<ul class="tests">`;
    res.results.forEach(([name, ok, msg]) => { html += `<li class="${ok ? "pass" : "fail"}">${ok ? "⚔️" : "🛡️"} ${esc(name)}${ok ? "" : ` — <span>${esc(msg)}</span>`}</li>`; });
    html += `</ul>`;
    $("#console").innerHTML = html;
    for (const [i, [, ok]] of res.results.entries()) {
      await new Promise(r => setTimeout(r, 220));
      if (ok) { alive--; hit(); } else miss();
      $("#hpFill").style.width = (alive / n * 100) + "%"; $("#hpText").textContent = `${alive}/${n}`;
    }
    const passed = res.results.every(x => x[1]);
    updateMastery(cur.topic, passed, S.attempts[cur.id], (S.hintsUsed[cur.id] || 0) > 0);
    if (!passed) $("#console").insertAdjacentHTML("beforeend", `<div class="row"><button class="btn ghost sm" id="askAI">🤖 Pedir explicación a Claude (sin darte la solución)</button></div>`);
    if (passed) victory(res.quality, ch); else { $("#console").insertAdjacentHTML("beforeend", `<div class="dim">El enemigo resiste. Revisa los tests fallidos. ${hintsAvailable() > (S.hintsUsed[cur.id] || 0) ? "Hay una pista disponible." : ""}</div>`); renderHints(); $("#solutionBtn").hidden = S.attempts[cur.id] < 4; }
    save(); hud();
  }
  document.addEventListener("click", async e => {
    if (!e.target.closest("#askAI") || !cur) return;
    const tmp = document.createElement("div"); tmp.innerHTML = cur.theory + "<br>" + cur.task; const plain = tmp.textContent;
    const prompt = `Eres mi tutor de Python de nivel universitario. NO me des la solución completa: explícame el concepto, señala el error concreto y dame una pista socrática.\n\n## Nivel: ${cur.title} (${cur.topic})\n${plain}\n\n## Mi código\n\`\`\`python\n${ed.value}\n\`\`\`\n\n## Resultado de los tests\n${$("#console").innerText.slice(0, 1500)}`;
    try { await navigator.clipboard.writeText(prompt); } catch {}
    window.open("https://claude.ai/new?q=" + encodeURIComponent(prompt.slice(0, 6000)), "_blank", "noopener");
    toast("📋 Pregunta copiada; se abrió Claude");
  });
  function hit() { const f = $(".foe"); f.classList.remove("hit"); void f.offsetWidth; f.classList.add("hit"); beep([660, 880], "square", 0.05); burst(f, "#ffd60a"); }
  function miss() { beep([180], "triangle", 0.1); }
  function shake() { const el = $("#scr-level"); el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }
  function burst(el, color) {
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 14; i++) { const p = document.createElement("i"); p.className = "spark"; p.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;background:${color};--dx:${(Math.random() - .5) * 160}px;--dy:${(Math.random() - .5) * 160}px`; document.body.appendChild(p); setTimeout(() => p.remove(), 700); }
  }
  function victory(quality, ch) {
    const prev = S.done[cur.id], att = S.attempts[cur.id], hints = S.hintsUsed[cur.id] || 0;
    const base = cur.boss ? 250 : 100 + cur.world * 10;
    let xp = hints >= 99 ? 0 : Math.round(base * (1 - 0.1 * Math.min(3, hints)) * (ch ? 1.5 : 1) * (quality.stars / 3 * 0.4 + 0.6) * (prev ? 0.3 : 1));
    S.xp += xp;
    const stars = hints >= 99 ? 1 : quality.stars;
    S.done[cur.id] = { at: Date.now(), stars: Math.max(stars, prev?.stars || 0), reviews: prev ? (prev.reviews || 0) + 1 : 0, attempts: att };
    // racha diaria
    const td = todayStr(); if (S.lastDay !== td) { const y = new Date(Date.now() - DAY).toISOString().slice(0, 10); S.streak = S.lastDay === y ? S.streak + 1 : 1; S.lastDay = td; }
    S.attempts[cur.id] = 0; S.hintsUsed[cur.id] = 0;
    save(); hud(); checkAch();
    beep([523, 659, 784, 1047], "square", 0.1, 0.06);
    $("#victory").innerHTML = `<div class="vic-box"><h2>${cur.boss ? "👑 ¡JEFE DERROTADO!" : "⚔️ ¡VICTORIA!"}</h2>
      <div class="stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>
      <p>+${xp} XP${ch ? " · 🔥 bonus modo reto" : ""}${prev ? " · (repaso)" : ""}</p>
      ${quality.notes.length ? `<div class="qnotes"><b>Revisión de buenas prácticas:</b><ul>${quality.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : `<p class="ok">Código limpio: type hints, docstrings y PEP 8 ✓</p>`}
      <details><summary>Ver solución de referencia</summary><pre>${esc(cur.solution)}</pre></details>
      <div class="row"><button class="btn" id="vNext">Siguiente ▶</button><button class="btn ghost" id="vMap">Mapa</button></div></div>`;
    $("#victory").hidden = false;
    $("#vNext").onclick = () => { $("#victory").hidden = true; const n = nextRecommended(); n ? openLevel(n.id) : renderMap(); };
    $("#vMap").onclick = () => { $("#victory").hidden = true; renderMap(); };
  }

  /* ---------------- LOGROS ---------------- */
  const ACH = [
    ["first", "🐣", "Hola, mundo", () => Object.keys(S.done).length >= 1],
    ["w1", "🌱", "Fundamentos sólidos", () => isDone("1-B")], ["w4", "🗼", "Pythonista", () => isDone("4-B")],
    ["w5", "🌀", "Algoritmista", () => isDone("5-B")], ["w7", "🤖", "ML desde cero", () => isDone("7-B")],
    ["w8", "🧠", "Attention is all you need", () => isDone("8-B")],
    ["clean", "✨", "Código impecable (10 niveles ★★★)", () => Object.values(S.done).filter(d => d.stars >= 3).length >= 10],
    ["streak7", "🔥", "Racha de 7 días", () => S.streak >= 7]
  ];
  function checkAch() { ACH.forEach(([id, ic, name, t]) => { if (!S.achievements[id] && t()) { S.achievements[id] = Date.now(); toast(`🏆 Logro: ${ic} ${name}`, "gold"); } }); save(); }

  /* ---------------- FONDO ANIMADO (lluvia de código) ---------------- */
  const bg = $("#bg"), bx = bg.getContext("2d"); let cols = [];
  const glyphs = "def class yield lambda async await import numpy attention softmax ∇ Σ λ θ ψ".split(" ");
  function bgSize() { bg.width = innerWidth; bg.height = innerHeight; cols = Array.from({ length: Math.ceil(innerWidth / 70) }, () => ({ y: Math.random() * innerHeight, v: 20 + Math.random() * 50, g: glyphs[Math.floor(Math.random() * glyphs.length)] })); }
  addEventListener("resize", bgSize); bgSize();
  let lt = performance.now();
  (function loop(t) { const dt = (t - lt) / 1000; lt = t; bx.fillStyle = "rgba(7,8,20,0.25)"; bx.fillRect(0, 0, bg.width, bg.height); bx.font = "14px monospace";
    cols.forEach((c, i) => { c.y += c.v * dt; if (c.y > bg.height + 20) { c.y = -20; c.g = glyphs[Math.floor(Math.random() * glyphs.length)]; } bx.fillStyle = i % 3 ? "rgba(76,201,240,0.35)" : "rgba(199,125,255,0.35)"; bx.fillText(c.g, i * 70 + 10, c.y); });
    requestAnimationFrame(loop); })(lt);

  /* ---------------- INICIO ---------------- */
  $("#recBtn").onclick = () => { const id = $("#recBtn").dataset.lv; if (id) openLevel(id); };
  $("#soundBtn").onclick = () => { S.sound = !S.sound; save(); $("#soundBtn").textContent = S.sound ? "🔊" : "🔇"; };
  $("#soundBtn").textContent = S.sound ? "🔊" : "🔇";
  $("#homeBtn").onclick = () => renderMap();
  $("#resetAll").onclick = () => { if (confirm("¿Borrar TODO tu progreso?")) { localStorage.removeItem(KEY); location.reload(); } };
  setPy("Python se cargará al ejecutar tu primer programa");
  renderMap();
  // precarga Python en segundo plano tras 2s para que el primer ▶ sea rápido
  setTimeout(() => { if (!worker) { makeWorker(); worker.postMessage({ id: -1, code: "", tests: [], packages: [] }); } }, 1500);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  window.__PQ = { S, LEVELS, openLevel, runPython };
})();
