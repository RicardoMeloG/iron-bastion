import { estimateTowerEffectiveness, getSellRefund, getTowerMaxHp } from '../core/index.js';
import { ICONS } from './icons.js';

// El vehículo que representa a cada clase de blindaje en la fila de efectividad.
const EFFECT_ROWS = [
  { armorClass: 'heavy', label: 'blindaje pesado', icon: 'tank-heavy' },
  { armorClass: 'medium', label: 'blindaje medio', icon: 'apc-8x8' },
  { armorClass: 'light', label: 'blindaje ligero', icon: 'patrulla' },
  { armorClass: 'infantry', label: 'infantería', icon: 'infantry-mg' },
];

/** Lo que se puede hacer con una torre: el panel y la barra rápida muestran lo mismo. */
export function getTowerActions(state, tower, definition) {
  const offense = definition.levels[tower.level];
  const defense = definition.defenseLevels[tower.defenseTier];
  const defenseMax = tower.defenseTier >= definition.defenseLevels.length - 1;
  return {
    upgrade: { cost: offense.upgradeCost, max: offense.upgradeCost == null, enabled: offense.upgradeCost != null && !tower.destroyed && state.credits >= offense.upgradeCost },
    defense: { cost: defense.upgradeCost, max: defenseMax, enabled: !defenseMax && !tower.destroyed && state.credits >= defense.upgradeCost },
    sell: { refund: getSellRefund(definition, tower) },
  };
}

function formatEffect(percent) {
  if (percent <= -100) return 'Sin daño';
  if (percent > 0) return `+${percent} %`;
  return percent === 0 ? '=' : `−${-percent} %`;
}

/** Tres vehículos con cuánto daño real les hace la torre, para ver de un vistazo contra qué sirve. */
export function makeVersusChips(effectiveness) {
  return EFFECT_ROWS.map(({ armorClass, label, icon }) => {
    const percent = Math.round(effectiveness[armorClass] * 100);
    const tone = percent > -25 ? 'effect-good' : percent > -60 ? 'effect-fair' : 'effect-bad';
    return `<span class="versus-chip ${tone}" title="Contra ${label}: ${formatEffect(percent)} de daño"><img src="${import.meta.env.BASE_URL}vehicles/${icon}.webp" alt="${label}" /><b>${percent <= -100 ? '0' : formatEffect(percent)}</b></span>`;
  }).join('');
}

/** Contra qué sirve una torre: los blindados de tierra o, si no dispara a tierra, lo que vuela. */
export function makeTowerVersus(definition, effectiveness) {
  if (definition.combatModel.targets?.ground === false) return '<span class="versus-chips versus-air">Solo contra drones</span>';
  return `<span class="versus-chips">${makeVersusChips(effectiveness)}</span>`;
}

function makeEffectCell({ armorClass, label, icon }, value) {
  const percent = Math.round(value * 100);
  const text = formatEffect(percent);
  const tone = percent > 0 ? 'effect-good' : percent >= -30 ? 'effect-fair' : 'effect-bad';
  return `<div class="effect-cell ${tone}" data-armor="${armorClass}">
    <img src="${import.meta.env.BASE_URL}vehicles/${icon}.webp" alt="" />
    <div><b>${text}</b><span>vs ${label}</span></div>
  </div>`;
}

function makeStatCard(icon, title, titleClass, bgClass, borderClass, value, max, barColor, next) {
  const parsedValue = typeof value === 'number' ? value : parseFloat(value);
  const numericValue = Number.isFinite(parsedValue) ? parsedValue : 0;
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, Math.round((numericValue / safeMax) * 100)));
  const nextHtml = next
    ? `<div class="stat-next"><span class="stat-next-icon">${ICONS.arrowUpSmall}</span><span class="stat-next-label">Próximo:</span><b>${next}</b></div>`
    : '';

  return `<div class="stat-card ${borderClass}">
    <div class="stat-icon ${bgClass}">${icon}</div>
    <div class="stat-body">
      <div class="stat-title ${titleClass}">${title}</div>
      <div class="stat-current"><span>Actual:</span><b>${value}</b></div>
      <div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
      ${nextHtml}
    </div>
  </div>`;
}

export class TowerPanelPresenter {
  constructor(doc, preview) {
    this.panelEl = doc.getElementById('panel');
    this.previewEl = doc.getElementById('preview-3d');
    this.statsEl = doc.getElementById('stats-section');
    this.actionsEl = doc.getElementById('actions-section');
    this.preview = preview;
    this.renderEmptyState();
  }

  render(state, detailsOpen) {
    const tower = detailsOpen ? state.towers.find((item) => item.id === state.selectedTowerId) : null;
    if (!tower) {
      this.renderEmptyState();
      return;
    }

    const definition = state.config.towerDefinitions[tower.towerTypeId];
    const offense = definition.levels[tower.level];
    const nextOffense = tower.level < definition.levels.length - 1 ? definition.levels[tower.level + 1] : null;
    const defenseLevels = definition.defenseLevels ?? [];
    const defense = defenseLevels[tower.defenseTier] ?? defenseLevels[0];
    const nextDefense = tower.defenseTier < defenseLevels.length - 1 ? defenseLevels[tower.defenseTier + 1] : null;
    const hpRatio = tower.maxHp > 0 ? tower.hp / tower.maxHp : 0;
    const { className, description, idealTarget } = definition.panelModel;
    const effectiveness = estimateTowerEffectiveness(definition, tower.level, state.config.enemyDefinitions);
    const actions = getTowerActions(state, tower, definition);

    this.panelEl.classList.remove('panel-empty');
    this.preview.setTower(definition, tower.level);

    this.statsEl.innerHTML = `<div class="tower-header">
      <div class="tower-heading">
        <div class="tower-title"><div class="tower-name">${definition.displayName}</div><span class="tower-class">${className}</span></div>
        <div class="tower-description">${description}</div>
        <div class="tower-subtitle">Ataque nivel ${tower.level + 1}: ${offense.label}${offense.magazine ? ` · ${offense.magazine} tubos, recarga ${offense.reload} s` : ''}</div>
        <div class="tower-subtitle">${defense.label} (nivel ${tower.defenseTier + 1}) · vida ${Math.round(tower.hp)}/${tower.maxHp} · armadura ${tower.armor}</div>
      </div>
      <div class="tower-kills">${ICONS.kill}<span>${tower.kills}</span></div>
    </div>
    <div class="stat-grid">
      ${makeStatCard(ICONS.damage, 'DAÑO', 'text-red', 'bg-red', 'border-red', offense.damage, definition.panelModel.maxStats.damage, '#D96C7E', nextOffense ? nextOffense.damage : null)}
      ${makeStatCard(ICONS.rate, 'CADENCIA', 'text-yellow', 'bg-yellow', 'border-yellow', `${offense.rate}/s`, definition.panelModel.maxStats.rate, '#D8BD52', nextOffense ? `${nextOffense.rate}/s` : null)}
      ${makeStatCard(ICONS.range, 'RANGO', 'text-blue', 'bg-blue', 'border-blue', `${offense.range}u`, definition.panelModel.maxStats.range, '#6A97E2', nextOffense ? `${nextOffense.range}u` : null)}
      ${makeStatCard(ICONS.hp, 'RESISTENCIA', 'text-green', 'bg-green', 'border-green', `${Math.round(hpRatio * 100)}%`, 100, '#67D46A', nextDefense ? `${getTowerMaxHp(definition, tower, tower.defenseTier + 1)} HP` : null)}
    </div>
    <div class="effect-row">
      <div class="effect-label">EFECTIVIDAD<br />DE ATAQUE</div>
      ${EFFECT_ROWS.map((row) => makeEffectCell(row, effectiveness[row.armorClass])).join('')}
    </div>
    <div class="tower-ideal"><b>OBJETIVO IDEAL:</b> ${idealTarget}</div>`;

    let actionsHtml = '';
    if (offense.upgradeCost != null) {
      const canUpgradeOffense = actions.upgrade.enabled;
      actionsHtml += `<button class="btn-upgrade" onclick="window.doUpgrade()" ${canUpgradeOffense ? '' : 'disabled'}>
        ${ICONS.arrowUp}
        <span class="btn-label">MEJORAR</span>
        <span class="btn-price">$${offense.upgradeCost}</span>
      </button>`;
    } else {
      actionsHtml += `<button class="btn-maxlevel">
        ${ICONS.star}
        <span class="btn-label">ATAQUE</span>
        <span class="btn-price">MÁX</span>
      </button>`;
    }

    if (nextDefense) {
      const defenseCost = defense.upgradeCost;
      const canUpgradeDefense = actions.defense.enabled;
      actionsHtml += `<button class="btn-defense" onclick="window.doUpgradeDefense()" ${canUpgradeDefense ? '' : 'disabled'}>
        ${ICONS.defense}
        <span class="btn-label">BLINDAJE</span>
        <span class="btn-price">$${defenseCost}</span>
      </button>`;
    } else {
      actionsHtml += `<button class="btn-defense btn-defense-max" disabled>
        ${ICONS.defense}
        <span class="btn-label">BLINDAJE</span>
        <span class="btn-price">MÁX</span>
      </button>`;
    }

    actionsHtml += `<button class="btn-sell" onclick="window.askSell()">
      ${ICONS.coins}
      <span class="btn-label">VENDER</span>
      <span class="btn-price">$${actions.sell.refund}</span>
    </button>`;

    // Durante la oleada esto se repinta con cada baja: reemplazar los botones entre que se
    // aprieta y se suelta el mouse perdería el clic.
    if (actionsHtml !== this.lastActionsHtml) {
      this.actionsEl.innerHTML = actionsHtml;
      this.lastActionsHtml = actionsHtml;
    }
  }

  renderEmptyState() {
    this.lastActionsHtml = null;
    this.panelEl.classList.add('panel-empty');
    this.preview.clear();
  }
}
