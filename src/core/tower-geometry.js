/**
 * Tamaño en el mundo (antes de worldScale) de una torre en un nivel: el largo de su base,
 * que en el estándar de modelos mide 1. Viene en celdas en el contenido (`model.scale`),
 * como en los vehículos.
 */
export function getTowerSize(definition, level) {
  return definition.model.scale * definition.levels[level].scale;
}
/**
 * Cuántos cohetes hay cargados en el lanzador. Al salir el último, el cargador ya cuenta como lleno y
 * corre la recarga: durante ella vuelven a aparecer de a uno, hasta estar todos al terminar.
 */
export function getLoadedRockets(tower, stats) {
  if (tower.ammo === null || tower.ammo === undefined) return stats.magazine;
  if (tower.ammo === stats.magazine && tower.cooldown > 0) {
    return Math.floor((1 - Math.min(1, tower.cooldown / stats.reload)) * stats.magazine);
  }
  return tower.ammo;
}
