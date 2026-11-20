# Gizmo Tool

A 3D transform gizmo written in **TypeScript** and rendered in the browser with **Three.js**. The interaction and transform math live in a small, dependency-free TypeScript core; Three.js handles rendering and input. This mirrors how real web-based 3D and CAD tools are architected - a renderer-agnostic math core with a thin presentation layer on top.

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

The core ([`src/core.ts`](src/core.ts)) has zero dependency on Three.js or the browser. It receives rays and axes as plain numbers, does the geometry, and returns plain numbers - meaning it could drive any renderer or run in any environment, and it is unit-tested in plain Node. Three.js unprojects the mouse into a world-space ray and passes its components to the core; only a handful of numbers go in and out per frame, never scene data. [`src/main.ts`](src/main.ts) owns everything else: the scene, the gizmo meshes, picking, and applying the results to the cube.

## Tech stack

- **TypeScript** interaction logic and transform math, plus the app glue
- **Three.js** WebGL rendering, camera, input
- **Vite** dev server and production build
- **Node's built-in test runner** for the core's unit tests
- **GitHub Pages** hosting

## Running locally

Requires [Node.js](https://nodejs.org/) **22.18 or newer** (developed on Node 24). Nothing else - no compiler toolchain. The tests run the `.ts` files directly through Node's built-in type stripping, which is enabled by default from Node 22.18 / 23.6.

```bash
# install dependencies
npm install

# start the dev server
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173/gizmo-tool/`).

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Type-check the project with `tsc` (no output files) |
| `npm test` | Run the core's unit tests (`src/*.test.ts`) with `node --test` |
| `npm run build` | Type-check, then build the production bundle into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run deploy` | Publish `dist/` to GitHub Pages (run `npm run build` first) |

## Project status

- [x] Math core → Three.js pipeline, deployed live
- [x] Draggable translate axis
- [x] Three-axis translate
- [x] Rotate and scale modes
- [x] Local / world space toggle
- [x] TypeScript port with unit-tested core

## License

[MIT](LICENSE)
