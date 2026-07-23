# Gizmo Tool

A 3D transform gizmo built with a **C++ core compiled to WebAssembly**, rendered in the browser with **Three.js**. The interaction and transform math live in C++; JavaScript handles rendering and input. This mirrors how real web-based 3D and CAD tools are architected - a native-speed core with a thin presentation layer on top.

**[Live demo →](https://khalidHsoliman.github.io/gizmo-tool/)**

## Controls

Drag the colored handles to transform the cube; orbit the camera by dragging empty space.

| Key | Mode | Handles |
| --- | --- | --- |
| `W` | Move | Arrows — drag to translate along an axis |
| `E` | Rotate | Rings — drag to rotate about an axis |
| `R` | Scale | Box-tipped stems — drag to scale along an axis |
| `Q` | Toggle space | Switches the handles between **world** (axis-aligned) and **local** (follows the cube's orientation) |

Axes follow the standard convention: **X = red, Y = green, Z = blue**.

## Why this architecture

The C++ core has zero dependency on Three.js or the browser. It receives rays and transforms as plain data, does the geometry, and returns a new transform - meaning it could drive any renderer or run in any environment. Three.js unprojects the mouse into a world-space ray and hands it across the WebAssembly boundary; only a handful of floats cross per frame, never scene data.

## Tech stack

- **C++** interaction logic and transform math
- **Emscripten** compiles the C++ to WebAssembly
- **Three.js** WebGL rendering, camera, input
- **Vite** dev server and production build
- **GitHub Pages** hosting

## Running locally

Requires [Node.js](https://nodejs.org/) and the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html).

```bash
# install dependencies
npm install

# compile the C++ core to WebAssembly
npm run build:wasm

# start the dev server
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Project status

- [x] C++ → WASM → Three.js pipeline, deployed live
- [x] Draggable translate axis
- [x] Three-axis translate
- [x] Rotate and scale modes
- [x] Local / world space toggle

## License

MIT