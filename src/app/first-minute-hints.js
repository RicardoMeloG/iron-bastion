// Especificación 003 M3: dos consejos breves para los primeros minutos.
// Un consejo por navegador (localStorage, sin cookies).
// Descartables por el jugador; no constituyen un tutorial guiado.
// Lógica pura, sin DOM; ejecutable en Node.

export const HINT_KEYS = {
  place: 'iron-bastion:consejo-torre',
  upgrade: 'iron-bastion:consejo-mejora',
};

export const HINT_TEXTS = {
  place: 'Pon tu primera torre: elige una a la izquierda y toca una celda libre junto al camino.',
  upgrade:
    'Ya te alcanza para evolucionar una torre: tócala y mejora su ataque. Evolucionar rinde más que poner otra básica.',
};

export function canAffordUpgrade(state) {
  if (!Number.isFinite(state.credits)) return false;
  return state.towers.some((tower) => {
    if (tower.destroyed) return false;
    const definition = state.config.towerDefinitions[tower.towerTypeId];
    if (!definition) return false;
    if (tower.level >= definition.levels.length - 1) return false;
    const cost = definition.levels[tower.level].upgradeCost;
    if (cost == null) return false;
    return state.credits >= cost;
  });
}

export function createFirstMinuteHints({ storage = null, show, hide }) {
  const seen = new Set();
  let current = null;

  function isSeen(id) {
    if (seen.has(id)) return true;
    try {
      return storage?.getItem(HINT_KEYS[id]) === '1';
    } catch {
      return false;
    }
  }

  function markSeen(id) {
    seen.add(id);
    try {
      storage?.setItem(HINT_KEYS[id], '1');
    } catch {
      // Almacenamiento no disponible; el Set en memoria basta.
    }
  }

  function update(state, { blocked = false } = {}) {
    // 1. El objetivo del consejo "place" se cumplió.
    if (current === 'place' && state.towers.length > 0) {
      hide();
      current = null;
    }
    // 2. El objetivo del consejo "upgrade" se cumplió.
    if (current === 'upgrade' && state.towers.some((t) => t.level > 0)) {
      hide();
      current = null;
    }
    // 3. No mostrar nada nuevo si hay un modal, fin de partida o modo dev.
    if (blocked || state.gameOver || state.developerMode?.enabled) return;
    // 4. Mostrar el siguiente consejo pendiente.
    if (current === null) {
      if (!isSeen('place') && state.towers.length === 0) {
        markSeen('place');
        current = 'place';
        show('place', HINT_TEXTS.place);
      } else if (!isSeen('upgrade') && canAffordUpgrade(state)) {
        markSeen('upgrade');
        current = 'upgrade';
        show('upgrade', HINT_TEXTS.upgrade);
      }
    }
  }

  function dismiss() {
    if (current !== null) {
      hide();
      current = null;
    }
  }

  return {
    update,
    dismiss,
    get current() {
      return current;
    },
  };
}
