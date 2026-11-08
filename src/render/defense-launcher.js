// La defensa activa del tanque, a la vista: un lanzador por nivel, sobre la torreta. Cada uno gira
// buscando amenazas y, al disparar, apunta al proyectil que intercepta.
import * as THREE from 'three';
import { VEHICLE_PALETTE } from './config/palette.js';

const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true });
const BODY = material(VEHICLE_PALETTE.metalOscuro);
const PANEL = material(VEHICLE_PALETTE.metal);
const TIP = material(VEHICLE_PALETTE.luzRoja);
const BASE = new THREE.CylinderGeometry(0.03, 0.036, 0.018, 8);
const BOX = new THREE.BoxGeometry(0.075, 0.05, 0.09);
const SENSOR = new THREE.BoxGeometry(0.06, 0.05, 0.012);
const TUBE = new THREE.CylinderGeometry(0.014, 0.014, 0.06, 6);
const NOSE = new THREE.ConeGeometry(0.014, 0.022, 6);

// Si el modelo no trae los puntos `defensa_NN`, estos, en coordenadas de la torreta.
const FALLBACK_MOUNTS = [
  { x: 0.135, y: 0.105, z: 0.02 },
  { x: -0.135, y: 0.105, z: 0.02 },
  { x: 0, y: 0.115, z: -0.13 },
];
// El barrido mientras busca, y cuánto sigue apuntando al proyectil después de disparar (s).
const SWEEP = { amplitude: 0.9, frequency: 0.7 };
const AIM_HOLD_SECONDS = 0.8;
const RETURN_RATE = 3;

function createLauncher() {
  const yaw = new THREE.Group();
  const base = new THREE.Mesh(BASE, BODY);
  base.position.y = -0.016;
  const body = new THREE.Mesh(BOX, BODY);
  const sensor = new THREE.Mesh(SENSOR, PANEL);
  sensor.position.set(0, 0.012, 0.052);
  yaw.add(base, body, sensor);
  for (const side of [-1, 1]) {
    const tube = new THREE.Mesh(TUBE, BODY);
    tube.rotation.x = Math.PI / 2 - 0.5;
    tube.position.set(side * 0.022, 0.04, 0.012);
    const nose = new THREE.Mesh(NOSE, TIP);
    nose.rotation.x = Math.PI / 2 - 0.5;
    nose.position.set(side * 0.022, 0.056, 0.042);
    yaw.add(tube, nose);
  }
  yaw.traverse((node) => { node.castShadow = true; });
  return yaw;
}

function findMounts(turret) {
  const mounts = [];
  turret.traverse((node) => { if (/^defensa_\d+$/.test(node.name)) mounts.push(node); });
  if (mounts.length) return mounts.sort((a, b) => a.name.localeCompare(b.name));
  return FALLBACK_MOUNTS.map(({ x, y, z }) => {
    const mount = new THREE.Group();
    mount.position.set(x, y, z);
    turret.add(mount);
    return mount;
  });
}

/** Monta un lanzador por carga y los devuelve. Comparten geometría y materiales: no se liberan. */
export function addDefenseLaunchers(turret, charges) {
  return findMounts(turret).slice(0, charges).map((mount, index) => {
    const launcher = createLauncher();
    mount.add(launcher);
    // Mira hacia afuera de la torreta: a su lado, o atrás.
    const outward = mount.position.clone();
    launcher.userData.defense = {
      baseYaw: Math.atan2(outward.x, outward.z),
      phase: index * 2.1,
      aimYaw: 0,
      hold: 0,
    };
    launcher.rotation.y = launcher.userData.defense.baseYaw;
    return launcher;
  });
}

/** El barrido de cada lanzador; después de disparar, se queda un momento apuntando y vuelve. */
export function updateDefenseLaunchers(launchers, dt, elapsedTime) {
  for (const launcher of launchers) {
    const defense = launcher.userData.defense;
    if (defense.hold > 0) {
      defense.hold -= dt;
      launcher.rotation.y = defense.aimYaw;
      continue;
    }
    const sweep = defense.baseYaw + Math.sin(elapsedTime * SWEEP.frequency + defense.phase) * SWEEP.amplitude;
    const delta = Math.atan2(Math.sin(sweep - launcher.rotation.y), Math.cos(sweep - launcher.rotation.y));
    launcher.rotation.y += delta * Math.min(1, dt * RETURN_RATE);
  }
}

/** Gira el lanzador de golpe hacia un punto del mundo: el interceptor sale en esa dirección. */
export function aimDefenseLauncher(launcher, worldPoint) {
  const local = launcher.parent.worldToLocal(worldPoint.clone());
  const defense = launcher.userData.defense;
  defense.aimYaw = Math.atan2(local.x - launcher.position.x, local.z - launcher.position.z);
  defense.hold = AIM_HOLD_SECONDS;
  launcher.rotation.y = defense.aimYaw;
  launcher.updateMatrixWorld(true);
}
