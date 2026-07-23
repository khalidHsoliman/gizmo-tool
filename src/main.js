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

  // --- translate gizmo: one draggable axis (X) ---
  // A single axis for this milestone; the drag math in C++ is axis-agnostic,
  // so extending to Y/Z is just more arrows pointing the same call at a
  // different direction vector.
  const AXIS = new THREE.Vector3(1, 0, 0);
  const IDLE_COLOR = 0xff5566;
  const HOT_COLOR = 0xffd24a;

  const handleMat = new THREE.MeshBasicMaterial({ color: IDLE_COLOR, depthTest: false });
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 12), handleMat);
  shaft.position.y = 0.45;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 16), handleMat);
  head.position.y = 0.98;
  arrow.add(shaft, head);
  // The arrow is modeled along +Y; aim it down the axis.
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), AXIS);
  arrow.renderOrder = 1; // draw on top of the cube
  scene.add(arrow);
  arrow.position.copy(cube.position);

  // --- interaction ---
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const startPos = new THREE.Vector3();
  let dragging = false;
  let startT = 0;

  const setPointer = (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  };

  // Feed the current mouse ray and the axis to C++, get back the position
  // along the axis (world units, measured from the axis origin `ao`).
  const axisT = (ao) => {
    const { origin: o, direction: d } = raycaster.ray;
    return core.axisClosestT(
      o.x, o.y, o.z,
      d.x, d.y, d.z,
      ao.x, ao.y, ao.z,
      AXIS.x, AXIS.y, AXIS.z
    );
  };

  const overHandle = () => raycaster.intersectObject(arrow, true).length > 0;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!core) return;
    setPointer(e);
    if (!overHandle()) return;
    dragging = true;
    controls.enabled = false;
    startPos.copy(cube.position);
    startT = axisT(startPos); // axis origin stays fixed for the whole drag
    handleMat.color.set(HOT_COLOR);
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    setPointer(e);
    if (dragging) {
      const delta = axisT(startPos) - startT;
      cube.position.copy(startPos).addScaledVector(AXIS, delta);
      arrow.position.copy(cube.position);
    } else if (core) {
      const hot = overHandle();
      handleMat.color.set(hot ? HOT_COLOR : IDLE_COLOR);
      renderer.domElement.style.cursor = hot ? 'grab' : 'auto';
    }
  });

  addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    controls.enabled = true;
    handleMat.color.set(IDLE_COLOR);
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
