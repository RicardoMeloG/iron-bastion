// Utilidades compartidas por el validador y el normalizador (docs/asset-standard.md).
// Leen un documento glTF con gltf-transform y calculan geometría con las clases de
// matemática de three.js, que funcionan en Node.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

export const RIG_NAMES = {
  root: 'unit_root',
  hull: 'hull',
  turret: 'turret_yaw',
  gun: 'gun_pitch',
};
export const MUZZLE_PATTERN = /^muzzle_\d{2}$/;

/** Lector y escritor de glTF con todas las extensiones de Khronos (vidrio, especular…). */
export function createIO() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS);
}

export function findNode(document, name) {
  return document.getRoot().listNodes().find((node) => node.getName() === name) ?? null;
}

export function listMuzzles(document) {
  return document
    .getRoot()
    .listNodes()
    .filter((node) => MUZZLE_PATTERN.test(node.getName()))
    .sort((a, b) => a.getName().localeCompare(b.getName()));
}

function localMatrix(node, extraRotation) {
  const rotation = new Quaternion().fromArray(node.getRotation());
  if (extraRotation) rotation.multiply(extraRotation);
  return new Matrix4().compose(
    new Vector3().fromArray(node.getTranslation()),
    rotation,
    new Vector3().fromArray(node.getScale()),
  );
}

/**
 * Matriz de mundo de un nodo. `extraRotations` (Map nodo → Quaternion) permite simular
 * la torreta girada o el cañón elevado sin modificar el documento.
 */
export function worldMatrix(node, extraRotations = new Map()) {
  const local = localMatrix(node, extraRotations.get(node));
  const parent = node.getParentNode();
  return parent ? worldMatrix(parent, extraRotations).multiply(local) : local;
}

export function worldPosition(node, extraRotations) {
  return new Vector3().setFromMatrixPosition(worldMatrix(node, extraRotations));
}

/** Caja de las mallas bajo `scope` (o de todo el documento), en coordenadas de mundo. */
export function meshBounds(document, scope = null) {
  const box = new Box3();
  const point = new Vector3();
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (scope && !isDescendant(node, scope)) continue;
    const matrix = worldMatrix(node);
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION');
      if (!positions) continue;
      const array = positions.getArray();
      for (let i = 0; i < array.length; i += 3) {
        point.set(array[i], array[i + 1], array[i + 2]).applyMatrix4(matrix);
        box.expandByPoint(point);
      }
    }
  }
  return box;
}

export function isDescendant(node, ancestor) {
  for (let current = node; current; current = current.getParentNode()) {
    if (current === ancestor) return true;
  }
  return false;
}

export function isIdentityRotation(node, tolerance = 1e-4) {
  const [x, y, z, w] = node.getRotation();
  return Math.abs(x) < tolerance && Math.abs(y) < tolerance && Math.abs(z) < tolerance && Math.abs(Math.abs(w) - 1) < tolerance;
}

export function isUnitScale(node, tolerance = 1e-4) {
  return node.getScale().every((value) => Math.abs(value - 1) < tolerance);
}

const round = (value) => Math.round(value * 10000) / 10000;
const toArray = (vector) => [round(vector.x), round(vector.y), round(vector.z)];

/** Metadatos del rig tal como los escribe el normalizador (src/content/rigs/<id>.json). */
export function computeRigMetadata(document, { id, source }) {
  const hull = findNode(document, RIG_NAMES.hull);
  const turret = findNode(document, RIG_NAMES.turret);
  const gun = findNode(document, RIG_NAMES.gun);
  const all = meshBounds(document);
  const hullBox = hull ? meshBounds(document, hull) : all;
  const size = all.getSize(new Vector3());
  const metadata = {
    id,
    source,
    hullLength: round(hullBox.max.z - hullBox.min.z),
    hitRadius: round(Math.max(size.x, size.z) / 2),
    height: round(all.max.y),
  };
  if (turret && gun) {
    metadata.turretPivot = toArray(worldPosition(turret));
    metadata.gunPivot = toArray(worldPosition(gun));
    metadata.muzzles = listMuzzles(document).map((muzzle) => toArray(worldPosition(muzzle)));
  }
  return metadata;
}
