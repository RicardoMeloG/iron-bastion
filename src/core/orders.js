// Especificación 003: punto único de entrada para órdenes del jugador.
// El juego (src/app/main.js) y la reproducción (tools/balance) pasan por aquí,
// por lo que una partida grabada se reproduce de forma idéntica.
// Las torres se identifican por su celda porque los ids de entidad dependen de la sesión.

import { resetWave } from './state.js';
import { clearCover, placeTower, sellTower, startWave, upgradeTower, upgradeTowerDefense } from './simulation.js';

/** Valida que `celda` sea un array de dos enteros. */
function isValidCell(celda) {
  return (
    Array.isArray(celda) &&
    celda.length === 2 &&
    Number.isInteger(celda[0]) &&
    Number.isInteger(celda[1])
  );
}

/** Busca la torre en `state.towers` cuya posición coincide con `[gx, gy]`. */
function findTowerAt(state, gx, gy) {
  return state.towers.find((t) => t.gx === gx && t.gy === gy);
}

/** Busca la cobertura (roca o árbol) en la celda indicada. */
function findCoverAt(state, gx, gy) {
  const all = [...state.rocks, ...state.trees];
  return all.find((c) => c.gx === gx && c.gy === gy);
}

/** Aplica una orden del jugador; devuelve true si el núcleo la aceptó. */
export function applyOrder(state, order) {
  if (!order || typeof order !== 'object') return false;

  const { tipo, celda } = order;

  switch (tipo) {
    case 'torre': {
      if (!isValidCell(celda)) return false;
      const [gx, gy] = celda;
      return Boolean(placeTower(state, { towerTypeId: order.torre, gx, gy }));
    }

    case 'ataque': {
      if (!isValidCell(celda)) return false;
      const [gx, gy] = celda;
      const tower = findTowerAt(state, gx, gy);
      if (!tower) return false;
      return Boolean(upgradeTower(state, tower.id));
    }

    case 'blindaje': {
      if (!isValidCell(celda)) return false;
      const [gx, gy] = celda;
      const tower = findTowerAt(state, gx, gy);
      if (!tower) return false;
      return Boolean(upgradeTowerDefense(state, tower.id));
    }

    case 'vender': {
      if (!isValidCell(celda)) return false;
      const [gx, gy] = celda;
      const tower = findTowerAt(state, gx, gy);
      if (!tower) return false;
      return Boolean(sellTower(state, tower.id));
    }

    case 'despejar': {
      if (!isValidCell(celda)) return false;
      const [gx, gy] = celda;
      const cover = findCoverAt(state, gx, gy);
      if (!cover) return false;
      return Boolean(clearCover(state, cover.id));
    }

    case 'oleada': {
      return Boolean(startWave(state));
    }

    case 'reintentar': {
      if (!state.waveActive) return false;
      resetWave(state);
      return true;
    }

    default:
      return false;
  }
}
