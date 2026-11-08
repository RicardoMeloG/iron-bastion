// Laboratorio de vehículos: muestra cada tipo de enemigo con el mismo código que el juego
// (src/render/units.js): su modelo normalizado, su largo y la torreta apuntada con aimTurret.
import * as THREE from 'three';
import { vehicleEnemyDefinitions } from '../../src/content/enemies/vehicleCatalog.js';
import { aimTurret, createUnit, loadUnitModel } from '../../src/render/units.js';

const LAB_PLATFORM_SURFACE_Y = 0.36;

const viewerEl = document.getElementById('viewer');
const presetSelect = document.getElementById('preset-select');
const randomBtn = document.getElementById('random-btn');
const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const DEFAULT_PRESET_ID = 'patrulla';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101b27);
scene.fog = new THREE.FogExp2(0x101b27, 0.018);

const camera = new THREE.PerspectiveCamera(30, viewerEl.clientWidth / viewerEl.clientHeight, 0.1, 500);
let cameraRadius = 21;
let cameraMinRadius = 6;
let cameraMaxRadius = 42;
let cameraAzimuth = 0.8;
let cameraElevation = 0.38;
const lookAt = new THREE.Vector3(0, 2.8, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewerEl.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x98a8bb, 0.52));

const keyLight = new THREE.DirectionalLight(0xffe0b9, 1.8);
keyLight.position.set(14, 18, 12);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -24;
keyLight.shadow.camera.right = 24;
keyLight.shadow.camera.top = 24;
keyLight.shadow.camera.bottom = -24;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x9bc5ff, 0.42);
fillLight.position.set(-15, 10, -10);
scene.add(fillLight);

const deck = new THREE.Mesh(
  new THREE.CylinderGeometry(13.5, 14.2, 1, 56),
  new THREE.MeshStandardMaterial({ color: 0x4f6f3c, roughness: 0.86 }),
);
deck.receiveShadow = true;
deck.position.y = -0.5;
scene.add(deck);

const deckTop = new THREE.Mesh(
  new THREE.CylinderGeometry(11, 11.8, 0.68, 56),
  new THREE.MeshStandardMaterial({ color: 0x749c57, roughness: 0.78 }),
);
deckTop.receiveShadow = true;
deckTop.position.y = 0.02;
scene.add(deckTop);

for (let index = 0; index < 10; index += 1) {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.28 + Math.random() * 0.2, 0),
    new THREE.MeshStandardMaterial({ color: 0x8d9887, roughness: 0.9 }),
  );
  const angle = (index / 10) * Math.PI * 2;
  const radius = 5.4 + Math.random() * 1.4;
  rock.position.set(Math.cos(angle) * radius, 0.22, Math.sin(angle) * radius);
  rock.rotation.set(Math.random() * 1.4, Math.random() * 1.4, Math.random() * 1.4);
  rock.castShadow = true;
  scene.add(rock);
}

let currentVehicle = null;
let isDragging = false;
let dragLastX = 0;
let dragLastY = 0;

function disposeObject3D(root) {
  if (root.userData.sharedAsset) return;
  root.traverse((node) => {
    node.geometry?.dispose?.();
    if (node.material) {
      if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose?.());
      else node.material.dispose?.();
    }
  });
}

function updateCamera() {
  const planar = Math.cos(cameraElevation) * cameraRadius;
  camera.position.set(
    Math.cos(cameraAzimuth) * planar,
    Math.sin(cameraElevation) * cameraRadius,
    Math.sin(cameraAzimuth) * planar,
  );
  camera.lookAt(lookAt);
}

function fitCameraToVehicle(vehicleRoot) {
  if (!vehicleRoot) return;
  const bounds = new THREE.Box3().setFromObject(vehicleRoot);
  if (bounds.isEmpty()) return;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);

  const fovY = THREE.MathUtils.degToRad(camera.fov);
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * camera.aspect);
  const halfHeight = Math.max(0.001, size.y * 0.5);
  const halfWidth = Math.max(0.001, size.x * 0.5);
  const halfDepth = Math.max(0.001, size.z * 0.5);

  const fitHeightDistance = halfHeight / Math.tan(fovY / 2);
  const fitWidthDistance = halfWidth / Math.tan(fovX / 2);
  const fitDepthDistance = halfDepth / Math.sin(fovY / 2);
  const idealRadius = Math.max(fitHeightDistance, fitWidthDistance, fitDepthDistance) * 1.5;

  cameraMinRadius = Math.max(2.5, idealRadius * 0.45);
  cameraMaxRadius = Math.max(cameraMinRadius + 2, idealRadius * 2.8);
  cameraRadius = THREE.MathUtils.clamp(idealRadius, cameraMinRadius, cameraMaxRadius);
  cameraElevation = THREE.MathUtils.clamp(0.42, 0.1, 1.1);

  lookAt.set(center.x, center.y + size.y * 0.18, center.z);
  updateCamera();
}

function resize() {
  const width = viewerEl.clientWidth;
  const height = viewerEl.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  if (currentVehicle) fitCameraToVehicle(currentVehicle);
}

function fillSelect(selectEl, entries) {
  selectEl.innerHTML = '';
  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    selectEl.appendChild(option);
  }
}

function renderStats(definition) {
  const armedLabel = definition.combatModel.isArmed ? 'Si' : 'No';
  statsEl.innerHTML = `
    <div class="stat-row"><span class="stat-label">Nombre</span><span class="stat-value">${definition.displayName}</span></div>
    <div class="stat-row"><span class="stat-label">Armado</span><span class="stat-value">${armedLabel}</span></div>
    <div class="stat-row"><span class="stat-label">Armadura</span><span class="stat-value">${definition.armorClass}</span></div>
    <div class="stat-row"><span class="stat-label">HP</span><span class="stat-value">${definition.stats.hp}</span></div>
    <div class="stat-row"><span class="stat-label">Blindaje</span><span class="stat-value">${definition.stats.armor}</span></div>
    <div class="stat-row"><span class="stat-label">Velocidad</span><span class="stat-value">${definition.stats.speed}</span></div>
    <div class="stat-row"><span class="stat-label">Recompensa</span><span class="stat-value">${definition.stats.reward}</span></div>
    <div class="stat-row"><span class="stat-label">Rol</span><span class="stat-value">${definition.tags.role}</span></div>
  `;
}

async function buildVehicle(definition) {
  const { rig, scale } = definition.model;
  const wrapper = createUnit(await loadUnitModel(rig));
  wrapper.scale.setScalar(scale);
  // Comparte geometría y materiales con el modelo cargado: no se liberan al cambiar.
  wrapper.userData.sharedAsset = true;
  return wrapper;
}

async function loadPresetVehicle(presetId) {
  const definition = vehicleEnemyDefinitions[presetId];
  if (!definition) return;

  renderStats(definition);

  if (currentVehicle) {
    scene.remove(currentVehicle);
    disposeObject3D(currentVehicle);
    currentVehicle = null;
  }

  currentVehicle = await buildVehicle(definition);
  currentVehicle.position.y = LAB_PLATFORM_SURFACE_Y;
  window.__labVehicle = currentVehicle;
  scene.add(currentVehicle);
  fitCameraToVehicle(currentVehicle);
  statusEl.textContent = `Modelo activo: ${definition.displayName} (${definition.model.rig}, largo ${definition.model.scale})`;
}

function randomChoice(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function setupControls() {
  fillSelect(
    presetSelect,
    Object.values(vehicleEnemyDefinitions).map((definition) => ({
      id: definition.id,
      label: definition.displayName,
    })),
  );

  presetSelect.addEventListener('change', () => {
    loadPresetVehicle(presetSelect.value).catch((error) => {
      statusEl.textContent = `Error cargando asset: ${error.message}`;
    });
  });

  randomBtn.addEventListener('click', () => {
    const presetIds = Object.keys(vehicleEnemyDefinitions);
    presetSelect.value = randomChoice(presetIds);
    loadPresetVehicle(presetSelect.value).catch((error) => {
      statusEl.textContent = `Error cargando asset: ${error.message}`;
    });
  });
}

function setupPointerControls() {
  viewerEl.addEventListener('mousedown', (event) => {
    isDragging = true;
    dragLastX = event.clientX;
    dragLastY = event.clientY;
    viewerEl.classList.add('dragging');
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    viewerEl.classList.remove('dragging');
  });

  window.addEventListener('mousemove', (event) => {
    if (!isDragging) return;
    const dx = event.clientX - dragLastX;
    const dy = event.clientY - dragLastY;
    dragLastX = event.clientX;
    dragLastY = event.clientY;
    cameraAzimuth -= dx * 0.006;
    cameraElevation = Math.max(0.1, Math.min(1.1, cameraElevation - dy * 0.004));
    updateCamera();
  });

  viewerEl.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      cameraRadius = THREE.MathUtils.clamp(cameraRadius + event.deltaY * 0.015, cameraMinRadius, cameraMaxRadius);
      updateCamera();
    },
    { passive: false },
  );
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  if (currentVehicle) {
    currentVehicle.rotation.y = 0;
    // Giro continuo (unos 11 s por vuelta) y el cañón subiendo y bajando, con el código del juego.
    aimTurret(currentVehicle.userData.rig, elapsed * 0.55, 0.1 + Math.sin(elapsed * 1.4) * 0.14);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', resize);
setupControls();
setupPointerControls();
updateCamera();
resize();

const requestedPreset = new URLSearchParams(window.location.search).get('preset');
const initialPreset =
  requestedPreset && vehicleEnemyDefinitions[requestedPreset]
    ? requestedPreset
    : DEFAULT_PRESET_ID;

presetSelect.value = initialPreset;
loadPresetVehicle(initialPreset).catch((error) => {
  statusEl.textContent = `Error cargando asset: ${error.message}`;
});
animate();
