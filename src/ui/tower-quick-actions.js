import { estimateTowerEffectiveness } from '../core/index.js';
import { ICONS } from './icons.js';
import { getTowerActions, makeTowerVersus } from './tower-panel-presenter.js';

const MARGIN_PX = 8;
const ABOVE_TOWER_PX = 58;
const BELOW_TOWER_PX = 30;

function makeButton(className, onclick, icon, text, enabled) {
  return `<button class="quick-btn ${className}" onclick="${onclick}" ${enabled ? '' : 'disabled'}>${icon}<b>${text}</b></button>`;
}

/** Deja una barra sobre su objeto, o debajo si arriba no cabe, siempre dentro del campo. */
export function moveQuickBar(el, x, y, fieldWidth) {
  const { offsetWidth: width, offsetHeight: height } = el;
  const left = Math.max(MARGIN_PX, Math.min(fieldWidth - width - MARGIN_PX, x - width / 2));
  const above = y - ABOVE_TOWER_PX - height;
  const top = above >= MARGIN_PX ? above : y + BELOW_TOWER_PX;
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

// Barra junto a la torre seleccionada: mejorar, blindar y vender con un clic, y contra qué rinde,
// sin abrir el panel de detalle, que tapa buena parte del campo.
export class TowerQuickActions {
  constructor(doc) {
    this.el = doc.getElementById('tower-quick');
  }

  render(state, visible) {
    const tower = visible ? state.towers.find((item) => item.id === state.selectedTowerId) : null;
    this.el.hidden = !tower;
    if (!tower) {
      this.lastHtml = null;
      return;
    }
    const definition = state.config.towerDefinitions[tower.towerTypeId];
    const { upgrade, defense, sell } = getTowerActions(state, tower, definition);
    const effectiveness = estimateTowerEffectiveness(definition, tower.level, state.config.enemyDefinitions);
    const html = `<div class="quick-title">${definition.shortName} · Ataque ${tower.level + 1} · Blindaje ${tower.defenseTier + 1}</div>
      <div class="quick-buttons">
        ${makeButton('quick-up', 'window.doUpgrade()', ICONS.arrowUp, upgrade.max ? 'MÁX' : `$${upgrade.cost}`, upgrade.enabled)}
        ${makeButton('quick-armor', 'window.doUpgradeDefense()', ICONS.defense, defense.max ? 'MÁX' : `$${defense.cost}`, defense.enabled)}
        ${makeButton('quick-sell', 'window.askSell()', ICONS.coins, `$${sell.refund}`, true)}
        <button class="quick-btn quick-info" onclick="window.showTowerDetails()" title="Ver el detalle de la torre"><b>i</b></button>
      </div>
      ${makeTowerVersus(definition, effectiveness)}`;
    // Durante la oleada esto se repinta seguido: reemplazar los botones perdería el clic.
    if (html !== this.lastHtml) {
      this.el.innerHTML = html;
      this.lastHtml = html;
    }
  }

  moveTo(x, y, fieldWidth) {
    moveQuickBar(this.el, x, y, fieldWidth);
  }
}
