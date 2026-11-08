import { getLateWaveScale, summarizeWave } from '../core/index.js';

// Panel derecho: la oleada que viene o, mientras se combate, la que está en curso.
export class WaveInfoPresenter {
  constructor(doc) {
    this.el = doc.getElementById('next-wave');
  }

  render(state) {
    const { waves } = state.config.waveSet;
    const wave = state.waveActive ? waves[state.wave - 1] : waves[state.wave];
    const remaining = state.spawnQueue.length + state.enemies.length;
    const key = `${state.wave}|${state.waveActive}|${state.waveActive ? remaining : ''}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    if (!wave) {
      this.el.innerHTML = '<div class="next-wave-title">SIN MÁS OLEADAS</div>';
      return;
    }
    const { total, reward: baseReward, rows } = summarizeWave(wave.spawns, state.config.enemyDefinitions);
    const reward = Math.round(baseReward * getLateWaveScale(state.waveActive ? state.wave : state.wave + 1).reward);
    const title = state.waveActive ? 'EN COMBATE' : 'PRÓXIMA OLEADA';
    const count = state.waveActive ? `<span>Quedan</span><b>${remaining > total ? remaining : `${remaining} de ${total}`}</b>` : `<span>Enemigos</span><b>${total}</b>`;
    this.el.innerHTML = `<div class="next-wave-title"><span class="next-wave-chevrons">»</span>${title}</div>
      <div class="next-wave-line">${count}</div>
      <div class="next-wave-line"><span>Recompensa</span><b class="next-wave-reward">$${reward}</b></div>
      <ul class="next-wave-list${rows.length > 8 ? ' next-wave-list-tight' : rows.length > 5 ? ' next-wave-list-compact' : ''}">
        ${rows.map((row) => `<li class="armor-${row.armorClass}"><img src="${import.meta.env.BASE_URL}vehicles/${row.id}.webp" alt="" /><span class="next-wave-name"><b>${row.count}</b> ${row.name}</span></li>`).join('')}
      </ul>`;
  }
}
