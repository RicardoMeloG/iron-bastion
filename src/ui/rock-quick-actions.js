import { GAMEPLAY_CONFIG } from '../content/gameplay.js';
import { ICONS } from './icons.js';
import { moveQuickBar } from './tower-quick-actions.js';

const ROCKS = GAMEPLAY_CONFIG.rocks;
const TREES = GAMEPLAY_CONFIG.trees;

// Burbuja junto a la roca o el árbol seleccionado: qué hace y el botón para sacarlo.
export class RockQuickActions {
  constructor(doc) {
    this.el = doc.getElementById('rock-quick');
  }

  render(state, obstacle) {
    this.el.hidden = !obstacle;
    if (!obstacle) {
      this.lastHtml = null;
      return;
    }
    const isTree = obstacle.kind === 'tree';
    const { clearCost, absorbChance } = isTree ? TREES : ROCKS;
    const canPay = state.credits >= clearCost;
    const chance = Math.round(absorbChance * 100);
    const about = isTree
      ? `No se construye bajo él. Recibe el ${chance} % de los disparos a quien se cubre ahí, hasta caer.`
      : `No se construye sobre ella. Recibe el ${chance} % de los disparos a quien se cubre ahí. La ametralladora casi no la daña; un misil, sí.`;
    const html = `<div class="quick-title">${isTree ? 'Árbol' : 'Roca'}</div>
      <div class="quick-note">${about}</div>
      <button class="quick-btn rock-clear" onclick="window.doClearObstacle()" ${canPay ? '' : 'disabled'}>${ICONS.coins}<b>Sacar: $${clearCost}</b></button>`;
    // Durante la oleada esto se repinta seguido: reemplazar el botón perdería el clic.
    if (html !== this.lastHtml) {
      this.el.innerHTML = html;
      this.lastHtml = html;
    }
  }

  moveTo(x, y, fieldWidth) {
    moveQuickBar(this.el, x, y, fieldWidth);
  }
}
