import * as THREE from 'three';
import {
  clearCover,
  getSellRefund,
  consumeEffects,
  createFixedStepper,
  createGameConfig,
  createInitialState,
  worldToGrid,
  resetAll,
  resetWave,
  placeTower,
  sellTower,
  startWave,
  tickSimulation,
  tickWaveCountdown,
  upgradeTower,
  upgradeTowerDefense,
} from '../core/index.js';
import { GAMEPLAY_CONFIG } from '../content/gameplay.js';
import { FRAMING_CONFIG } from '../render/config/framing.js';
import { HudPresenter } from '../ui/hud-presenter.js';
import { WaveInfoPresenter } from '../ui/wave-info-presenter.js';
import { TowerPanelPresenter } from '../ui/tower-panel-presenter.js';
import { RockQuickActions } from '../ui/rock-quick-actions.js';
import { TowerQuickActions } from '../ui/tower-quick-actions.js';
import { TowerSelector } from '../ui/tower-selector.js';
import { SfxPlayer } from '../audio/sfx-player.js';
import { createAudioDirector } from './audio-director.js';
import { SOUND_FILES } from './sound-files.js';
import { createMatchRecorder } from './match-recorder.js';
import { createLayoutCoordinator } from '../ui/layout-coordinator.js';
import { TowerPreview } from '../render/tower-preview.js';
import { EnemyRenderer } from '../render/enemy-renderer.js';
import { MapRenderer } from '../render/map-renderer.js';
import { ProjectileRenderer } from '../render/projectile-renderer.js';
import { RockRenderer } from '../render/rock-renderer.js';
import { TreeRenderer } from '../render/tree-renderer.js';
import { BushRenderer } from '../render/bush-renderer.js';
import { FireZoneRenderer } from '../render/fire-zone-renderer.js';
import { TowerRenderer } from '../render/tower-renderer.js';
import { createSceneRuntime } from '../render/scene-runtime.js';

const config = createGameConfig();
const state = createInitialState(config);

const layoutCoordinator = createLayoutCoordinator(document);
const fieldEl = document.getElementById('field');
const startScreenEl = document.getElementById('start-screen');
const panelEl = document.getElementById('panel');
const sceneRuntime = createSceneRuntime({
  viewportEl: fieldEl,
  mapDefinition: config.mapDefinition,
  worldScale: config.worldScale,
  framingConfig: FRAMING_CONFIG,
});
const mapRenderer = new MapRenderer(sceneRuntime.scene, config);
mapRenderer.build();

const sfxPlayer = new SfxPlayer();
sfxPlayer.attachUnlockListeners(window);
for (const [id, url] of Object.entries(SOUND_FILES)) sfxPlayer.load(id, url).catch(() => {});

const towerRenderer = new TowerRenderer(sceneRuntime.scene, config.towerDefinitions, config.worldScale);
const rockRenderer = new RockRenderer(sceneRuntime.scene, config);
const treeRenderer = new TreeRenderer(sceneRuntime.scene, config);
const bushRenderer = new BushRenderer(sceneRuntime.scene, config);
const fireZoneRenderer = new FireZoneRenderer(sceneRuntime.scene, config);
const projectileRenderer = new ProjectileRenderer(sceneRuntime.scene, config.worldScale);
// Los restos de los vehículos destruidos echan humo con las partículas de los proyectiles.
const enemyRenderer = new EnemyRenderer(sceneRuntime.scene, config.enemyDefinitions, config.worldScale, projectileRenderer);
const audioDirector = createAudioDirector(sfxPlayer);
const matchRecorder = createMatchRecorder();
// En la versión publicada, compartir partidas es opcional y empieza desmarcado; la elección se recuerda.
if (matchRecorder.canShareRemotely) {
  const CONSENT_KEY = 'iron-bastion:registro';
  const consent = document.getElementById('registro-consent');
  const check = document.getElementById('registro-consent-check');
  try { check.checked = localStorage.getItem(CONSENT_KEY) === '1'; } catch { check.checked = false; }
  matchRecorder.setEnabled(check.checked);
  consent.hidden = false;
  check.addEventListener('change', () => {
    matchRecorder.setEnabled(check.checked);
    try { localStorage.setItem(CONSENT_KEY, check.checked ? '1' : '0'); } catch { /* sin almacenamiento */ }
  });
}
const previewTowerRenderer = new TowerRenderer(null, config.towerDefinitions, 1);
const towerPreview = new TowerPreview(document.getElementById('preview-3d'), (towerTypeId, level) =>
  previewTowerRenderer.buildMesh(towerTypeId, level),
);
const hudPresenter = new HudPresenter(document);
const waveInfoPresenter = new WaveInfoPresenter(document);
const panelPresenter = new TowerPanelPresenter(document, towerPreview);
const towerQuickActions = new TowerQuickActions(document);
const rockQuickActions = new RockQuickActions(document);
const towerSelector = new TowerSelector(document, config.towerDefinitions, config.enemyDefinitions, (towerTypeId) => selectBuildTower(towerTypeId));

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredCell = null;
let dragging = null;
let didDrag = false;
let lastMouseX = 0;
let lastMouseY = 0;
let elapsedTime = 0;
let pendingConfirm = null;
let towerDetailsOpen = false;
let userPaused = false;

const devModeToggleEl = document.getElementById('dev-mode-toggle');
const devConfigEl = document.getElementById('dev-config');
const devWaveCountEl = document.getElementById('dev-wave-count');
const devWaveIntervalEl = document.getElementById('dev-wave-interval');
const devEnemyListEl = document.getElementById('dev-enemy-list');
const devSelectAllEl = document.getElementById('dev-select-all');
const devClearAllEl = document.getElementById('dev-clear-all');
const devVeterancyEl = document.getElementById('dev-veterancy');
const devSelectedEnemyIds = new Set();
let devVeterancy = 0;

function setDeveloperMode(enabled) {
  const shouldEnable = Boolean(enabled);
  if (shouldEnable) {
    if (!state.developerMode.enabled && Number.isFinite(state.credits)) {
      state.developerMode.savedCredits = state.credits;
    }
    state.developerMode.enabled = true;
    state.credits = Number.POSITIVE_INFINITY;
  } else {
    state.developerMode.enabled = false;
    if (!Number.isFinite(state.credits)) {
      state.credits = state.developerMode.savedCredits ?? state.config.mapDefinition.initialCredits;
    }
  }
  if (devConfigEl) devConfigEl.hidden = !shouldEnable;
  state.uiDirty = true;
}

function syncDeveloperCredits() {
  if (state.developerMode.enabled) {
    state.credits = Number.POSITIVE_INFINITY;
    state.uiDirty = true;
  }
}

function buildDevWaveOverride() {
  if (!state.developerMode.enabled) return null;
  const selectedEnemyIds = Array.from(devSelectedEnemyIds).filter((enemyTypeId) => config.enemyDefinitions[enemyTypeId]);
  if (selectedEnemyIds.length === 0) return null;

  const requestedCount = Number.parseInt(devWaveCountEl?.value ?? '16', 10);
  const count = Math.max(1, Math.min(200, Number.isFinite(requestedCount) ? requestedCount : 16));
  const requestedInterval = Number.parseFloat(devWaveIntervalEl?.value ?? '0.72');
  const interval = Math.max(0.1, Math.min(5, Number.isFinite(requestedInterval) ? requestedInterval : 0.72));
  const spawns = Array.from(
    { length: count },
    () => selectedEnemyIds[Math.floor(Math.random() * selectedEnemyIds.length)],
  );

  return {
    interval,
    spawns,
    veterancy: devVeterancy,
    infantryTeams: true,
  };
}

// Los soldados salen en unidades de 3, y su nivel decide quién lleva misil: basta una imagen.
function getDevEnemies() {
  return Object.values(config.enemyDefinitions).filter((enemyDef) => enemyDef.id !== GAMEPLAY_CONFIG.infantryTeams.rear);
}

function populateDevEnemyList() {
  if (!devEnemyListEl) return;
  devEnemyListEl.innerHTML = '';
  const entries = getDevEnemies().sort((a, b) => a.displayName.localeCompare(b.displayName));
  for (const enemyDef of entries) {
    const row = document.createElement('label');
    row.className = 'dev-enemy-tile';
    const name = enemyDef.id === GAMEPLAY_CONFIG.infantryTeams.front ? 'Unidad de 3 soldados' : enemyDef.displayName;
    row.title = name;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = enemyDef.id;
    checkbox.checked = devSelectedEnemyIds.has(enemyDef.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) devSelectedEnemyIds.add(enemyDef.id);
      else devSelectedEnemyIds.delete(enemyDef.id);
    });
    const image = document.createElement('img');
    image.src = `${import.meta.env.BASE_URL}vehicles/${enemyDef.id}.webp`;
    image.alt = name;
    row.appendChild(checkbox);
    row.appendChild(image);
    devEnemyListEl.appendChild(row);
  }
}

function veterancyChevrons(level) {
  if (level === 0) return 'Sin';
  const top = 8 - level * 2.5;
  const lines = Array.from({ length: level }, (_, index) => {
    const y = top + index * 4;
    return `<polyline points="3,${y + 4} 8,${y} 13,${y + 4}" />`;
  });
  return `<svg viewBox="0 0 16 16" aria-hidden="true">${lines.join('')}</svg>`;
}

function populateDevVeterancy() {
  if (!devVeterancyEl) return;
  const levels = GAMEPLAY_CONFIG.veterancy.odds[0].chances.length;
  for (let level = 0; level < levels; level++) {
    const option = document.createElement('label');
    option.title = level === 0 ? 'Sin veteranía' : `Nivel ${level}`;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'dev-veterancy';
    radio.checked = level === devVeterancy;
    radio.setAttribute('aria-label', option.title);
    radio.addEventListener('change', () => {
      devVeterancy = level;
    });
    const face = document.createElement('span');
    face.innerHTML = veterancyChevrons(level);
    option.appendChild(radio);
    option.appendChild(face);
    devVeterancyEl.appendChild(option);
  }
}

// «Modo Desarrollo» (dinero infinito y oleadas a medida) solo existe en npm run dev.
function setupDeveloperControls() {
  if (!import.meta.env.DEV) {
    document.getElementById('dev-controls')?.remove();
    return;
  }
  if (!devModeToggleEl) return;
  populateDevEnemyList();
  populateDevVeterancy();
  if (devConfigEl) devConfigEl.hidden = true;

  devModeToggleEl.addEventListener('change', () => {
    setDeveloperMode(devModeToggleEl.checked);
    renderUi();
  });

  devSelectAllEl?.addEventListener('click', () => {
    devSelectedEnemyIds.clear();
    getDevEnemies().forEach(({ id }) => devSelectedEnemyIds.add(id));
    populateDevEnemyList();
  });

  devClearAllEl?.addEventListener('click', () => {
    devSelectedEnemyIds.clear();
    populateDevEnemyList();
  });
}

function renderUi() {
  hudPresenter.render(state);
  waveInfoPresenter.render(state);
  if (!state.selectedTowerId) towerDetailsOpen = false;
  panelPresenter.render(state, towerDetailsOpen);
  towerQuickActions.render(state, !towerDetailsOpen);
  rockQuickActions.render(state, getSelectedObstacle());
  towerSelector.render(state);
  document.body.classList.toggle('overlay-active', Boolean(state.overlay?.visible));
  refreshHover();
}

function refreshHover() {
  mapRenderer.updateHover(state, hoveredCell, config.towerDefinitions);
  mapRenderer.updateSelection(getSelectedTower(), config.towerDefinitions);
}

function selectBuildTower(towerTypeId) {
  if (!config.towerDefinitions[towerTypeId]) return;
  state.buildTowerTypeId = towerTypeId;
  state.selectedTowerId = null;
  selectedObstacleId = null;
  renderUi();
}

function deselectTower() {
  state.selectedTowerId = null;
  renderUi();
}

function setTowerDetailsOpen(open) {
  towerDetailsOpen = open;
  renderUi();
}

window.showTowerDetails = () => setTowerDetailsOpen(true);

// La barra rápida acompaña a la torre seleccionada. El panel de detalle se abre sobre el campo:
// si tapa la torre, sube la vista lo justo para que se vea, sin cambiar el zoom.
const SELECTED_TOWER_MARGIN_PX = 44;
let viewShift = 0;

function followSelectedTower() {
  const tower = getSelectedTower();
  let shift = 0;
  if (tower) {
    const projected = new THREE.Vector3(tower.wx, 0, tower.wz).project(sceneRuntime.camera);
    const fieldHeight = fieldEl.clientHeight;
    const fieldWidth = fieldEl.clientWidth;
    const towerY = ((1 - projected.y) / 2) * fieldHeight;
    if (towerDetailsOpen) shift = Math.max(0, Math.round(towerY + SELECTED_TOWER_MARGIN_PX - (fieldHeight - panelEl.offsetHeight)));
    else towerQuickActions.moveTo(((projected.x + 1) / 2) * fieldWidth, towerY, fieldWidth);
  }
  if (shift === viewShift) return;
  viewShift = shift;
  fieldEl.style.setProperty('--cfg-canvas-shift-y', `${-shift}px`);
}

// La burbuja de la roca abierta sigue a la roca, como la barra rápida a su torre.
let selectedObstacleId = null;

function getSelectedObstacle() {
  return [...state.rocks, ...state.trees].find((item) => item.id === selectedObstacleId) ?? null;
}

function followSelectedObstacle() {
  const obstacle = getSelectedObstacle();
  if (!obstacle) return;
  const projected = new THREE.Vector3(obstacle.wx, 0, obstacle.wz).project(sceneRuntime.camera);
  const fieldWidth = fieldEl.clientWidth;
  rockQuickActions.moveTo(((projected.x + 1) / 2) * fieldWidth, ((1 - projected.y) / 2) * fieldEl.clientHeight, fieldWidth);
}

window.doClearObstacle = function doClearObstacleHandler() {
  if (clearCover(state, selectedObstacleId)) {
    selectedObstacleId = null;
    renderUi();
  }
};

function getSelectedTower() {
  return state.towers.find((tower) => tower.id === state.selectedTowerId) ?? null;
}

function getGridCell(event) {
  const rect = sceneRuntime.renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, sceneRuntime.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, point)) return null;

  const { gx, gy } = worldToGrid(point.x, point.z, config.worldScale, config.halfWidth, config.halfHeight);
  if (gx < 0 || gx >= config.mapDefinition.width || gy < 0 || gy >= config.mapDefinition.height) {
    return null;
  }
  if (state.grid[gy][gx] === 3) return null;
  return { gx, gy };
}

const confirmDialogEl = document.getElementById('confirm-dialog');

function closeConfirmDialog() {
  pendingConfirm = null;
  confirmDialogEl.classList.remove('show');
}

// Diálogo de confirmación del juego. `amount` es opcional; `onConfirm`, lo que se hace al aceptar.
function openConfirmDialog({ title, text, amount = '', acceptLabel = 'Confirmar', onConfirm }) {
  pendingConfirm = onConfirm;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = text;
  document.getElementById('confirm-amount').textContent = amount;
  document.getElementById('confirm-accept').textContent = acceptLabel;
  confirmDialogEl.classList.add('show');
  // Cancelar tiene el foco: un Enter de más no borra la partida.
  document.getElementById('confirm-cancel').focus();
}

// La simulación se detiene con la pausa del jugador y mientras haya una pantalla encima.
const isModalOpen = () => startScreenEl.classList.contains('show') || confirmDialogEl.classList.contains('show');
const isSimulationPaused = () => userPaused || isModalOpen();

const pauseButton = document.getElementById('pause-btn');
const pauseBannerEl = document.getElementById('pause-banner');
function setPaused(paused) {
  userPaused = paused;
  pauseButton.setAttribute('aria-pressed', String(paused));
  pauseButton.textContent = paused ? 'Continuar' : 'Pausa';
  pauseBannerEl.hidden = !paused;
}
const speedButton = document.getElementById('speed-btn');
const GAME_SPEEDS = [1, 2, 3];

function setSimulationSpeed(speed) {
  simulationSpeed = speed;
  speedButton.textContent = `Velocidad: x${speed}`;
}

function cycleSimulationSpeed() {
  setSimulationSpeed(GAME_SPEEDS[(GAME_SPEEDS.indexOf(simulationSpeed) + 1) % GAME_SPEEDS.length]);
}

speedButton.addEventListener('click', cycleSimulationSpeed);

pauseButton.addEventListener('click', () => {
  if (!state.gameOver) setPaused(!userPaused);
});

// Silencio (T09): el botón de la barra y la tecla M. Se recuerda en este navegador.
const MUTE_KEY = 'iron-bastion:silencio';
const muteButton = document.getElementById('mute-btn');
function setMuted(muted) {
  sfxPlayer.setMuted(muted);
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.textContent = muted ? 'Sonido: no' : 'Sonido: sí';
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Sin almacenamiento (ventana privada): el silencio dura solo esta visita.
  }
}
let savedMute = false;
try {
  savedMute = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  savedMute = false;
}
setMuted(savedMute);
muteButton.addEventListener('click', () => setMuted(!sfxPlayer.muted));
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'm' || event.key === 'M') {
    setMuted(!sfxPlayer.muted);
    return;
  }
  if (confirmDialogEl.classList.contains('show') && event.key === 'Escape') {
    closeConfirmDialog();
    return;
  }
  if (isModalOpen()) return;
  if ((event.key === 'v' || event.key === 'V') && !event.repeat) cycleSimulationSpeed();
  if ((event.key === 'p' || event.key === 'P') && !event.repeat) {
    if (!state.gameOver) setPaused(!userPaused);
    return;
  }
  if (event.key === 'Escape' && selectedObstacleId) {
    selectedObstacleId = null;
    renderUi();
    return;
  }
  // Esc retrocede un paso: del detalle a la barra rápida, y de ahí a nada seleccionado.
  if (event.key === 'Escape' && state.selectedTowerId) {
    if (towerDetailsOpen) setTowerDetailsOpen(false);
    else deselectTower();
    return;
  }
  // 1, 2…: la torre que se pone con el próximo clic (barra de torres).
  const towerTypeId = towerSelector.towerForKey(event.key);
  if (towerTypeId) selectBuildTower(towerTypeId);
});

// Pantalla de inicio (T12): cómo se juega, Jugar y créditos. «Ayuda» la vuelve a abrir.
const startButtonEl = document.getElementById('start-btn');
function openStartScreen() {
  startButtonEl.textContent = state.wave > 0 || state.towers.length > 0 ? 'Volver al juego' : 'Jugar';
  startScreenEl.classList.add('show');
  document.body.classList.add('start-active');
  startButtonEl.focus();
}
function closeStartScreen() {
  startScreenEl.classList.remove('show');
  document.body.classList.remove('start-active');
}

// Pantalla completa en el teléfono: el navegador solo la concede tras un toque del jugador, así
// que se pide al tocar «Jugar» y con el botón ⛶ (si sale con el gesto de atrás). El iPhone no la
// ofrece a una página: ahí el botón no aparece.
const fullscreenButtonEl = document.getElementById('fullscreen-btn');
const touchScreen = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const canFullscreen = touchScreen && document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';

function enterFullscreen() {
  if (!canFullscreen || document.fullscreenElement) return;
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}

function syncFullscreenButton() {
  fullscreenButtonEl.hidden = !canFullscreen || Boolean(document.fullscreenElement);
}
document.addEventListener('fullscreenchange', syncFullscreenButton);
fullscreenButtonEl.addEventListener('click', enterFullscreen);
syncFullscreenButton();

startButtonEl.addEventListener('click', () => {
  enterFullscreen();
  closeStartScreen();
});
document.getElementById('help-btn').addEventListener('click', openStartScreen);
openStartScreen();

window.startWave = function startWaveHandler() {
  setPaused(false);
  syncDeveloperCredits();
  const overrideWaveDefinition = buildDevWaveOverride();
  if (startWave(state, { overrideWaveDefinition })) {
    renderUi();
  }
};

window.resetWave = function resetWaveHandler() {
  if (!state.waveActive) return;
  matchRecorder.note('reintentar oleada', { oleada: state.wave });
  resetWave(state);
  syncDeveloperCredits();
  setPaused(false);
  closeConfirmDialog();
  renderUi();
};

window.askResetWave = function askResetWaveHandler() {
  if (!state.waveActive) return;
  openConfirmDialog({
    title: `¿Reiniciar la oleada ${state.wave}?`,
    text: 'Vuelves al momento antes de lanzarla: se deshace lo que compraste durante ella y recuperas las vidas y los créditos de entonces.',
    acceptLabel: 'Reiniciar',
    onConfirm: () => window.resetWave(),
  });
};

window.resetAll = function resetAllHandler() {
  const keepDeveloperMode = Boolean(devModeToggleEl?.checked);
  matchRecorder.restart();
  resetAll(state);
  if (keepDeveloperMode) {
    setDeveloperMode(true);
  } else {
    setDeveloperMode(false);
  }
  setPaused(false);
  closeConfirmDialog();
  hoveredCell = null;
  renderUi();
};

window.askResetAll = function askResetAllHandler() {
  openConfirmDialog({
    title: '¿Reiniciar toda la partida?',
    text: 'Se pierden las torres, los créditos y el avance de las oleadas.',
    acceptLabel: 'Reiniciar',
    onConfirm: () => window.resetAll(),
  });
};

window.doUpgrade = function doUpgradeHandler() {
  if (!state.selectedTowerId) return;
  if (upgradeTower(state, state.selectedTowerId)) {
    renderUi();
  }
};

window.doUpgradeDefense = function doUpgradeDefenseHandler() {
  if (!state.selectedTowerId) return;
  if (upgradeTowerDefense(state, state.selectedTowerId)) {
    renderUi();
  }
};

window.askSell = function askSellHandler() {
  const tower = getSelectedTower();
  if (!tower) return;
  const definition = config.towerDefinitions[tower.towerTypeId];
  const stats = definition.levels[tower.level];
  openConfirmDialog({
    title: `Vender ${definition.displayName}?`,
    text: `Nivel ${tower.level + 1} · ${stats.label} · ${tower.kills} kills`,
    amount: `+ $${getSellRefund(definition, tower)}`,
    onConfirm: () => sellTower(state, tower.id),
  });
};

window.acceptConfirm = function acceptConfirmHandler() {
  const onConfirm = pendingConfirm;
  closeConfirmDialog();
  onConfirm?.();
  renderUi();
};

window.cancelConfirm = closeConfirmDialog;

sceneRuntime.renderer.domElement.addEventListener('mousemove', (event) => {
  if (dragging) {
    const dx = event.clientX - lastMouseX;
    const dy = event.clientY - lastMouseY;
    if (Math.abs(dx) > GAMEPLAY_CONFIG.ui.dragThreshold) didDrag = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    if (dragging === 'pan') sceneRuntime.panBy(dx, dy);
    else sceneRuntime.rotate(dx);
    return;
  }

  hoveredCell = getGridCell(event);
  refreshHover();
});

sceneRuntime.renderer.domElement.addEventListener('mousedown', (event) => {
  // Botón derecho: mover el mapa. Botón central: girarlo.
  if (event.button === 2 || event.button === 1) {
    event.preventDefault();
    dragging = event.button === 2 ? 'pan' : 'rotate';
    didDrag = false;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    sceneRuntime.renderer.domElement.style.cursor = 'grabbing';
  }
});

window.addEventListener('mouseup', () => {
  dragging = null;
  // Arrastrar es con el derecho o el central, que no disparan `click`: si quedara marcado, se
  // perdería el próximo clic izquierdo.
  didDrag = false;
  sceneRuntime.renderer.domElement.style.cursor = '';
});

sceneRuntime.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
document.getElementById('panel-close').addEventListener('click', () => setTowerDetailsOpen(false));

sceneRuntime.renderer.domElement.addEventListener('click', (event) => {
  if (didDrag) {
    didDrag = false;
    return;
  }
  // Un toque no pasa antes por la celda como el mouse: la celda es la del clic.
  hoveredCell = getGridCell(event);
  refreshHover();

  if (state.gameOver) return;
  const obstacleWasOpen = Boolean(selectedObstacleId);
  selectedObstacleId = null;
  if (!hoveredCell) {
    state.selectedTowerId = null;
    renderUi();
    return;
  }

  const cellValue = state.grid[hoveredCell.gy][hoveredCell.gx];
  if (cellValue === 0) {
    // Con una torre o una roca abierta, este clic la cierra y no gasta créditos sin querer.
    if (state.selectedTowerId || obstacleWasOpen) {
      deselectTower();
      return;
    }
    const tower = placeTower(state, { towerTypeId: state.buildTowerTypeId, gx: hoveredCell.gx, gy: hoveredCell.gy });
    if (tower) renderUi();
    return;
  }

  if (cellValue === 2) {
    const tower = state.towers.find((item) => item.gx === hoveredCell.gx && item.gy === hoveredCell.gy);
    state.selectedTowerId = tower?.id ?? null;
    towerDetailsOpen = false;
    renderUi();
    return;
  }

  if (cellValue === 4) {
    selectedObstacleId = [...state.rocks, ...state.trees].find((item) => item.gx === hoveredCell.gx && item.gy === hoveredCell.gy)?.id ?? null;
  }
  state.selectedTowerId = null;
  renderUi();
});

// Pantallas táctiles: un dedo toca o arrastra el mapa; dos dedos lo acercan o alejan.
const touchPoints = new Map();
let touchTravel = 0;
let pinchDistance = null;

function touchPinch() {
  const [a, b] = [...touchPoints.values()];
  return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

sceneRuntime.renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'touch') return;
  touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touchPoints.size === 1) {
    touchTravel = 0;
    didDrag = false;
  } else if (touchPoints.size === 2) {
    pinchDistance = touchPinch().distance;
    didDrag = true;
  }
});

sceneRuntime.renderer.domElement.addEventListener('pointermove', (event) => {
  const previous = touchPoints.get(event.pointerId);
  if (event.pointerType !== 'touch' || !previous) return;
  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;
  previous.x = event.clientX;
  previous.y = event.clientY;

  if (touchPoints.size === 2 && pinchDistance != null) {
    const pinch = touchPinch();
    sceneRuntime.zoom((pinchDistance - pinch.distance) * GAMEPLAY_CONFIG.ui.pinchZoomScale, pinch.x, pinch.y);
    pinchDistance = pinch.distance;
    return;
  }
  if (touchPoints.size !== 1) return;
  touchTravel += Math.hypot(dx, dy);
  if (touchTravel > GAMEPLAY_CONFIG.ui.touchDragThreshold) didDrag = true;
  if (didDrag) sceneRuntime.panBy(dx, dy);
});

function releaseTouch(event) {
  touchPoints.delete(event.pointerId);
  if (touchPoints.size < 2) pinchDistance = null;
}
sceneRuntime.renderer.domElement.addEventListener('pointerup', releaseTouch);
sceneRuntime.renderer.domElement.addEventListener('pointercancel', releaseTouch);

sceneRuntime.renderer.domElement.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    sceneRuntime.zoom(event.deltaY, event.clientX, event.clientY);
  },
  { passive: false },
);

window.addEventListener('resize', () => {
  layoutCoordinator.apply();
  sceneRuntime.resize();
});

window.visualViewport?.addEventListener('resize', () => {
  layoutCoordinator.apply();
  sceneRuntime.resize();
});

window.__layoutAudit = {
  getMetrics() {
    const panelRect = document.getElementById('panel')?.getBoundingClientRect();
    const viewportRect = document.getElementById('viewport')?.getBoundingClientRect();
    const containerRect = document.getElementById('game-container')?.getBoundingClientRect();
    const canvasRect = sceneRuntime.renderer.domElement.getBoundingClientRect();
    const rootStyles = getComputedStyle(document.documentElement);
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      appWidthVar: rootStyles.getPropertyValue('--cfg-app-width').trim(),
      appHeightVar: rootStyles.getPropertyValue('--cfg-app-height').trim(),
      appLeftVar: rootStyles.getPropertyValue('--cfg-app-left').trim(),
      appTopVar: rootStyles.getPropertyValue('--cfg-app-top').trim(),
      bottomBufferVar: rootStyles.getPropertyValue('--cfg-window-bottom-buffer').trim(),
      panelTop: panelRect?.top ?? null,
      panelBottom: panelRect?.bottom ?? null,
      viewportBottom: viewportRect?.bottom ?? null,
      containerLeft: containerRect?.left ?? null,
      containerTop: containerRect?.top ?? null,
      containerRight: containerRect?.right ?? null,
      containerBottom: containerRect?.bottom ?? null,
      canvasLeft: canvasRect?.left ?? null,
      canvasRight: canvasRect?.right ?? null,
      projectedPlayableBounds: sceneRuntime.getProjectedPlayableBounds(),
      framing: sceneRuntime.framing,
    };
  },
};

// Velocidad de la simulación: 1 en el juego; el recorrido visual la sube (solo en dev) para llegar
// a la oleada 3 sin esperar.
let simulationSpeed = 1;
const SIM = GAMEPLAY_CONFIG.simulation;
const stepper = createFixedStepper({ step: SIM.fixedStep, maxStepsPerFrame: SIM.maxStepsPerFrame });

// Lleva a la escena el estado de la simulación y reparte sus eventos.
function presentSimulation() {
  rockRenderer.sync(state, sceneRuntime.camera);
  treeRenderer.sync(state, elapsedTime, sceneRuntime.camera);
  bushRenderer.sync(state);
  fireZoneRenderer.sync(state, elapsedTime);
  towerRenderer.sync(state, elapsedTime, sceneRuntime.camera);
  enemyRenderer.sync(state, sceneRuntime.camera, sceneRuntime.cameraAngle, elapsedTime);
  projectileRenderer.syncProjectiles(state);
  const effects = consumeEffects(state);
  projectileRenderer.handleEffects(effects, towerRenderer, enemyRenderer);
  enemyRenderer.handleEffects(effects);
  audioDirector.handleEffects(effects);
  matchRecorder.handleEffects(effects, state);
}

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const frameSeconds = clock.getDelta();
  const paused = isSimulationPaused();
  // Las animaciones y los efectos van al ritmo de la partida, también acelerada.
  const dt = paused ? 0 : Math.min(frameSeconds, SIM.maxDeltaTime) * simulationSpeed;
  elapsedTime += dt;

  const steps = paused ? 0 : stepper.advance(frameSeconds, simulationSpeed);
  for (let step = 0; step < steps; step++) {
    tickSimulation(state, SIM.fixedStep);
    if (tickWaveCountdown(state, SIM.fixedStep)) window.startWave();
    // Los eventos de un paso se muestran con las unidades como estaban en ese paso: el fogonazo
    // sale de la boca, aunque el cuadro traiga más pasos.
    if (state.effects.length > 0 && step < steps - 1) presentSimulation();
  }
  presentSimulation();
  audioDirector.update(state, paused);
  projectileRenderer.updateParticles(dt);

  if (state.uiDirty) {
    renderUi();
  }

  followSelectedTower();
  followSelectedObstacle();
  mapRenderer.updateAnimatedMarkers(elapsedTime);
  sceneRuntime.renderer.render(sceneRuntime.scene, sceneRuntime.camera);
  towerPreview.render(elapsedTime);
}

// Gancho para agentes y scripts del arnés (scripts/walkthrough.mjs): solo existe en `npm run dev`.
if (import.meta.env.DEV) {
  window.__game = {
    state,
    core: { placeTower, startWave, upgradeTower, upgradeTowerDefense, sellTower, clearCover, resetWave, resetAll },
    renderers: { enemyRenderer, towerRenderer, projectileRenderer },
    camera: sceneRuntime.camera,
    // Llamadas de dibujo del último cuadro (`renderer.info.render.calls`), para medir el render.
    renderInfo: () => ({ ...sceneRuntime.renderer.info.render }),
    setMuted,
    setSpeed: (speed) => {
      setSimulationSpeed(Math.max(1, Math.round(speed)));
    },
    setPaused,
    closeStartScreen: () => closeStartScreen(),
    // Los recorridos automáticos lo apagan para no llenar logs/ con partidas de prueba.
    setRecording: (enabled) => matchRecorder.setEnabled(enabled),
  };
}

renderUi();
setupDeveloperControls();
gameLoop();

