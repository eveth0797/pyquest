# 🐍 PyQuest

> **Videojuego para aprender Python profundo, a nivel universitario: la única forma de vencer cada nivel es escribir un programa correcto.**

De los fundamentos a los **Transformers**: estructuras de datos, POO, generadores, decoradores, algoritmos, NumPy, álgebra lineal, Machine Learning desde cero, backpropagation, **attention** y **multi-head attention**, con la matemática detrás de cada concepto.

Python real se ejecuta **en tu navegador** (Pyodide/WebAssembly). No hace falta instalar nada. Funciona en PC y en el celular, e instalado como app (PWA).

## 🎮 Cómo se juega
1. Elige un nivel en el mapa. Lee la **historia**, la **teoría** y la **misión**.
2. Escribe tu código en el editor y pulsa **▶ Ejecutar** (Ctrl+Enter).
3. Cada **test** que pasa le quita vida al enemigo. Si todos pasan, **victoria**.
4. Una **revisión automática de buenas prácticas** (con AST) te da de 1 a 3 ★: type hints, docstrings, PEP 8, `is None`, nada de `except:` desnudo ni `global`, `enumerate` en lugar de `range(len())`…
5. Vence a los niveles de un mundo para enfrentarte a su **jefe**. Cada jefe desbloquea el siguiente mundo.

## 🗺️ Mundos (36 niveles)
| # | Mundo | Temas |
|---|---|---|
| 1 | 🌱 Bosque de los Fundamentos | funciones, control de flujo, recursión y memoización, strings, Counter |
| 2 | 🏰 Ciudadela de las Estructuras | comprensiones, hashing, deque y ventana deslizante O(n), caché LRU |
| 3 | ⚒️ Forja de Objetos | métodos dunder, ABC y polimorfismo, dataclasses inmutables |
| 4 | 🗼 Torre Pythónica | generadores, decoradores con argumentos, context managers, tipado y genéricos |
| 5 | 🌀 Laberinto Algorítmico | búsqueda binaria, programación dinámica, Dijkstra, merge sort e inversiones |
| 6 | 🧮 Matriz de NumPy | vectorización, broadcasting, mínimos cuadrados, PCA con SVD |
| 7 | 🤖 Valle del Aprendizaje | descenso de gradiente, regresión logística estable, k-means++, **autograd (micrograd)**, **Adam**, red neuronal con backprop (XOR) |
| 8 | 🧠 Santuario de la Atención | softmax estable, scaled dot-product attention con máscara causal, codificación posicional, LayerNorm, entropía cruzada y su gradiente, muestreo con temperatura y top-k, tokenización BPE, **multi-head attention** |

## 🧠 Aprendizaje adaptativo
- **Maestría por tema (0-100%)**: sube al vencer con pocos intentos y sin pistas, y baja un poco con los errores.
- **🔥 Modo reto**: con maestría ≥ 55% se añaden tests extra de casos límite y das +50% de XP.
- **Pistas progresivas**: se desbloquean con intentos o tiempo, y **antes si el tema te cuesta**. Cada pista usada resta 10% de XP. Tras 4 intentos puedes ver la solución (sin XP).
- **Repaso espaciado**: los niveles vuelven a la cola a los 1-3-7-14-30 días o cuando tu maestría en el tema baja.
- **Protección contra bucles infinitos**: Python corre en un Web Worker con límite de tiempo y se reinicia solo.

## 🚀 Publicar
**Settings → Pages → Deploy from a branch → `main` / root** → `https://eveth0797.github.io/pyquest/`.
En el celular: abre el enlace → **Agregar a pantalla de inicio**.

Local: `python3 -m http.server` en esta carpeta → `http://localhost:8000` (necesita internet para descargar Pyodide la primera vez).

## 🧪 Verificar los niveles
```bash
python3 tools/verify_levels.py
```
Ejecuta la solución de referencia de cada nivel contra sus tests (requiere `node` y `numpy`).

Guía para desarrolladores y LLMs: **[AGENTS.md](AGENTS.md)**.
