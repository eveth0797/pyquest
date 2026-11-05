/* =========================================================
   PYQUEST — Worker de Python (Pyodide)
   Ejecuta el código del jugador aislado del hilo principal.
   Si un programa se cuelga (bucle infinito), app.js termina
   este worker y crea uno nuevo (timeout).
   Mensaje de entrada: { id, code, tests: [[nombre, código]], packages: [] }
   Respuesta: { id, ok, json } donde json = resultado del harness Python
   ========================================================= */
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
let pyReady = null;
const loaded = new Set();

const HARNESS = String.raw`
import sys, io, json, ast, re, traceback

def _pq_clean_tb(e):
    tb = e.__traceback__
    line = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == "<tu_codigo>":
            line = tb.tb_lineno
        tb = tb.tb_next
    msg = "".join(traceback.format_exception_only(type(e), e)).strip()
    return (f"Línea {line}: " if line else "") + msg

def _pq_quality(code):
    """Revisión de buenas prácticas con AST. Devuelve estrellas (1-3) y notas."""
    notes, good = [], 0
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return {"stars": 0, "notes": ["Error de sintaxis"]}
    funcs = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and not n.name.startswith("_")]
    if funcs:
        hinted = sum(1 for f in funcs if f.returns is not None or any(a.annotation for a in f.args.args))
        if hinted == len(funcs): good += 1
        else: notes.append("Añade type hints a tus funciones públicas.")
        documented = sum(1 for f in funcs if ast.get_docstring(f))
        if documented: good += 1
        else: notes.append("Ninguna función tiene docstring.")
        bad_names = [f.name for f in funcs if not re.fullmatch(r"[a-z_][a-z0-9_]*", f.name)]
        if bad_names: notes.append("Usa snake_case: " + ", ".join(bad_names[:3]))
    else:
        good += 2
    for n in ast.walk(tree):
        if isinstance(n, ast.ExceptHandler) and n.type is None:
            notes.append("Evita 'except:' desnudo; captura excepciones concretas."); good -= 1; break
    for n in ast.walk(tree):
        if isinstance(n, ast.Global):
            notes.append("Evita 'global': pasa parámetros y devuelve valores."); good -= 1; break
    for n in ast.walk(tree):
        if isinstance(n, ast.Compare) and any(isinstance(c, ast.Constant) and c.value is None for c in n.comparators) and any(isinstance(o, (ast.Eq, ast.NotEq)) for o in n.ops):
            notes.append("Compara con None usando 'is' / 'is not'."); good -= 1; break
    for n in ast.walk(tree):
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "range" and n.args and isinstance(n.args[0], ast.Call) and getattr(n.args[0].func, "id", "") == "len":
            notes.append("Prefiere enumerate() a range(len(...))."); break
    long_lines = sum(1 for l in code.splitlines() if len(l) > 99)
    if long_lines: notes.append(f"{long_lines} línea(s) de más de 99 caracteres (PEP 8).")
    else: good += 1
    stars = max(1, min(3, good))
    return {"stars": stars, "notes": notes}

def _pq_run(user_code, tests_json):
    tests = json.loads(tests_json)
    out = io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = out
    res = {"error": None, "results": []}
    ns = {"__name__": "__main__"}
    try:
        exec(compile(user_code, "<tu_codigo>", "exec"), ns)
    except BaseException as e:
        res["error"] = _pq_clean_tb(e)
    if not res["error"]:
        for name, code in tests:
            try:
                exec(compile(code, "<test>", "exec"), dict(ns))
                res["results"].append([name, True, ""])
            except AssertionError as e:
                res["results"].append([name, False, str(e) or "La comprobación no se cumplió"])
            except BaseException as e:
                res["results"].append([name, False, _pq_clean_tb(e)])
    sys.stdout, sys.stderr = old_out, old_err
    res["stdout"] = out.getvalue()[-4000:]
    res["quality"] = _pq_quality(user_code)
    return json.dumps(res)
`;

async function boot() {
  importScripts(PYODIDE_URL + "pyodide.js");
  const py = await loadPyodide({ indexURL: PYODIDE_URL });
  py.runPython(HARNESS);
  return py;
}

self.onmessage = async (ev) => {
  const { id, code, tests, packages } = ev.data;
  try {
    if (!pyReady) { pyReady = boot(); self.postMessage({ status: "loading" }); }
    const py = await pyReady;
    for (const p of packages || []) if (!loaded.has(p)) { self.postMessage({ status: "pkg", pkg: p }); await py.loadPackage(p); loaded.add(p); }
    const run = py.globals.get("_pq_run");
    const json = run(code, JSON.stringify(tests));
    run.destroy && run.destroy();
    self.postMessage({ id, ok: true, json });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message || e) });
  }
};
