// Presentador DOM para el consejo de los primeros minutos.
// Única capa que toca el DOM (además de app); no importa app.

export class HintPresenter {
  constructor(doc = document) {
    this._root = doc.getElementById('first-hint');
    this._text = this._root ? doc.getElementById('first-hint-text') : null;
    this._closeBtn = this._root ? doc.getElementById('first-hint-close') : null;
  }

  show(id, text) {
    if (!this._root) return;
    this._root.dataset.hint = id;
    if (this._text) this._text.textContent = text;
    this._root.hidden = false;
  }

  hide() {
    if (!this._root) return;
    this._root.hidden = true;
  }

  onClose(callback) {
    if (!this._closeBtn) return;
    this._closeBtn.addEventListener('click', callback);
  }
}
