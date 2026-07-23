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

  // --- translate gizmo: three draggable axes (X, Y, Z) ---
  // The drag math in C++ is axis-agnostic, so each axis is the same arrow
  // pointing the same `axisClosestT` call at a different direction vector.
  const HOT_COLOR = 0xffd24a; // shared highlight when an axis is hovered/dragged
  const AXES = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xff5566 }, // X — red
    { dir: new THREE.Vector3(0, 1, 0), color: 0x66dd66 }, // Y — green
    { dir: new THREE.Vector3(0, 0, 1), color: 0x5588ff }, // Z — blue
  ];

  // Geometry is identical for every arrow, so build it once and share it.
  const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 12);
  const headGeo = new THREE.ConeGeometry(0.06, 0.18, 16);
  const UP = new THREE.Vector3(0, 1, 0); // arrows are modeled along +Y

  const gizmo = new THREE.Group();
  scene.add(gizmo);
  const handles = []; // pickable meshes, each tagged with its axis descriptor

  for (const ax of AXES) {
    ax.mat = new THREE.MeshBasicMaterial({ color: ax.color, depthTest: false });
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(shaftGeo, ax.mat);
    shaft.position.y = 0.45;
    const head = new THREE.Mesh(headGeo, ax.mat);
    head.position.y = 0.98;
    arrow.add(shaft, head);
    arrow.quaternion.setFromUnitVectors(UP, ax.dir); // aim +Y down this axis
    arrow.renderOrder = 1; // draw on top of the cube
    // Tag both meshes so a raycast hit tells us which axis was grabbed.
    shaft.userData.axis = ax;
    head.userData.axis = ax;
    handles.push(shaft, head);
    gizmo.add(arrow);
  }
  gizmo.position.copy(cube.position);

  // --- interaction ---
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const startPos = new THREE.Vector3();
  let active = null; // the axis descriptor currently being dragged
  let startT = 0;

  const setPointer = (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  };

  // Feed the current mouse ray and a specific axis to C++, get back the
  // position along that axis (world units, measured from the origin `ao`).
  const axisT = (dir, ao) => {
    const { origin: o, direction: d } = raycaster.ray;
    return core.axisClosestT(
      o.x, o.y, o.z,
      d.x, d.y, d.z,
      ao.x, ao.y, ao.z,
      dir.x, dir.y, dir.z
    );
  };

  // Which axis, if any, is under the cursor? Returns its descriptor or null.
  const pickAxis = () => {
    const hit = raycaster.intersectObjects(handles, false)[0];
    return hit ? hit.object.userData.axis : null;
  };

  const paintIdle = () => AXES.forEach((a) => a.mat.color.set(a.color));

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!core) return;
    setPointer(e);
    const ax = pickAxis();
    if (!ax) return;
    active = ax;
    controls.enabled = false;
    startPos.copy(cube.position);
    startT = axisT(active.dir, startPos); // axis origin fixed for the whole drag
    ax.mat.color.set(HOT_COLOR);
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    setPointer(e);
    if (active) {
      const delta = axisT(active.dir, startPos) - startT;
      cube.position.copy(startPos).addScaledVector(active.dir, delta);
      gizmo.position.copy(cube.position);
    } else if (core) {
      const ax = pickAxis();
      paintIdle();
      if (ax) ax.mat.color.set(HOT_COLOR);
      renderer.domElement.style.cursor = ax ? 'grab' : 'auto';
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
