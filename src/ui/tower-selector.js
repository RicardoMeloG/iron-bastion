import { estimateTowerEffectiveness, getTowerLimit } from '../core/index.js';
import { ICONS } from './icons.js';
import { makeTowerVersus } from './tower-panel-presenter.js';

// Barra de torres (spec 002): una tarjeta por torre, con su imagen de concepto
// (public/towers/<id>.webp) y su costo. La elegida es la que se pone al hacer clic en una
// celda libre; también se elige con las teclas 1, 2…
export class TowerSelector {
  constructor(doc, towerDefinitions, enemyDefinitions, onSelect) {
    this.containerEl = doc.getElementById('tower-selector');
    this.cards = new Map();
    for (const definition of Object.values(towerDefinitions)) {
      const card = doc.createElement('button');
      card.type = 'button';
      card.className = 'tower-card';
      card.dataset.towerTypeId = definition.id;
      card.title = definition.displayName;
      card.innerHTML = `<img class="tower-card-image" src="${import.meta.env.BASE_URL}towers/${definition.id}.webp" alt="" />
        <span class="tower-card-name">${definition.shortName ?? definition.displayName}</span>
        <span class="tower-card-class">${definition.panelModel.className}</span>
        <span class="tower-card-cost">${ICONS.coins}$${definition.economy.baseCost}</span>
        <span class="versus-title">Daño en nivel máximo</span>
        ${makeTowerVersus(definition, estimateTowerEffectiveness(definition, definition.levels.length - 1, enemyDefinitions))}
        <span class="tower-card-tag">A COLOCAR</span>`;
      card.addEventListener('click', () => onSelect(definition.id));
      this.containerEl.appendChild(card);
      this.cards.set(definition.id, card);
    }
    this.order = [...this.cards.keys()];
  }

  /** La torre de la tecla `key` ('1', '2'…), o null. */
  towerForKey(key) {
    const index = Number.parseInt(key, 10) - 1;
    return Number.isInteger(index) ? this.order[index] ?? null : null;
  }

  render(state) {
    const atLimit = state.towers.length >= getTowerLimit(state);
    for (const [towerTypeId, card] of this.cards) {
      const definition = state.config.towerDefinitions[towerTypeId];
      card.classList.toggle('active', state.buildTowerTypeId === towerTypeId);
      // Mientras se inspecciona una torre, el próximo clic en el campo no construye.
      card.classList.toggle('standby', Boolean(state.selectedTowerId));
      card.classList.toggle('unaffordable', atLimit || state.credits < definition.economy.baseCost);
      card.setAttribute('aria-pressed', String(state.buildTowerTypeId === towerTypeId));
    }
  }
}
