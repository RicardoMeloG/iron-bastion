import { SCORE_CATEGORIES } from '../core/index.js';

export const SCORE_LABELS = {
  enemigos: 'Enemigos destruidos',
  oleadas: 'Oleadas superadas',
  sinPerdidas: 'Oleadas sin perder vidas',
  adelanto: 'Oleadas adelantadas',
  rapidez: 'Rapidez',
  torresPerdidas: 'Torres perdidas',
  vidasPerdidas: 'Vidas perdidas',
  victoria: 'Victoria',
};

const MAX_POPS = 4;
const POP_LIFETIME_MS = 1200;

export class ScorePresenter {
  /** @param {Document} [doc] */
  constructor(doc = document) {
    this._doc = doc;
  }

  /** Actualiza el contador del HUD. */
  render(total) {
    const el = this._doc.getElementById('score');
    if (!el) return;
    el.textContent = total.toLocaleString('es-CL');
  }

  /** Muestra un pop «+N» o «−N» junto al contador. */
  pop(points) {
    const container = this._doc.getElementById('score-pops');
    if (!container) return;

    const span = this._doc.createElement('span');
    span.className = points > 0 ? 'score-pop up' : 'score-pop down';
    span.textContent = points > 0 ? `+${points}` : `\u2212${Math.abs(points)}`;
    container.appendChild(span);

    // Máximo 4 pops visibles: se descarta el más antiguo.
    while (container.children.length > MAX_POPS) {
      container.removeChild(container.firstChild);
    }

    setTimeout(() => {
      if (span.parentNode) span.parentNode.removeChild(span);
    }, POP_LIFETIME_MS);
  }

  /** Muestra el resumen por categoría al terminar la partida. */
  showSummary(score, best, isNew) {
    const ul = this._doc.getElementById('score-summary');
    if (!ul) return;

    ul.textContent = '';

    for (const category of SCORE_CATEGORIES) {
      const value = score.byCategory[category];
      if (value === 0) continue;
      const li = this._doc.createElement('li');
      const label = this._doc.createElement('span');
      label.textContent = SCORE_LABELS[category];
      const val = this._doc.createElement('b');
      val.textContent = value.toLocaleString('es-CL');
      li.appendChild(label);
      li.appendChild(val);
      ul.appendChild(li);
    }

    // Total
    const totalLi = this._doc.createElement('li');
    totalLi.className = 'score-total';
    const totalLabel = this._doc.createElement('span');
    totalLabel.textContent = 'Total';
    const totalVal = this._doc.createElement('b');
    totalVal.textContent = score.total.toLocaleString('es-CL');
    totalLi.appendChild(totalLabel);
    totalLi.appendChild(totalVal);
    ul.appendChild(totalLi);

    // Mejor puntaje / nuevo récord
    if (isNew || best !== null) {
      const bestLi = this._doc.createElement('li');
      bestLi.className = 'score-best';
      bestLi.textContent = isNew
        ? '¡Nuevo mejor puntaje!'
        : `Mejor puntaje: ${best.toLocaleString('es-CL')}`;
      ul.appendChild(bestLi);
    }

    ul.hidden = false;
  }

  /** Oculta el resumen. */
  hideSummary() {
    const ul = this._doc.getElementById('score-summary');
    if (!ul) return;
    ul.hidden = true;
  }

  /** Muestra (u oculta) el mejor puntaje en la pantalla de inicio. */
  showBest(best) {
    const el = this._doc.getElementById('best-score');
    if (!el) return;
    if (best === null) {
      el.hidden = true;
      return;
    }
    el.textContent = `Tu mejor puntaje: ${best.toLocaleString('es-CL')}`;
    el.hidden = false;
  }
}
