// Normalizador de modelos (ADR 001, docs/asset-standard.md).
//
//   npm run assets:normalize              todos los manifiestos
//   npm run assets:normalize -- m163      solo uno
//
// Lee tools/asset-pipeline/manifests/<id>.json y su modelo fuente, y escribe
// public/models/<id>.glb (con la estructura del estándar) y src/content/rigs/<id>.json
// (bocas, pivotes y medidas). Al terminar valida el resultado con las 7 reglas.
//
// Pasos: si el original es una sola malla (generada por IA), partirla por volúmenes en
// casco, torreta y cañón (split.mjs); hornear las transformaciones en la malla, orientar (+Y arriba, +Z frente),
// llevar el cañón a reposo (al frente y horizontal), montar la torreta si el manifiesto
// lo pide, escalar el chasis a largo 1, centrar, armar la jerarquía con nombres fijos y,
// si el manifiesto trae "style", aplicar la paleta común (style.mjs).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedup, dequantize, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { Box3, Matrix3, Matrix4, Vector3 } from 'three';
import { RIG_NAMES, computeRigMetadata, createIO, isDescendant, worldMatrix } from './rig.mjs';
import { splitByVolumes } from './split.mjs';
import { applyStyle } from './style.mjs';
import { validateDocument } from './validate-rig.mjs';

const MANIFESTS_DIR = 'tools/asset-pipeline/manifests';
const MODELS_DIR = 'public/models';
// Los modelos que no se pueden publicar ("publish": false) quedan fuera de public/, así no
// llegan al build. Se validan igual y el visor de rigs los muestra en npm run dev.
export const TEST_MODELS_DIR = 'assets/test-models';
const RIGS_DIR = 'src/content/rigs';
const AXES = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0],
  '+y': [0, 1, 0], '-y': [0, -1, 0],
  '+z': [0, 0, 1], '-z': [0, 0, -1],
};

// ---------- geometría horneada ----------

/** Copia las posiciones, normales y tangentes de cada malla, transformadas al espacio estándar. */
function bakeParts(document, basis, groupOf) {
  const parts = [];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (node.getSkin()) throw new Error(`"${node.getName()}" tiene piel (skin); el normalizador no la soporta`);
    const matrix = basis.clone().multiply(worldMatrix(node));
    const primitives = mesh.listPrimitives().map((primitive) => ({
      source: primitive,
      positions: Float32Array.from(primitive.getAttribute('POSITION').getArray()),
      normals: primitive.getAttribute('NORMAL') ? Float32Array.from(primitive.getAttribute('NORMAL').getArray()) : null,
      tangents: primitive.getAttribute('TANGENT') ? Float32Array.from(primitive.getAttribute('TANGENT').getArray()) : null,
      mirrored: false,
    }));
    const part = { node, name: node.getName() || mesh.getName() || 'malla', group: groupOf(node), primitives };
    transformPart(part, matrix);
    parts.push(part);
  }
  return parts;
}

function transformPart(part, matrix) {
  const normalMatrix = new Matrix3().getNormalMatrix(matrix);
  const direction = new Matrix3().setFromMatrix4(matrix);
  const mirrored = matrix.determinant() < 0;
  const v = new Vector3();
  for (const primitive of part.primitives) {
    const p = primitive.positions;
    for (let i = 0; i < p.length; i += 3) {
      v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(matrix);
      p[i] = v.x; p[i + 1] = v.y; p[i + 2] = v.z;
    }
    if (primitive.normals) {
      const n = primitive.normals;
      for (let i = 0; i < n.length; i += 3) {
        v.set(n[i], n[i + 1], n[i + 2]).applyMatrix3(normalMatrix).normalize();
        n[i] = v.x; n[i + 1] = v.y; n[i + 2] = v.z;
      }
    }
    if (primitive.tangents) {
      const t = primitive.tangents;
      for (let i = 0; i < t.length; i += 4) {
        v.set(t[i], t[i + 1], t[i + 2]).applyMatrix3(direction).normalize();
        t[i] = v.x; t[i + 1] = v.y; t[i + 2] = v.z;
      }
    }
    if (mirrored) primitive.mirrored = !primitive.mirrored;
  }
}

function boundsOf(parts, groups) {
  const box = new Box3();
  const v = new Vector3();
  for (const part of parts) {
    if (groups && !groups.includes(part.group)) continue;
    for (const { positions: p } of part.primitives) {
      for (let i = 0; i < p.length; i += 3) box.expandByPoint(v.set(p[i], p[i + 1], p[i + 2]));
    }
  }
  return box;
}

function forEachVertex(parts, groups, callback) {
  const v = new Vector3();
  for (const part of parts) {
    if (groups && !groups.includes(part.group)) continue;
    for (const { positions: p } of part.primitives) {
      for (let i = 0; i < p.length; i += 3) callback(v.set(p[i], p[i + 1], p[i + 2]));
    }
  }
}

/** Eje principal (el más largo) de los vértices del cañón, por iteración de potencias. */
function principalAxis(parts, groups) {
  const mean = new Vector3();
  let count = 0;
  forEachVertex(parts, groups, (v) => { mean.add(v); count++; });
  mean.divideScalar(count);
  const c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  forEachVertex(parts, groups, (v) => {
    const d = [v.x - mean.x, v.y - mean.y, v.z - mean.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i][j] += d[i] * d[j];
  });
  let axis = new Vector3(1, 1, 1).normalize();
  for (let k = 0; k < 64; k++) {
    axis = new Vector3(
      c[0][0] * axis.x + c[0][1] * axis.y + c[0][2] * axis.z,
      c[1][0] * axis.x + c[1][1] * axis.y + c[1][2] * axis.z,
      c[2][0] * axis.x + c[2][1] * axis.y + c[2][2] * axis.z,
    ).normalize();
  }
  return { axis, centroid: mean };
}

const rotationAround = (point, axis, angle) =>
  new Matrix4()
    .makeTranslation(point.x, point.y, point.z)
    .multiply(new Matrix4().makeRotationAxis(axis, angle))
    .multiply(new Matrix4().makeTranslation(-point.x, -point.y, -point.z));

/** Reemplaza el casco por el de otro modelo normalizado y monta la torreta en su pivote. */
async function useHullFrom(document, id, io) {
  const reference = await io.read(path.join(MODELS_DIR, `${id}.glb`));
  const { turretPivot } = JSON.parse(readFileSync(path.join(RIGS_DIR, `${id}.json`), 'utf8'));
  const added = mergeDocuments(document, reference);
  const named = (nodes, name) => nodes.find((node) => node.getName() === name);
  const refNodes = reference.getRoot().listNodes().map((node) => added.get(node));
  const refHull = named(refNodes, RIG_NAMES.hull);
  const roots = document.getRoot().listNodes().filter((node) => node.listParents().every((parent) => parent.propertyType !== 'Node'));
  const unitRoot = roots.find((root) => !refNodes.includes(root) && root.getName() === RIG_NAMES.root);
  const hull = unitRoot.listChildren().find((node) => node.getName() === RIG_NAMES.hull);
  for (const child of hull.listChildren()) child.dispose();
  for (const child of refHull.listChildren()) hull.addChild(child);
  unitRoot.listChildren().find((node) => node.getName() === RIG_NAMES.turret).setTranslation(turretPivot);
  for (const node of refNodes) if (node !== hull && !isDescendant(node, hull)) node.dispose();
  for (const scene of document.getRoot().listScenes()) if (!scene.listChildren().includes(unitRoot)) scene.dispose();
  await document.transform(prune({ keepLeaves: true }), dedup(), unpartition());
}

// ---------- pipeline ----------

export async function normalize(sourceManifest) {
  const log = [];
  const io = createIO();
  const document = await io.read(sourceManifest.source);
  await document.transform(dequantize());
  let manifest = sourceManifest;
  if (manifest.split) {
    // Modelo de una sola malla: el corte deja las piezas con nombre y desde ahí sigue igual.
    const pieces = splitByVolumes(document, manifest.split);
    log.push(...pieces.log);
    manifest = { ...manifest, turret: pieces.turret, gun: pieces.gun, muzzles: pieces.muzzles, turretPivot: 'node' };
  }
  const nodes = document.getRoot().listNodes();
  const byName = (name) => {
    const node = nodes.find((candidate) => candidate.getName() === name);
    if (!node) throw new Error(`${manifest.id}: el nodo "${name}" no existe en ${manifest.source}`);
    return node;
  };
  const turretSource = manifest.turret ? byName(manifest.turret) : null;
  const gunSource = manifest.gun ? byName(manifest.gun) : null;
  const armed = Boolean(turretSource && gunSource);
  const groupOf = (node) => {
    if (gunSource && isDescendant(node, gunSource)) return 'gun';
    if (turretSource && isDescendant(node, turretSource)) return 'turret';
    return 'hull';
  };

  // 1. Orientar: el frente del original pasa a +Z y su arriba a +Y.
  const forward = new Vector3(...AXES[manifest.forward]);
  const up = new Vector3(...AXES[manifest.up]);
  const right = new Vector3().crossVectors(up, forward);
  const basis = new Matrix4().makeBasis(right, up, forward).transpose();
  const parts = bakeParts(document, basis, groupOf);
  const toStandard = (node) => new Vector3().setFromMatrixPosition(basis.clone().multiply(worldMatrix(node)));

  const points = { muzzles: [], turretPivot: null, gunPivot: null };
  if (armed) {
    // Bocas: el centro de su malla, o su origen si es un nodo vacío.
    for (const name of manifest.muzzles ?? []) {
      const node = byName(name);
      const meshParts = parts.filter((part) => isDescendant(part.node, node));
      points.muzzles.push(meshParts.length ? boundsOf(meshParts).getCenter(new Vector3()) : toStandard(node));
    }

    // 2. Pivote de la torreta: centro de su caja sin el cañón, a la altura de su base.
    const turretBox = boundsOf(parts, ['turret']);
    const turretBase = turretBox.isEmpty() ? boundsOf(parts, ['gun']) : turretBox;
    points.turretPivot = manifest.turretPivot === 'node'
      ? toStandard(turretSource)
      : new Vector3((turretBase.min.x + turretBase.max.x) / 2, turretBase.min.y, (turretBase.min.z + turretBase.max.z) / 2);

    // 3. Eje del cañón y su pivote.
    // "gunAxis": "forward" lo da por conocido: en un lanzador con tubos a ambos lados, el eje
    // más largo de sus vértices puede ser el ancho y no el largo.
    const { axis, centroid } = principalAxis(parts, ['gun']);
    if (manifest.gunAxis === 'forward') axis.set(0, 0, 1);
    const towardMuzzle = points.muzzles.length
      ? points.muzzles.reduce((sum, m) => sum.add(m), new Vector3()).divideScalar(points.muzzles.length).sub(centroid)
      : new Vector3().subVectors(centroid, points.turretPivot);
    if (axis.dot(towardMuzzle) < 0) axis.negate();
    const gunBox = boundsOf(parts, ['gun']);
    const nodeOrigin = toStandard(gunSource);
    const margin = gunBox.getSize(new Vector3()).multiplyScalar(0.1);
    if (manifest.gunPivot !== 'axis' && gunBox.clone().expandByVector(margin).containsPoint(nodeOrigin)) {
      points.gunPivot = nodeOrigin;
      log.push('pivote del cañón: origen de su nodo');
    } else {
      let min = Infinity;
      let max = -Infinity;
      forEachVertex(parts, ['gun'], (v) => {
        const t = new Vector3().subVectors(v, centroid).dot(axis);
        min = Math.min(min, t);
        max = Math.max(max, t);
      });
      points.gunPivot = centroid.clone().addScaledVector(axis, min + (max - min) * 0.25);
      log.push('pivote del cañón: calculado sobre su eje, al 25 % desde atrás');
    }

    // 4. Reposo: el cañón al frente (+Z) y horizontal.
    const yaw = Math.atan2(axis.x, axis.z);
    if (Math.abs(yaw) > 1e-4) {
      const turn = rotationAround(points.turretPivot, new Vector3(0, 1, 0), -yaw);
      for (const part of parts) if (part.group !== 'hull') transformPart(part, turn);
      points.gunPivot.applyMatrix4(turn);
      points.muzzles.forEach((m) => m.applyMatrix4(turn));
      axis.applyMatrix4(new Matrix4().makeRotationY(-yaw));
      log.push(`torreta llevada al frente: giro de ${((-yaw * 180) / Math.PI).toFixed(1)}°`);
    }
    const elevation = Math.atan2(axis.y, Math.hypot(axis.x, axis.z));
    if (Math.abs(elevation) > 1e-4) {
      const level = rotationAround(points.gunPivot, new Vector3(1, 0, 0), elevation);
      for (const part of parts) if (part.group === 'gun') transformPart(part, level);
      points.muzzles.forEach((m) => m.applyMatrix4(level));
      log.push(`cañón nivelado: ${((elevation * 180) / Math.PI).toFixed(1)}° de elevación en el original`);
    }

    // 5. Montaje sobre el techo, para torretas armadas aparte del chasis.
    if (manifest.turretMount === 'roof') {
      const radius = Math.max(turretBase.max.x - turretBase.min.x, turretBase.max.z - turretBase.min.z) / 2;
      let roof = -Infinity;
      forEachVertex(parts, ['hull'], (v) => {
        if (Math.hypot(v.x - points.turretPivot.x, v.z - points.turretPivot.z) <= radius) roof = Math.max(roof, v.y);
      });
      // Sin vértices del chasis bajo la torreta (malla muy simple): el techo es lo más alto del chasis.
      if (!Number.isFinite(roof)) roof = boundsOf(parts, ['hull']).max.y;
      const lift = roof - points.turretPivot.y;
      const move = new Matrix4().makeTranslation(0, lift, 0);
      for (const part of parts) if (part.group !== 'hull') transformPart(part, move);
      [points.turretPivot, points.gunPivot, ...points.muzzles].forEach((p) => p.applyMatrix4(move));
      log.push(`torreta montada sobre el techo: ${lift >= 0 ? 'subió' : 'bajó'} ${Math.abs(lift).toFixed(3)}`);
    }
  }

  // 6. Escala y origen: chasis de largo 1, centrado, con la base en y = 0.
  const hullBox = boundsOf(parts, ['hull']);
  const scale = 1 / (hullBox.max.z - hullBox.min.z);
  const allBox = boundsOf(parts);
  const center = hullBox.getCenter(new Vector3());
  const fit = new Matrix4().makeScale(scale, scale, scale).multiply(new Matrix4().makeTranslation(-center.x, -allBox.min.y, -center.z));
  for (const part of parts) transformPart(part, fit);
  for (const p of [points.turretPivot, points.gunPivot, ...points.muzzles]) p?.applyMatrix4(fit);
  log.push(`escala ${scale.toFixed(4)} (el chasis medía ${(1 / scale).toFixed(3)})`);

  // 7. Jerarquía del estándar. La geometría queda horneada relativa a su nodo del rig.
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  const unitRoot = document.createNode(RIG_NAMES.root);
  const hull = document.createNode(RIG_NAMES.hull);
  unitRoot.addChild(hull);
  const groupNodes = { hull };
  const offsets = { hull: new Vector3() };
  if (armed) {
    const turret = document.createNode(RIG_NAMES.turret).setTranslation(points.turretPivot.toArray());
    const gun = document.createNode(RIG_NAMES.gun).setTranslation(new Vector3().subVectors(points.gunPivot, points.turretPivot).toArray());
    turret.addChild(gun);
    unitRoot.addChild(turret);
    points.muzzles.forEach((muzzle, index) => {
      const node = document.createNode(`muzzle_${String(index + 1).padStart(2, '0')}`);
      node.setTranslation(new Vector3().subVectors(muzzle, points.gunPivot).toArray());
      gun.addChild(node);
    });
    Object.assign(groupNodes, { turret, gun });
    Object.assign(offsets, { turret: points.turretPivot, gun: points.gunPivot });
  }

  for (const part of parts) {
    const offset = offsets[part.group];
    const mesh = document.createMesh(part.name);
    for (const baked of part.primitives) {
      const primitive = baked.source.clone();
      const positions = baked.positions;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] -= offset.x; positions[i + 1] -= offset.y; positions[i + 2] -= offset.z;
      }
      primitive.setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer));
      if (baked.normals) primitive.setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(baked.normals).setBuffer(buffer));
      if (baked.tangents) primitive.setAttribute('TANGENT', document.createAccessor().setType('VEC4').setArray(baked.tangents).setBuffer(buffer));
      if (baked.mirrored) {
        const indices = primitive.getIndices();
        const array = indices ? Array.from(indices.getArray()) : Array.from({ length: positions.length / 3 }, (_, i) => i);
        for (let i = 0; i < array.length; i += 3) [array[i + 1], array[i + 2]] = [array[i + 2], array[i + 1]];
        const IndexArray = positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
        primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(IndexArray.from(array)).setBuffer(buffer));
      }
      mesh.addPrimitive(primitive);
    }
    groupNodes[part.group].addChild(document.createNode(part.name).setMesh(mesh));
  }

  // Fuera la jerarquía original (puede repetir nombres del estándar, como «hull» en el M163).
  for (const node of nodes) node.dispose();
  for (const scene of document.getRoot().listScenes()) scene.dispose();
  document.createScene(manifest.id).addChild(unitRoot);
  document.getRoot().setDefaultScene(document.getRoot().listScenes()[0]);
  // keepLeaves: las bocas son nodos vacíos y deben quedarse.
  await document.transform(prune({ keepLeaves: true }));

  // 8. Estilo común (D-6): paleta, sin texturas y con menos triángulos si se pide.
  if (manifest.style) await applyStyle(document, manifest.style, log);

  // 9. Base común: el casco se toma de otro modelo ya normalizado, para que subir de nivel
  // solo cambie la parte de arriba.
  if (manifest.hullFrom) {
    await useHullFrom(document, manifest.hullFrom, io);
    log.push(`casco tomado de ${manifest.hullFrom}`);
  }

  const rig = computeRigMetadata(document, { id: manifest.id, source: manifest.source });
  return { document, rig, log };
}

async function main() {
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const wanted = (id) => only.length === 0 || only.includes(id);
  const manifests = readdirSync(MANIFESTS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(path.join(MANIFESTS_DIR, name), 'utf8')))
    .filter((manifest) => wanted(manifest.id))
    // Un modelo con "hullFrom" necesita normalizado primero el que le da el casco.
    .sort((a, b) => Boolean(a.hullFrom) - Boolean(b.hullFrom));
  if (manifests.length === 0) {
    console.log('No hay manifiestos con ese id.');
    process.exit(1);
  }

  mkdirSync(MODELS_DIR, { recursive: true });
  mkdirSync(TEST_MODELS_DIR, { recursive: true });
  mkdirSync(RIGS_DIR, { recursive: true });
  let failed = 0;
  for (const manifest of manifests) {
    const { document, rig, log } = await normalize(manifest);
    const errors = validateDocument(document, rig);
    const outputDir = manifest.publish === false ? TEST_MODELS_DIR : MODELS_DIR;
    await createIO().write(path.join(outputDir, `${manifest.id}.glb`), document);
    writeFileSync(path.join(RIGS_DIR, `${manifest.id}.json`), `${JSON.stringify(rig, null, 2)}\n`);
    console.log(`${errors.length ? '✗' : '✓'} ${manifest.id}  ←  ${manifest.source}`);
    for (const line of log) console.log(`    ${line}`);
    for (const error of errors) console.log(`    ✗ ${error}`);
    if (errors.length) failed++;
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
