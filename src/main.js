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

  // --- gizmos ---
  // Three widgets share one set of axes: arrows (translate), rings (rotate),
  // box-tipped stems (scale). Each handle mesh is tagged with { dir, mat, color }
  // so a raycast hit tells us which axis was grabbed and how to recolor it.
  const HOT_COLOR = 0xffd24a; // highlight when an axis is hovered/dragged
  const AXES = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xff5566 }, // X — red
    { dir: new THREE.Vector3(0, 1, 0), color: 0x66dd66 }, // Y — green
    { dir: new THREE.Vector3(0, 0, 1), color: 0x5588ff }, // Z — blue
  ];

  const UP = new THREE.Vector3(0, 1, 0);  // arrows/stems are modeled along +Y
  const FWD = new THREE.Vector3(0, 0, 1); // a torus's normal is +Z by default

  const tagHandle = (mesh, dir, mat, color) => {
    mesh.userData.h = { dir, mat, color };
    mesh.renderOrder = 1; // draw on top of the cube
  };

  // Shared geometry — one copy each, reused across all three axes.
  const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 12);
  const headGeo = new THREE.ConeGeometry(0.06, 0.18, 16);
  const ringGeo = new THREE.TorusGeometry(0.9, 0.03, 10, 64);
  const nubGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);

  // Build one gizmo group from a per-axis mesh factory.
  const buildGizmo = (makeMeshes) => {
    const group = new THREE.Group();
    const handles = [];
    for (const ax of AXES) {
      const mat = new THREE.MeshBasicMaterial({ color: ax.color, depthTest: false });
      const holder = new THREE.Group();
      for (const mesh of makeMeshes(mat)) {
        tagHandle(mesh, ax.dir, mat, ax.color);
        handles.push(mesh);
        holder.add(mesh);
      }
      holder.quaternion.setFromUnitVectors(makeMeshes.up || UP, ax.dir);
      group.add(holder);
    }
    return { group, handles };
  };

  // Translate: cone-tipped arrow.
  const translate = buildGizmo((mat) => {
    const shaft = new THREE.Mesh(shaftGeo, mat); shaft.position.y = 0.45;
    const head = new THREE.Mesh(headGeo, mat); head.position.y = 0.98;
    return [shaft, head];
  });

  // Rotate: a ring in the plane perpendicular to the axis. The torus normal is
  // +Z, so this factory orients from FWD instead of UP.
  const rotate = buildGizmo(Object.assign((mat) => [new THREE.Mesh(ringGeo, mat)], { up: FWD }));

  // Scale: a stem capped with a small box (distinct from the translate cone).
  const scale = buildGizmo((mat) => {
    const stem = new THREE.Mesh(shaftGeo, mat); stem.position.y = 0.45;
    const nub = new THREE.Mesh(nubGeo, mat); nub.position.y = 0.95;
    return [stem, nub];
  });

  const GIZMOS = { translate, rotate, scale };
  scene.add(translate.group, rotate.group, scale.group);

  // --- mode + space state ---
  const hint = document.createElement('div');
  hint.style.cssText =
    'position:fixed;left:12px;bottom:12px;font:13px/1.4 system-ui,sans-serif;' +
    'color:#cbd0da;background:rgba(20,20,26,.6);padding:6px 10px;border-radius:6px;' +
    'user-select:none;pointer-events:none';
  document.body.appendChild(hint);

  const MODE_KEYS = { w: 'translate', e: 'rotate', r: 'scale' };
  let mode = 'translate';
  let space = 'world'; // 'world' = axis-aligned; 'local' = follows the cube

  const refreshUI = () => {
    for (const [name, g] of Object.entries(GIZMOS)) g.group.visible = name === mode;
    hint.textContent =
      `[W] Move   [E] Rotate   [R] Scale   [Q] Space: ${space.toUpperCase()}   —   ${mode.toUpperCase()}`;
  };
  refreshUI();

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (MODE_KEYS[k]) { mode = MODE_KEYS[k]; refreshUI(); }
    else if (k === 'q') { space = space === 'world' ? 'local' : 'world'; refreshUI(); }
  });

  // --- interaction ---
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const IDENTITY_Q = new THREE.Quaternion();
  const startPos = new THREE.Vector3();
  const startQuat = new THREE.Quaternion();
  const startScale = new THREE.Vector3();
  const dragAxis = new THREE.Vector3(); // grabbed axis, in world space, fixed for the drag
  let active = null;   // the grabbed handle's { dir, mat, color }, or null
  let startT = 0;      // translate/scale: axis position at drag start
  let prevAngle = 0;   // rotate: last frame's angle (for wrap-safe deltas)
  let accumAngle = 0;  // rotate: total angle turned this drag

  const setPointer = (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  };

  const pick = () => {
    const hit = raycaster.intersectObjects(GIZMOS[mode].handles, false)[0];
    return hit ? hit.object.userData.h : null;
  };

  const paintIdle = () => {
    for (const g of Object.values(GIZMOS)) {
      for (const m of g.handles) m.userData.h.mat.color.set(m.userData.h.color);
    }
  };

  // C++ bridge — a specific axis + the current mouse ray, both are 12 floats in.
  const ray = () => raycaster.ray;
  const call = (fn, d, o) =>
    core[fn](ray().origin.x, ray().origin.y, ray().origin.z,
      ray().direction.x, ray().direction.y, ray().direction.z,
      o.x, o.y, o.z, d.x, d.y, d.z);
  const axisT = (d, o) => call('axisClosestT', d, o);
  const axisAngle = (d, o) => call('axisAngle', d, o);

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!core) return;
    setPointer(e);
    const h = pick();
    if (!h) return;
    active = h;
    controls.enabled = false;
    startPos.copy(cube.position); // axis origin stays fixed for the whole drag

    // The C++ math is world-space. In local mode, rotate the grabbed axis by the
    // cube's current orientation to get its world direction; freeze it for the drag.
    dragAxis.copy(active.dir);
    if (space === 'local') dragAxis.applyQuaternion(cube.quaternion);
    dragAxis.normalize();

    if (mode === 'rotate') {
      startQuat.copy(cube.quaternion);
      prevAngle = axisAngle(dragAxis, startPos);
      accumAngle = 0;
    } else {
      startT = axisT(dragAxis, startPos); // translate & scale both need this
      if (mode === 'scale') startScale.copy(cube.scale);
    }
    active.mat.color.set(HOT_COLOR);
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    setPointer(e);
    if (active) {
      if (mode === 'translate') {
        const delta = axisT(dragAxis, startPos) - startT;
        cube.position.copy(startPos).addScaledVector(dragAxis, delta);
      } else if (mode === 'rotate') {
        const a = axisAngle(dragAxis, startPos);
        if (Number.isNaN(a)) return;         // grazing the ring edge-on; skip frame
        if (Number.isNaN(prevAngle)) { prevAngle = a; return; }
        let d = a - prevAngle;
        if (d > Math.PI) d -= 2 * Math.PI;   // unwrap across the ±pi seam so a full
        else if (d < -Math.PI) d += 2 * Math.PI; // turn accumulates smoothly
        accumAngle += d;
        prevAngle = a;
        const dq = new THREE.Quaternion().setFromAxisAngle(dragAxis, accumAngle);
        cube.quaternion.copy(startQuat).premultiply(dq); // rotate about the world-space axis
      } else {
        // scale: drag distance along the axis, as a ratio of where it began.
        // Scale is inherently local (cube.scale is per local axis), so the
        // component comes from the untransformed axis.
        if (Math.abs(startT) < 1e-4) return;
        const factor = axisT(dragAxis, startPos) / startT;
        const axis = active.dir.x ? 'x' : active.dir.y ? 'y' : 'z';
        cube.scale[axis] = Math.max(0.05, startScale[axis] * factor);
      }
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
    // Glue every gizmo to the cube: always its position, and in local space its
    // orientation too (world space keeps them axis-aligned).
    for (const g of Object.values(GIZMOS)) {
      g.group.position.copy(cube.position);
      g.group.quaternion.copy(space === 'local' ? cube.quaternion : IDENTITY_Q);
    }
    controls.update();
    renderer.render(scene, camera);
  });
}

main();
