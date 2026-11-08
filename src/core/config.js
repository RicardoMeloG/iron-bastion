import { enemyDefinitions } from '../content/enemies/index.js';
import { mapDefinitions } from '../content/maps/index.js';
import { towerDefinitions } from '../content/towers/index.js';
import { waveSetDefinitions } from '../content/waves/index.js';
import { gridToWorld } from './coordinates.js';
import { GAMEPLAY_CONFIG } from '../content/gameplay.js';
import { rigDefinitions } from '../content/rigs/index.js';

// Cada unidad apunta y dispara desde su rig (src/content/rigs/): un tipo sin rig, o armado
// y sin bocas, es un error del contenido y se avisa al arrancar.
function checkUnitModels(enemyDefinitions, towerDefinitions) {
  for (const definition of Object.values(enemyDefinitions)) {
    const rig = rigDefinitions[definition.model?.rig];
    if (!rig) throw new Error(`El enemigo ${definition.id} usa el rig "${definition.model?.rig}", que no existe en src/content/rigs/`);
    if (definition.combatModel.isArmed && !rig.muzzles?.length) {
      throw new Error(`El enemigo ${definition.id} está armado, pero su rig ${rig.id} no tiene bocas`);
    }
  }
  for (const definition of Object.values(towerDefinitions)) {
    definition.levels.forEach((_, level) => {
      const rig = rigDefinitions[definition.model?.rigs?.[level]];
      if (!rig?.muzzles?.length) throw new Error(`La torre ${definition.id} no tiene un rig con bocas para el nivel ${level + 1}`);
    });
  }
}

// Celdas: 0 libre, 1 camino, 2 torre (solo en la partida), 3 territorio enemigo, 4 roca o árbol, fuera de cámara y sin construir.
function buildBaseGrid(mapDefinition) {
  const territoryColumns = mapDefinition.enemyTerritory?.columns ?? 0;
  const grid = Array.from({ length: mapDefinition.height }, () =>
    Array.from({ length: mapDefinition.width }, (_, x) => (x < territoryColumns ? 3 : 0)));
  const { pathPoints } = mapDefinition;

  for (let i = 0; i < pathPoints.length - 1; i++) {
    const [x0, y0] = pathPoints[i];
    const [x1, y1] = pathPoints[i + 1];
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    let cx = x0;
    let cy = y0;

    while (cx !== x1 || cy !== y1) {
      grid[cy][cx] = 1;
      cx += dx;
      cy += dy;
    }
    grid[y1][x1] = 1;
  }

  for (const [x, y] of mapDefinition.rocks ?? []) {
    if (grid[y]?.[x] !== 0) throw new Error(`La roca de (${x}, ${y}) no está en una celda libre`);
    grid[y][x] = 4;
  }

  for (const [x, y] of mapDefinition.trees ?? []) {
    if (grid[y]?.[x] !== 0) throw new Error(`El árbol de (${x}, ${y}) no está en una celda libre`);
    grid[y][x] = 4;
  }

  // Los arbustos dejan la celda libre.
  for (const [x, y] of mapDefinition.bushes ?? []) {
    if (grid[y]?.[x] !== 0) throw new Error(`El arbusto de (${x}, ${y}) no está en una celda libre`);
  }

  return grid;
}

function buildPathWorld(mapDefinition, worldScale, pathSurfaceY) {
  const halfWidth = mapDefinition.width / 2;
  const halfHeight = mapDefinition.height / 2;

  return mapDefinition.pathPoints.map(([gx, gy]) => {
    const world = gridToWorld(gx, gy, worldScale, halfWidth, halfHeight);
    return {
      x: world.x,
      y: pathSurfaceY,
      z: world.z,
    };
  });
}

export function createGameConfig({
  mapId = 'default-map',
  waveSetId = 'default-waves',
  worldScale = GAMEPLAY_CONFIG.worldScaleDefault,
} = {}) {
  const mapDefinition = mapDefinitions[mapId];
  const waveSet = waveSetDefinitions[waveSetId];

  if (!mapDefinition) {
    throw new Error(`Unknown map definition: ${mapId}`);
  }

  if (!waveSet) {
    throw new Error(`Unknown wave set: ${waveSetId}`);
  }

  checkUnitModels(enemyDefinitions, towerDefinitions);

  const groundTileHeightWorld = (mapDefinition.visualModel?.groundTileHeight ?? 0.04) * worldScale;
  const pathTileHeightWorld = (mapDefinition.visualModel?.pathTileHeight ?? 0.08) * worldScale;
  const pathSurfaceY = pathTileHeightWorld;

  return {
    mapId,
    waveSetId,
    mapDefinition,
    waveSet,
    towerDefinitions,
    enemyDefinitions,
    worldScale,
    groundTileHeightWorld,
    pathTileHeightWorld,
    pathSurfaceY,
    baseGrid: buildBaseGrid(mapDefinition),
    pathWorld: buildPathWorld(mapDefinition, worldScale, pathSurfaceY),
    halfWidth: mapDefinition.width / 2,
    halfHeight: mapDefinition.height / 2,
  };
}
