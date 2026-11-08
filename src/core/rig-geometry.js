// De dónde sale la bala y hacia dónde va, para cualquier unidad del estándar de modelos
// (docs/asset-standard.md). Usa el rig de la unidad (src/content/rigs/<id>.json) con la
// misma convención que render (aimTurret en src/render/units.js): +Z es el frente, la
// torreta gira sobre Y y el cañón sube con elevación positiva.
//
// La pose de una unidad en el mundo:
//   { x, y, z }   posición del origen del modelo (centro del chasis, a ras del suelo)
//   scale         tamaño del modelo en el mundo: su largo de 1 pasa a medir `scale`
//   bodyYaw       rumbo del cuerpo (0 mira a +Z)
//   aimAngle      ángulo de tiro en el mundo; la torreta gira aimAngle - bodyYaw
//   elevation     elevación del cañón, positiva hacia arriba

// Giro sobre Y, como rotation.y de three.js: +Z pasa a (sin a, 0, cos a).
function rotateY([x, y, z], angle) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

// Elevación sobre X, como rotation.x = -elevation: +Z sube con elevación positiva.
function elevate([x, y, z], elevation) {
  const sin = Math.sin(elevation);
  const cos = Math.cos(elevation);
  return [x, y * cos + z * sin, -y * sin + z * cos];
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Un punto del modelo, ya en su lugar dentro del modelo, al mundo.
function toWorld(point, pose) {
  const [x, y, z] = rotateY(point.map((value) => value * pose.scale), pose.bodyYaw ?? 0);
  return { x: pose.x + x, y: pose.y + y, z: pose.z + z };
}

// Un punto que gira con la torreta y, si `withGun`, también con el cañón.
function armedPoint(rig, point, pose, withGun) {
  const turretYaw = (pose.aimAngle ?? 0) - (pose.bodyYaw ?? 0);
  const local = withGun ? add(elevate(sub(point, rig.gunPivot), pose.elevation ?? 0), rig.gunPivot) : point;
  return toWorld(add(rotateY(sub(local, rig.turretPivot), turretYaw), rig.turretPivot), pose);
}

export function getTurretPivotWorld(rig, pose) {
  return toWorld(rig.turretPivot, pose);
}

export function getGunPivotWorld(rig, pose) {
  return armedPoint(rig, rig.gunPivot, pose, false);
}

/** Boca por la que sale el disparo número `fireIndex` (las bocas se turnan). */
export function getMuzzleWorld(rig, pose, fireIndex = 0) {
  const muzzle = rig.muzzles[Math.abs(fireIndex) % rig.muzzles.length];
  return armedPoint(rig, muzzle, pose, true);
}

/** Dirección del cañón (unitaria): hacia donde sale la bala. */
export function getBarrelDirection(aimAngle, elevation) {
  const [x, y, z] = rotateY(elevate([0, 0, 1], elevation), aimAngle);
  return { x, y, z };
}

/**
 * Ángulo y elevación que ponen el cañón sobre `target`: el ángulo se mide desde el pivote
 * de la torreta y la elevación desde el pivote del cañón, ya girado hacia el blanco.
 */
export function aimAt(rig, pose, target) {
  const turret = getTurretPivotWorld(rig, pose);
  const aimAngle = Math.atan2(target.x - turret.x, target.z - turret.z);
  const gun = getGunPivotWorld(rig, { ...pose, aimAngle });
  const elevation = Math.atan2(target.y - gun.y, Math.hypot(target.x - gun.x, target.z - gun.z));
  return { aimAngle, elevation };
}

/** Punto al que se apunta para pegarle a una unidad: el centro de su altura. */
export function getAimPoint(rig, pose) {
  return toWorld([0, rig.height / 2, 0], pose);
}
