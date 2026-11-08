// Paso fijo de la simulación: el bucle le pasa el tiempo de cada cuadro y recibe cuántos pasos
// de `step` segundos toca dar. Así la partida es la misma a 30, 60 o 144 fps.

// Margen para el error de redondeo de sumar cuadros: sin él, un cuadro de 1/60 s justos a veces
// da cero pasos y el siguiente dos.
const EPSILON = 1e-9;

export function createFixedStepper({ step, maxStepsPerFrame }) {
  let accumulator = 0;
  return {
    /**
     * Pasos que corresponden a este cuadro. `speed` multiplica el tiempo y también el tope. Lo que
     * pasa del tope se descarta: tras un cuadro muy largo (la pestaña en segundo plano) la partida
     * sigue donde iba, en vez de encadenar cuadros cada vez más lentos para ponerse al día.
     */
    advance(frameSeconds, speed = 1) {
      accumulator += frameSeconds * speed;
      const steps = Math.floor((accumulator + EPSILON) / step);
      const limit = maxStepsPerFrame * speed;
      if (steps > limit) {
        accumulator = 0;
        return limit;
      }
      accumulator = Math.max(0, accumulator - steps * step);
      return steps;
    },
    /** Olvida el tiempo pendiente (al salir de una pausa, por ejemplo). */
    reset() {
      accumulator = 0;
    },
  };
}
