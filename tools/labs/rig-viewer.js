// Visor de rigs: muestra un modelo de public/models/ moviendo la torreta y el cañón con el
// mismo código que usará el juego (docs/asset-standard.md) y dibuja la dirección de cada
// boca. Si la línea roja no sale por el cañón dibujado, el modelo no está bien.
//
//   /tools/labs/rig-viewer.html?model=m163
//   /tools/labs/rig-viewer.html?model=m163&yaw=60&pitch=15   pose fija, para capturas
//   /tools/labs/rig-viewer.html?fila=patrulla,patrulla-misiles   varios en fila junto a la
//       MG-7, sobre el pasto y el cielo del mapa, para juzgar si comparten la estética
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { towerDefinitions } from '../../src/content/towers/index.js';
import { MAT } from '../../src/render/materials.js';
import { TowerRenderer } from '../../src/render/tower-renderer.js';

const rigs = import.meta.glob('../../src/content/rigs/*.json', { eager: true, import: 'default' });
// Los modelos que no se publican (el M163) están fuera de public/, en assets/test-models/.
const testModels = Object.fromEntries(
  Object.entries(import.meta.glob('../../assets/test-models/*.glb', { eager: true, query: '?url', import: 'default' }))
    .map(([file, url]) => [file.split('/').pop().replace('.glb', ''), url]),
);
const modelUrl = (id) => testModels[id] ?? `/models/${id}.glb`;
const ids = Object.values(rigs).map((rig) => rig.id).sort();
const params = new URLSearchParams(window.location.search);
const fixedYaw = params.has('yaw') ? THREE.MathUtils.degToRad(Number(params.get('yaw'))) : null;
const fixedPitch = params.has('pitch') ? THREE.MathUtils.degToRad(Number(params.get('pitch'))) : null;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(2, 4, 3);
scene.add(sun);
scene.add(new THREE.GridHelper(4, 40, 0x475569, 0x1e293b));

const forwardArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.002, 0.55), 0.35, 0xa3e635, 0.08, 0.05);
scene.add(forwardArrow);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(1.25, 0.9, 1.35);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.25, 0);
controls.update();

const select = document.getElementById('model');
const animateBox = document.getElementById('animate');
const info = document.getElementById('info');
for (const id of ids) select.add(new Option(id, id));
select.value = ids.includes(params.get('model')) ? params.get('model') : ids[0];
if (fixedYaw !== null || fixedPitch !== null) animateBox.checked = false;

const loader = new GLTFLoader();
const markers = new THREE.Group();
scene.add(markers);
let current = null;

function marker(color, size = 0.018) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  mesh.renderOrder = 10;
  markers.add(mesh);
  return mesh;
}

async function buildUnit(id) {
  return (await loader.loadAsync(modelUrl(id))).scene;
}

async function load(id) {
  if (current) scene.remove(current.root);
  markers.clear();
  const root = await buildUnit(id);
  scene.add(root);
  const turretYaw = root.getObjectByName('turret_yaw');
  const gunPitch = root.getObjectByName('gun_pitch');
  const muzzles = [];
  root.traverse((node) => { if (/^muzzle_\d{2}$/.test(node.name)) muzzles.push(node); });
  const rays = muzzles.map(() => {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xef4444, depthTest: false }));
    line.renderOrder = 11;
    markers.add(line);
    return line;
  });
  current = {
    id,
    root,
    turretYaw,
    gunPitch,
    muzzles,
    rays,
    turretMarker: turretYaw ? marker(0xfacc15) : null,
    gunMarker: gunPitch ? marker(0x22d3ee) : null,
    muzzleMarkers: muzzles.map(() => marker(0xef4444, 0.012)),
  };
  window.__rigViewer = current;
  const rig = Object.values(rigs).find((candidate) => candidate.id === id);
  info.textContent = JSON.stringify(rig, null, 1).replace(/\n\s*(-?\d|\])/g, ' $1');
}

const clock = new THREE.Clock();
const world = new THREE.Vector3();
const direction = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  const t = clock.getElapsedTime();
  if (current?.turretYaw) {
    // El mismo código que usará el juego para cualquier modelo del estándar.
    const aimAngle = animateBox.checked ? Math.sin(t * 0.6) * Math.PI : fixedYaw ?? 0;
    const aimPitch = animateBox.checked ? 0.2 + Math.sin(t * 1.3) * 0.2 : fixedPitch ?? 0;
    current.turretYaw.rotation.y = aimAngle;
    current.gunPitch.rotation.x = -aimPitch;
    current.root.updateMatrixWorld(true);
    current.turretMarker.position.copy(current.turretYaw.getWorldPosition(world));
    current.gunMarker.position.copy(current.gunPitch.getWorldPosition(world));
    current.muzzles.forEach((muzzle, index) => {
      const start = muzzle.getWorldPosition(new THREE.Vector3());
      muzzle.getWorldDirection(direction);
      current.muzzleMarkers[index].position.copy(start);
      current.rays[index].geometry.setFromPoints([start, start.clone().addScaledVector(direction, 0.6)]);
    });
  }
  renderer.render(scene, camera);
}

select.addEventListener('change', () => load(select.value));
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const lineup = params.get('fila')?.split(',').filter((id) => ids.includes(id));
if (lineup?.length) {
  // Modo fila: los vehículos en reposo junto a la MG-7, con el pasto y el cielo del juego.
  document.getElementById('panel').hidden = true;
  scene.background = new THREE.Color(0x78b8e0);
  scene.remove(forwardArrow);
  scene.children.filter((child) => child.type === 'GridHelper').forEach((grid) => scene.remove(grid));
  const ground = new THREE.Mesh(new THREE.BoxGeometry(8, 0.05, 3), MAT.grass);
  ground.position.y = -0.025;
  scene.add(ground);
  const spacing = 1.25;
  const start = -((lineup.length) * spacing) / 2;
  const tower = new TowerRenderer(null, towerDefinitions, 1).buildMesh('mg7-vulcan', 0);
  tower.scale.setScalar(0.9);
  tower.position.set(start, 0, 0);
  scene.add(tower);
  Promise.all(lineup.map((id) => loader.loadAsync(modelUrl(id)))).then((models) => {
    models.forEach((gltf, index) => {
      gltf.scene.position.set(start + (index + 1) * spacing, 0, 0);
      gltf.scene.rotation.y = -Math.PI / 5;
      scene.add(gltf.scene);
    });
    camera.position.set(0, 1.3, 3.1);
    controls.target.set(0, 0.25, 0);
    controls.update();
    frame();
  });
} else {
  load(select.value).then(frame);
}
