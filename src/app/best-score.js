const BEST_SCORE_KEY = 'iron-bastion:mejor-puntaje';

export { BEST_SCORE_KEY };

/**
 * Lee el mejor puntaje guardado. Devuelve `null` si no hay almacenamiento,
 * si este lanza, o si el valor no es un número finito.
 */
export function loadBestScore(storage) {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(BEST_SCORE_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Guarda el mejor puntaje si `total` lo supera. Nunca lanza.
 * Devuelve `{ best, isNew }`.
 */
export function saveBestScore(storage, total) {
  const current = loadBestScore(storage);
  const isNew = current === null || total > current;
  if (isNew) {
    try {
      storage.setItem(BEST_SCORE_KEY, String(total));
    } catch {
      // almacenamiento bloqueado: se ignora
    }
  }
  return { best: isNew ? total : current, isNew };
}
