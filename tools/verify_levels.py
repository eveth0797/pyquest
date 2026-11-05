"""Verifica que cada solución de js/levels.js pase sus tests (y los extra).
Uso: python3 tools/verify_levels.py   (requiere node y numpy)"""
import json, subprocess, sys, io, contextlib, time
src = subprocess.run(["node", "-e", "global.window={};require('./js/levels.js');console.log(JSON.stringify(window.PQ_LEVELS))"],
                     capture_output=True, text=True, check=True).stdout
levels = json.loads(src)
fail = 0
for lv in levels:
    ns = {"__name__": "__main__"}
    t0 = time.time()
    try:
        exec(lv["solution"], ns)
        for name, code in lv["tests"] + lv.get("extra", []):
            exec(code, dict(ns))
        print(f"OK   {lv['id']:5} {lv['title']}  ({time.time()-t0:.2f}s)")
    except Exception as e:
        fail += 1
        print(f"FAIL {lv['id']:5} {lv['title']}: {type(e).__name__}: {e}")
print(f"\n{len(levels)-fail}/{len(levels)} niveles verificados")
sys.exit(1 if fail else 0)
