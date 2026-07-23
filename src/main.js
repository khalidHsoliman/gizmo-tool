import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

async function loadCore() {
  try {
    const createModule = (await import(/* @vite-ignore */ `${import.meta.env.BASE_URL}core.js`)).default;
    return await createModule();
  } catch (err) {
    console.error('[gizmo] Could not load core.js — did you run `npm run build:wasm`?', err);
    return null;
  }
}

async function main() {
  const core = await loadCore();

  // --- scene ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14141a);

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(3, 3, 4);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x6699ff })
  );
  scene.add(cube);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(5, 10, 7);
  scene.add(dir);

  // --- gizmo ---
  // Two widgets share one set of axes: arrows for translate, rings for rotate.
  // Each handle mesh is tagged with { dir, mat, color } so a raycast hit tells
  // us which axis was grabbed and how to recolor it.
  const HOT_COLOR = 0xffd24a; // highlight when an axis is hovered/dragged
  const AXES = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xff5566 }, // X — red
    { dir: new THREE.Vector3(0, 1, 0), color: 0x66dd66 }, // Y — green
    { dir: new THREE.Vector3(0, 0, 1), color: 0x5588ff }, // Z — blue
  ];

  const tagHandle = (mesh, dir, mat, color) => {
    mesh.userData.h = { dir, mat, color };
    mesh.renderOrder = 1; // draw on top of the cube
  };

  // Translate arrows (modeled along +Y, then aimed down each axis).
  const UP = new THREE.Vector3(0, 1, 0);
  const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 12);
  const headGeo = new THREE.ConeGeometry(0.06, 0.18, 16);
  const translateGizmo = new THREE.Group();
  const translateHandles = [];
  for (const ax of AXES) {
    const mat = new THREE.MeshBasicMaterial({ color: ax.color, depthTest: false });
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(shaftGeo, mat);
    shaft.position.y = 0.45;
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 0.98;
    arrow.add(shaft, head);
    arrow.quaternion.setFromUnitVectors(UP, ax.dir);
    tagHandle(shaft, ax.dir, mat, ax.color);
    tagHandle(head, ax.dir, mat, ax.color);
    translateHandles.push(shaft, head);
    translateGizmo.add(arrow);
  }

  // Rotate rings (a torus's normal is +Z by default; aim it down each axis).
  const FWD = new THREE.Vector3(0, 0, 1);
  const ringGeo = new THREE.TorusGeometry(0.9, 0.03, 10, 64);
  const rotateGizmo = new THREE.Group();
  const rotateHandles = [];
  for (const ax of AXES) {
    const mat = new THREE.MeshBasicMaterial({ color: ax.color, depthTest: false });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.quaternion.setFromUnitVectors(FWD, ax.dir);
    tagHandle(ring, ax.dir, mat, ax.color);
    rotateHandles.push(ring);
    rotateGizmo.add(ring);
  }

  scene.add(translateGizmo, rotateGizmo);
  const syncGizmos = () => {
    translateGizmo.position.copy(cube.position);
    rotateGizmo.position.copy(cube.position);
  };
  syncGizmos();

  // --- mode toggle (W = move, E = rotate) ---
  const hint = document.createElement('div');
  hint.style.cssText =
    'position:fixed;left:12px;bottom:12px;font:13px/1.4 system-ui,sans-serif;' +
    'color:#cbd0da;background:rgba(20,20,26,.6);padding:6px 10px;border-radius:6px;' +
    'user-select:none;pointer-events:none';
  document.body.appendChild(hint);

  let mode = 'translate';
  const applyMode = () => {
    translateGizmo.visible = mode === 'translate';
    rotateGizmo.visible = mode === 'rotate';
    hint.textContent = `[W] Move   [E] Rotate   —   ${mode === 'translate' ? 'MOVE' : 'ROTATE'}`;
  };
  applyMode();

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w') { mode = 'translate'; applyMode(); }
    else if (k === 'e') { mode = 'rotate'; applyMode(); }
  });

  // --- interaction ---
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const startPos = new THREE.Vector3();
  const startQuat = new THREE.Quaternion();
  let active = null;   // the grabbed handle's { dir, mat, color }, or null
  let startT = 0;      // translate: axis position at drag start
  let prevAngle = 0;   // rotate: last frame's angle (for wrap-safe deltas)
  let accumAngle = 0;  // rotate: total angle turned this drag

  const setPointer = (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  };

  const modeHandles = () => (mode === 'translate' ? translateHandles : rotateHandles);
  const pick = () => {
    const hit = raycaster.intersectObjects(modeHandles(), false)[0];
    return hit ? hit.object.userData.h : null;
  };

  const paintIdle = () => {
    for (const m of [...translateHandles, ...rotateHandles]) {
      const h = m.userData.h;
      h.mat.color.set(h.color);
    }
  };

  // C++ bridge — a specific axis + the current mouse ray, both are 12 floats in.
  const r = () => raycaster.ray;
  const axisT = (d, o) =>
    core.axisClosestT(r().origin.x, r().origin.y, r().origin.z,
      r().direction.x, r().direction.y, r().direction.z,
      o.x, o.y, o.z, d.x, d.y, d.z);
  const axisAngle = (d, o) =>
    core.axisAngle(r().origin.x, r().origin.y, r().origin.z,
      r().direction.x, r().direction.y, r().direction.z,
      o.x, o.y, o.z, d.x, d.y, d.z);

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!core) return;
    setPointer(e);
    const h = pick();
    if (!h) return;
    active = h;
    controls.enabled = false;
    startPos.copy(cube.position); // axis origin stays fixed for the whole drag
    if (mode === 'translate') {
      startT = axisT(active.dir, startPos);
    } else {
      startQuat.copy(cube.quaternion);
      prevAngle = axisAngle(active.dir, startPos);
      accumAngle = 0;
    }
    active.mat.color.set(HOT_COLOR);
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    setPointer(e);
    if (active && mode === 'translate') {
      const delta = axisT(active.dir, startPos) - startT;
      cube.position.copy(startPos).addScaledVector(active.dir, delta);
      syncGizmos();
    } else if (active) {
      const a = axisAngle(active.dir, startPos);
      if (Number.isNaN(a)) return;         // grazing the ring edge-on; skip frame
      if (Number.isNaN(prevAngle)) { prevAngle = a; return; }
      let d = a - prevAngle;
      if (d > Math.PI) d -= 2 * Math.PI;   // unwrap across the ±pi seam so a full
      else if (d < -Math.PI) d += 2 * Math.PI; // turn accumulates smoothly
      accumAngle += d;
      prevAngle = a;
      const dq = new THREE.Quaternion().setFromAxisAngle(active.dir, accumAngle);
      cube.quaternion.copy(startQuat).premultiply(dq); // world-space rotation
    } else if (core) {
      const h = pick();
      paintIdle();
      if (h) h.mat.color.set(HOT_COLOR);
      renderer.domElement.style.cursor = h ? 'grab' : 'auto';
    }
  });

  addEventListener('pointerup', () => {
    if (!active) return;
    active = null;
    controls.enabled = true;
    paintIdle();
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}

main();
