import { GAMEPLAY_CONFIG } from '../content/gameplay.js';

export class HudPresenter {
  constructor(doc = document) {
    this.doc = doc;
    this.creditsEl = doc.getElementById('credits');
    this.waveEl = doc.getElementById('wave');
    this.waveTotalEl = doc.getElementById('wave-total');
    this.countdownEl = doc.getElementById('wave-countdown');
    this.enemyCountEl = doc.getElementById('enemy-count');
    this.lifeFillEl = doc.getElementById('life-bar-fill');
    this.waveButtonEl = doc.getElementById('wave-btn');
    this.overlayEl = doc.getElementById('overlay');
    this.overlayTitleEl = doc.getElementById('overlay-title');
    this.overlayTextEl = doc.getElementById('overlay-text');
    this.overlayRetryEl = doc.getElementById('overlay-retry');
    this.tipEl = doc.getElementById('tip');
    this.resetWaveEl = doc.getElementById('reset-wave-btn');
  }

  setTip(parts) {
    const key = parts.join('|');
    if (key === this.tipKey) return;
    this.tipKey = key;
    this.tipEl.innerHTML = parts.map((part) => `<span class="tip-part">${part}</span>`).join('');
  }

  render(state) {
    this.creditsEl.textContent = Number.isFinite(state.credits) ? `${Math.floor(state.credits)}` : '∞';
    this.waveEl.textContent = state.wave;
    this.waveTotalEl.textContent = state.config.waveSet.waves.length;
    this.enemyCountEl.textContent = state.enemies.length;

    const waiting = state.waveCountdown != null && !state.waveActive && !state.gameOver && !state.developerMode.enabled;
    this.countdownEl.hidden = !waiting;
    if (waiting) {
      const seconds = Math.ceil(state.waveCountdown);
      this.countdownEl.textContent = seconds;
      this.countdownEl.classList.toggle('urgent', seconds <= GAMEPLAY_CONFIG.waves.countdown.urgentSeconds);
    }

    const ratio = Math.max(0, state.lives / state.config.mapDefinition.maxLives);
    this.lifeFillEl.style.width = `${ratio * 100}%`;
    this.lifeFillEl.style.background = ratio > 0.5 ? '#22C55E' : ratio > 0.25 ? '#EAB308' : '#EF4444';

    if (state.waveActive) {
      this.waveButtonEl.disabled = true;
      this.waveButtonEl.textContent = `Oleada ${state.wave}...`;
      this.waveButtonEl.classList.add('wave-active');
    } else if (state.wave >= state.config.waveSet.waves.length) {
      this.waveButtonEl.disabled = true;
      this.waveButtonEl.textContent = 'Victoria';
      this.waveButtonEl.classList.remove('wave-active');
    } else {
      this.waveButtonEl.disabled = false;
      this.waveButtonEl.textContent = `▶ Oleada ${state.wave + 1} ahora`;
      this.waveButtonEl.classList.remove('wave-active');
    }

    // Sin oleada en curso no hay nada que reiniciar.
    this.resetWaveEl.disabled = !state.waveActive;

    if (this.tipEl) {
      if (state.selectedTowerId) {
        this.setTip(['Torre seleccionada', 'i: ver detalle', 'Esc o clic en el campo: cerrar']);
      } else if (state.waveActive) {
        this.setTip(['Oleada en curso: puedes construir, mejorar y vender mientras combates', 'P: pausa', 'V: velocidad']);
      } else {
        this.setTip(['Clic: colocar', '1 a 4: elegir torre', 'Clic en torre: mejorar', 'Clic en roca o árbol: sacarlo', 'Rueda: zoom', 'Botón derecho: mover', 'Botón central: girar', 'M: sonido', 'P: pausa']);
      }
    }

    if (state.overlay.visible) {
      this.overlayEl.classList.add('show');
      this.overlayTitleEl.textContent = state.overlay.title;
      this.overlayTitleEl.style.color = state.overlay.color;
      this.overlayTextEl.textContent = state.overlay.text;
      // Tras la victoria no hay oleada que reintentar: solo «Jugar de nuevo».
      this.overlayRetryEl.hidden = Boolean(state.victory);
    } else {
      this.overlayEl.classList.remove('show');
    }

    state.uiDirty = false;
  }
}
