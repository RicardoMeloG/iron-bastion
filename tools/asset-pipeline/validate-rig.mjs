// Validador del estándar de modelos (docs/asset-standard.md, ADR 001).
//
//   npm run check:rigs                          public/models/, assets/test-models/ y la MG-7
//   node tools/asset-pipeline/validate-rig.mjs archivo.glb [...] [--sin-metadatos]
//
// Comprueba las 7 reglas de la sección «Validación» del estándar. Un modelo que no las
// cumple no entra al juego. Con --sin-metadatos se omite la regla 7 (útil para revisar
// un archivo que todavía no pasó por el normalizador).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Quaternion, Vector3 } from 'three';
import {
  RIG_NAMES,
  computeRigMetadata,
  createIO,
  findNode,
  isIdentityRotation,
  isUnitScale,
  listMuzzles,
  meshBounds,
  worldPosition,
} from './rig.mjs';

const MODELS_DIRS = ['public/models', 'assets/test-models'];
const RIGS_DIR = 'src/content/rigs';

export const TOLERANCE = {
  ground: 0.01,
  center: 0.05,
  hullLength: 0.02,
  yawHeight: 0.005,
  pitchSideways: 0.005,
  metadata: 0.005,
};
const PITCH_TEST = -0.3;

const close = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
const fmt = (value) => value.toFixed(3);

/**
 * Valida un documento glTF ya cargado. `rig` es el contenido de src/content/rigs/<id>.json,
 * o `null` para omitir la regla 7. Devuelve la lista de errores (vacía si cumple).
 */
export function validateDocument(document, rig) {
  const errors = [];
  const fail = (rule, message) => errors.push(`regla ${rule}: ${message}`);

  // 1. Jerarquía.
  const root = findNode(document, RIG_NAMES.root);
  const hull = findNode(document, RIG_NAMES.hull);
  const turret = findNode(document, RIG_NAMES.turret);
  const gun = findNode(document, RIG_NAMES.gun);
  const muzzles = listMuzzles(document);
  const sceneRoots = document.getRoot().listScenes().flatMap((scene) => scene.listChildren());

  if (!root) fail(1, `falta el nodo "${RIG_NAMES.root}"`);
  else if (!sceneRoots.includes(root)) fail(1, `"${RIG_NAMES.root}" no está en la raíz de la escena`);
  if (sceneRoots.length > 1) fail(1, `la escena tiene ${sceneRoots.length} raíces; debe tener solo "${RIG_NAMES.root}"`);
  if (!hull) fail(1, `falta el nodo "${RIG_NAMES.hull}"`);
  else if (root && hull.getParentNode() !== root) fail(1, `"${RIG_NAMES.hull}" debe ser hijo de "${RIG_NAMES.root}"`);

  const armed = Boolean(turret || gun || muzzles.length);
  if (armed) {
    if (!turret) fail(1, `tiene arma pero falta "${RIG_NAMES.turret}"`);
    else if (root && turret.getParentNode() !== root) fail(1, `"${RIG_NAMES.turret}" debe ser hijo de "${RIG_NAMES.root}"`);
    if (!gun) fail(1, `tiene arma pero falta "${RIG_NAMES.gun}"`);
    else if (turret && gun.getParentNode() !== turret) fail(1, `"${RIG_NAMES.gun}" debe ser hijo de "${RIG_NAMES.turret}"`);
    if (muzzles.length === 0) fail(1, 'tiene arma pero ninguna boca (muzzle_01, muzzle_02…)');
    for (const muzzle of muzzles) {
      if (gun && muzzle.getParentNode() !== gun) fail(1, `"${muzzle.getName()}" debe ser hijo de "${RIG_NAMES.gun}"`);
    }
  }

  // 2. Rotación identidad y escala 1 en los nodos del rig.
  for (const node of [root, hull, turret, gun, ...muzzles].filter(Boolean)) {
    if (!isIdentityRotation(node)) fail(2, `"${node.getName()}" tiene rotación; debe ser identidad`);
    if (!isUnitScale(node)) fail(2, `"${node.getName()}" tiene escala ${node.getScale().map(fmt).join(', ')}; debe ser 1`);
  }

  // 3. Origen, suelo y largo del chasis.
  const bounds = meshBounds(document);
  if (bounds.isEmpty()) {
    fail(3, 'el modelo no tiene mallas');
  } else {
    // El centro se mide en el chasis: un cañón largo no debe correr el origen del vehículo.
    const chassis = hull && !meshBounds(document, hull).isEmpty() ? meshBounds(document, hull) : bounds;
    const center = chassis.getCenter(new Vector3());
    if (!close(bounds.min.y, 0, TOLERANCE.ground)) fail(3, `la base está en y = ${fmt(bounds.min.y)}; debe estar en 0`);
    if (!close(center.x, 0, TOLERANCE.center) || !close(center.z, 0, TOLERANCE.center)) {
      fail(3, `el centro del chasis está en x = ${fmt(center.x)}, z = ${fmt(center.z)}; debe estar en 0, 0`);
    }
    if (hull) {
      const hullBounds = meshBounds(document, hull);
      const length = hullBounds.max.z - hullBounds.min.z;
      if (!hullBounds.isEmpty() && !close(length, 1, TOLERANCE.hullLength)) fail(3, `el chasis mide ${fmt(length)} de largo; debe medir 1`);
    }
  }

  // 4 a 6. Comportamiento del arma.
  if (armed && turret && gun && muzzles.length) {
    const gunPivot = worldPosition(gun);
    for (const muzzle of muzzles) {
      if (worldPosition(muzzle).z <= gunPivot.z) fail(4, `"${muzzle.getName()}" no está delante del pivote del cañón`);
    }

    for (let step = 1; step < 8; step++) {
      const yaw = new Map([[turret, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (step / 8) * Math.PI * 2)]]);
      for (const muzzle of muzzles) {
        const rest = worldPosition(muzzle);
        const turned = worldPosition(muzzle, yaw);
        if (!close(rest.y, turned.y, TOLERANCE.yawHeight)) {
          fail(5, `al girar la torreta ${step * 45}°, "${muzzle.getName()}" cambia de altura (${fmt(rest.y)} → ${fmt(turned.y)})`);
          break;
        }
      }
    }

    const pitch = new Map([[gun, new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), PITCH_TEST)]]);
    for (const muzzle of muzzles) {
      const rest = worldPosition(muzzle);
      const raised = worldPosition(muzzle, pitch);
      if (raised.y <= rest.y) fail(6, `al elevar el cañón, "${muzzle.getName()}" no sube`);
      if (!close(rest.x, raised.x, TOLERANCE.pitchSideways)) fail(6, `al elevar el cañón, "${muzzle.getName()}" se desplaza hacia el lado`);
    }
  }

  // 7. Metadatos coinciden con el modelo.
  if (rig !== null) {
    if (!rig) {
      fail(7, 'no existe su archivo en src/content/rigs/');
    } else {
      const actual = computeRigMetadata(document, { id: rig.id, source: rig.source });
      const compare = (label, expected, real) => {
        const a = [expected].flat(2);
        const b = [real].flat(2);
        if (a.length !== b.length || a.some((value, i) => !close(value, b[i], TOLERANCE.metadata))) {
          fail(7, `"${label}" no coincide: dice ${JSON.stringify(expected)}, el modelo tiene ${JSON.stringify(real)}`);
        }
      };
      for (const key of ['hullLength', 'hitRadius', 'height', 'turretPivot', 'gunPivot', 'muzzles']) {
        if (actual[key] === undefined && rig[key] === undefined) continue;
        compare(key, rig[key], actual[key]);
      }
    }
  }

  return errors;
}

export async function validateFile(file, { withMetadata = true } = {}) {
  const document = await createIO().read(file);
  return validateDocument(document, withMetadata ? readRig(path.basename(file, '.glb')) : null);
}

function readRig(id) {
  const rigFile = path.join(RIGS_DIR, `${id}.json`);
  return existsSync(rigFile) ? JSON.parse(readFileSync(rigFile, 'utf8')) : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const withMetadata = !args.includes('--sin-metadatos');
  const files = args.filter((arg) => !arg.startsWith('--'));
  const checks = files.map((file) => ({ label: file, run: () => validateFile(file, { withMetadata }) }));
  if (files.length === 0) {
    // Sin argumentos: todo lo que el juego dibuja (public/models/) y los modelos de prueba
    // que no se publican (assets/test-models/).
    for (const dir of MODELS_DIRS) {
      const models = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.glb')) : [];
      for (const name of models) checks.push({ label: `${dir}/${name}`, run: () => validateFile(`${dir}/${name}`) });
    }
  }

  let failed = 0;
  for (const check of checks) {
    const errors = await check.run();
    if (errors.length === 0) {
      console.log(`✓ ${check.label}`);
    } else {
      failed++;
      console.log(`✗ ${check.label}`);
      for (const error of errors) console.log(`    ${error}`);
    }
  }
  console.log(`\n${checks.length - failed} de ${checks.length} cumplen el estándar.`);
  if (failed) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
