import { gridToWorld } from './coordinates.js';
import { GAMEPLAY_CONFIG } from '../content/gameplay.js';

function cloneValue(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

let nextEntityId = 1;

export function allocateId(prefix) {
  const id = `${prefix}-${nextEntityId}`;
  nextEntityId += 1;
  return id;
}

export function cloneStateValue(value) {
  return cloneValue(value);
}

export function markUiDirty(state) {
  state.uiDirty = true;
}

export function markWorldDirty(state) {
  state.worldDirty = true;
}

export function queueEffect(state, effect) {
  state.effects.push(effect);
  markWorldDirty(state);
}

export function consumeEffects(state) {
  const effects = state.effects.slice();
  state.effects.length = 0;
  return effects;
}

export function getTowerLevel(definition, level) {
  return definition.levels[level];
}

export function getTowerRange(definition, level) {
  return getTowerLevel(definition, level).range;
}

export function getCellWorldPosition(config, gx, gy) {
  return gridToWorld(gx, gy, config.worldScale, config.halfWidth, config.halfHeight);
}

function createCover(config, cells, kind, { maxHp }) {
  return (cells ?? []).map(([gx, gy]) => {
    const { x: wx, z: wz } = getCellWorldPosition(config, gx, gy);
    return { id: `${kind}-${gx}-${gy}`, kind, gx, gy, wx, wz, hp: maxHp, maxHp };
  });
}

export function createInitialState(config) {
  return {
    config,
    grid: cloneValue(config.baseGrid),
    credits: config.mapDefinition.initialCredits,
    lives: config.mapDefinition.maxLives,
    wave: 0,
    waveActive: false,
    gameOver: false,
    victory: false,
    towers: [],
    rocks: createCover(config, config.mapDefinition.rocks, 'rock', GAMEPLAY_CONFIG.rocks),
    trees: createCover(config, config.mapDefinition.trees, 'tree', GAMEPLAY_CONFIG.trees),
    bushes: createCover(config, config.mapDefinition.bushes, 'bush', GAMEPLAY_CONFIG.bushes),
    combatRandomSeed: 0,
    enemies: [],
    // Las zonas que arden tras un impacto incendiario.
    fireZones: [],
    projectiles: [],
    selectedTowerId: null,
    // La torre que se pone al hacer clic en una celda libre (la elige la barra de torres).
    buildTowerTypeId: Object.keys(config.towerDefinitions)[0],
    spawnQueue: [],
    spawnTimer: 0,
    spawnGaps: {},
    spawnedThisWave: 0,
    // Las escuadras de esta oleada que ya le costaron su vida.
    leakedTeams: [],
    nextLane: 1,
    waveCountdown: GAMEPLAY_CONFIG.waves.countdown.firstSeconds,
    activeWaveDefinition: null,
    waveSnapshot: null,
    effects: [],
    uiDirty: true,
    worldDirty: true,
    developerMode: {
      enabled: false,
      savedCredits: null,
    },
    overlay: {
      visible: false,
      title: '',
      text: '',
      color: GAMEPLAY_CONFIG.overlays.defaultColor,
    },
  };
}

export function createWaveSnapshot(state) {
  return cloneValue({
    grid: state.grid,
    credits: state.credits,
    lives: state.lives,
    wave: state.wave,
    towers: state.towers,
    rocks: state.rocks,
    trees: state.trees,
    bushes: state.bushes,
    selectedTowerId: state.selectedTowerId,
  });
}

// Solo deshace la oleada en curso (también la perdida, que sigue activa). Con la oleada ya
// terminada no hay nada que reintentar: devolvería vidas gratis.
export function resetWave(state, snapshot = state.waveSnapshot) {
  if (!snapshot || !state.waveActive) {
    return state;
  }

  state.grid = cloneValue(snapshot.grid);
  state.credits = snapshot.credits;
  state.lives = snapshot.lives;
  state.wave = snapshot.wave;
  state.towers = cloneValue(snapshot.towers);
  state.rocks = cloneValue(snapshot.rocks);
  state.trees = cloneValue(snapshot.trees);
  state.bushes = cloneValue(snapshot.bushes);
  state.selectedTowerId = snapshot.selectedTowerId;
  state.enemies = [];
  state.fireZones = [];
  state.projectiles = [];
  state.spawnQueue = [];
  state.spawnTimer = 0;
  state.spawnGaps = {};
  state.spawnedThisWave = 0;
  state.leakedTeams = [];
  state.activeWaveDefinition = null;
  state.waveActive = false;
  state.waveCountdown = snapshot.wave === 0 ? GAMEPLAY_CONFIG.waves.countdown.firstSeconds : GAMEPLAY_CONFIG.waves.countdown.betweenSeconds;
  state.gameOver = false;
  state.victory = false;
  state.overlay.visible = false;
  state.effects.length = 0;
  markUiDirty(state);
  markWorldDirty(state);
  return state;
}

export function resetAll(state) {
  const fresh = createInitialState(state.config);
  Object.assign(state, fresh);
  return state;
}
