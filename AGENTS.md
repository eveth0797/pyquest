# Guía de desarrollo de PyQuest (para LLMs y personas)

Lee este archivo completo antes de modificar el proyecto. Está escrito para que cualquier asistente de IA pueda continuar el desarrollo sin contexto previo.

## 1. Qué es
Juego web estático (HTML/CSS/JS sin build) para aprender Python. Cada nivel se vence escribiendo código que pase tests ejecutados con **Pyodide** (CPython compilado a WebAssembly) dentro de un **Web Worker**. Se publica con GitHub Pages y es una PWA.

## 2. Mapa de archivos
| Archivo | Responsabilidad |
|---|---|
| `index.html` | Estructura: header (XP, racha), pantalla `#scr-map` (mundos y panel adaptativo) y `#scr-level` (teoría, editor, consola, enemigo), modal `#victory`. |
| `css/style.css` | Estilos. Variables en `:root`. `--wc` = color del mundo actual. **Regla importante:** `[hidden]{display:none!important}` evita que los overlays con `display:grid` bloqueen los clics. |
| `js/levels.js` | **Todo el contenido.** `window.PQ_WORLDS` (8 mundos) y `window.PQ_LEVELS` (36 niveles, en orden de progresión). |
| `js/app.js` | Lógica: estado, desbloqueo, maestría adaptativa, pistas, worker, combate, victoria, logros, fondo animado. |
| `js/worker.js` | Carga Pyodide desde jsDelivr (`PYODIDE_URL`), define el harness Python `_pq_run` y la revisión de buenas prácticas `_pq_quality` (AST). |
| `sw.js` | Service worker: cachea la app y los archivos de Pyodide (offline después de la primera carga). Sube `C = "pyquest-vN"` al cambiar archivos cacheados. |
| `tools/verify_levels.py` | Verifica que cada `solution` pase sus `tests` + `extra`. **Ejecútalo siempre después de editar niveles.** |

## 3. Esquema de un nivel (`js/levels.js`)
```js
{ id: "8-2",            // "<mundo>-<n>" o "<mundo>-B" para el jefe
  world: 8, title: "…", topic: "attention",   // topic agrupa la maestría adaptativa
  boss: true,           // opcional; el jefe exige todos los niveles del mundo
  packages: ["numpy"],  // opcional; paquetes de Pyodide a cargar
  story: "texto narrativo", theory: "<p>HTML con teoría y fórmulas</p>",
  task: "HTML: qué debe implementar el jugador",
  starter: "código inicial",
  tests: [["descripción visible", "código Python con assert"], …],
  extra: [[…]],         // tests del modo reto (casos límite)
  hints: ["pista 1", "pista 2", "pista 3"],   // siempre 3, de vaga a casi-solución
  solution: "solución de referencia (con buenas prácticas)",
  practice: "una buena práctica concreta" }
```
**Reglas para tests:**
- Cada test se ejecuta en una **copia** del namespace del jugador (`dict(ns)`), así que los tests no se contaminan entre sí.
- Usa `assert cond, "mensaje útil"`: el mensaje se muestra al jugador.
- Para excepciones usa `try/except TipoEsperado` y `assert False` dentro del `try`.
- Los tests aleatorios deben tener semilla (`np.random.default_rng(0)`) o márgenes amplios. Si un test es estocástico, evalúalo con varias semillas (mira el nivel 7-3).
- Los tests de rendimiento deben correr en menos de ~2 s en un PC normal; Pyodide es 2-5 veces más lento.
- Las cadenas JS usan comillas dobles: escapa `\n` y `\"` correctamente. Dentro de `String.raw` (worker) no hace falta escapar.

## 4. Flujo de ejecución
1. `app.js → runPython(code, tests, packages)` envía `{id, code, tests, packages}` al worker.
2. El worker carga Pyodide (la primera vez), los paquetes y llama a `_pq_run(code, json_tests)`.
3. `_pq_run` ejecuta el código con `compile(..., "<tu_codigo>")`, corre cada test y devuelve JSON con `{error, results:[[nombre, ok, msg]], stdout, quality:{stars, notes}}`.
4. Timeout: 90 s en la primera carga (+60 s si hay que cargar paquetes nuevos) y 15 s después. Si se excede, se hace `worker.terminate()` y se crea uno nuevo.
5. `run()` anima el combate (un golpe por test), actualiza la maestría y, si todo pasa, llama a `victory()`.

## 5. Motor adaptativo (`app.js`)
- `S.mastery[topic]` ∈ [0,1], con 0.2 por defecto. Al aprobar: `m += (1−m)·0.4/(1+0.4·(intentos−1))·(0.6 si usó pistas)`. Al fallar: `m −= 0.06·m`.
- `challengeOn(lv)`: si hay `extra` y la maestría es ≥ 0.55, se añaden esos tests (+50% XP).
- `hintsAvailable()`: pista 2 con ≥1 intento o 90 s; pista 3 con ≥2 intentos o 180 s. Si la maestría es < 0.3, los umbrales se reducen a la mitad.
- `reviewQueue()`: intervalos de 1/3/7/14/30 días según `reviews` (×1.5 si tuvo ★★★), o maestría < 0.45.
- XP = base × (1 − 0.1·pistas) × (1.5 si reto) × (0.6 + 0.4·estrellas/3) × (0.3 si es repaso). Base 100 + 10·mundo, o 250 para un jefe.

## 6. Estado persistente
`localStorage["pyquest.v1"]`: `{xp, done:{id:{at,stars,reviews,attempts}}, code:{id:código}, attempts, hintsUsed, mastery, streak, lastDay, achievements, sound}`. Si cambias el formato, migra los datos en la carga de `S`; no cambies la clave a la ligera.

## 7. Cómo probar
- `python3 tools/verify_levels.py`: contenido.
- Navegador: `python3 -m http.server` y abre la página. `window.__PQ` expone `{S, LEVELS, openLevel, runPython}` para depurar. Por ejemplo, `__PQ.runPython(code, tests, ["numpy"])`.
- Pruebas E2E con Playwright: intercepta `**/pyodide/v0.26.4/full/**` y sirve los archivos de `npm i pyodide@0.26.4` si no hay acceso a jsDelivr. NumPy necesita la CDN real.

## 8. Ideas pendientes (roadmap)
1. **Más niveles**: async/await, multiprocessing, regex, testing con pytest, typing avanzado (Protocol, ParamSpec), metaclases y descriptores, SQL con sqlite3, árboles y tries, union-find, flujo máximo, autograd mínimo (motor de gradientes escalar tipo micrograd), CNN 1D, RNN, optimizadores Adam/RMSProp, tokenización BPE, entrenamiento de un mini-GPT de caracteres, RL (Q-learning tabular y PPO con máscaras).
2. **Editor**: resaltado de sintaxis (CodeMirror 6 desde CDN con versión fija) manteniendo la API `#editor.value`.
3. **Explicación del error con LLM**: botón que copie código, error y teoría y abra claude.ai (patrón del "Oráculo" de Life Quest).
4. **Modo examen**: niveles cronometrados sin pistas.
5. **Gráficas en niveles de ML**: dibujar curvas de pérdida devolviendo listas desde Python y pintándolas en un canvas.
6. Exportar e importar el progreso en JSON.

## 9. Convenciones
- Interfaz y contenido en **español**; nombres de funciones del jugador en español con snake_case.
- Sin frameworks ni build. Scripts externos solo desde CDN con versión fija.
- Commits pequeños, con mensajes en español que describan el cambio.
