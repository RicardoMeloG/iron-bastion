// Unidades sobre el estándar de modelos (docs/asset-standard.md, ADR 001).
//
// Todo lo que el juego dibuja con torreta pasa por aquí: los vehículos, que se cargan de
// public/models/<rig>.glb, y la MG-7, que se genera por código con la misma estructura.
// Ninguna unidad trae ajustes propios: el modelo ya viene con +Z al frente, la base en el
// suelo y la torreta y el cañón en sus pivotes, así que una sola función los apunta.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MUZZLE_PATTERN = /^muzzle_\d{2}$/;
const ROCKET_PATTERN = /^rocket_\d{2}$/;
const WHEEL_PATTERN = /^wheel_/;
const loader = new GLTFLoader();
const models = new Map();

/** Carga una vez el modelo normalizado de un rig (public/models/<rig>.glb). */
export function loadUnitModel(rig) {
  if (!models.has(rig)) {
    const url = `${import.meta.env.BASE_URL}models/${rig}.glb`;
    const promise = loader.loadAsync(url).then((gltf) => {
      gltf.scene.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
      });
      return gltf.scene;
    });
    promise.catch(() => models.delete(rig));
    models.set(rig, promise);
  }
  return models.get(rig);
}

/** Los nodos del rig de una unidad: torreta, cañón y bocas (vacío si no tiene arma). */
export function findRigNodes(unitRoot) {
  const muzzles = [];
  const rockets = [];
  const wheels = [];
  unitRoot.traverse((node) => {
    if (MUZZLE_PATTERN.test(node.name)) muzzles.push(node);
    if (ROCKET_PATTERN.test(node.name)) rockets.push(node);
    if (WHEEL_PATTERN.test(node.name)) wheels.push(node);
  });
  muzzles.sort((a, b) => a.name.localeCompare(b.name));
  rockets.sort((a, b) => a.name.localeCompare(b.name));
  const rotor = unitRoot.getObjectByName('rotor') ?? null;
  return {
    turretYaw: unitRoot.getObjectByName('turret_yaw') ?? null,
    gunPitch: unitRoot.getObjectByName('gun_pitch') ?? null,
    muzzles,
    rockets,
    rotor,
    wheels,
  };
}

/**
 * El modelo trae el rotor con su origen en los muñones. Se cuelga de un pivote en el centro de las
 * bocas, que es su eje: así, al girar sobre z, cada cañón pasa por donde estaba el siguiente.
 */
function mountRotor(rig) {
  if (!rig.rotor || !rig.muzzles.length) return;
  const axis = new THREE.Vector3();
  for (const muzzle of rig.muzzles) axis.add(muzzle.position);
  axis.divideScalar(rig.muzzles.length).setZ(0);
  const pivot = new THREE.Group();
  pivot.position.copy(axis);
  rig.gunPitch.add(pivot);
  pivot.add(rig.rotor);
  rig.rotor.position.sub(axis);
  rig.rotor = pivot;
}

/** Una copia de un modelo cargado, con sus nodos del rig en userData.rig. */
export function createUnit(model) {
  const unit = model.clone(true);
  unit.userData.rig = findRigNodes(unit);
  mountRotor(unit.userData.rig);
  return unit;
}

/**
 * Apunta la torreta y el cañón. Es el único código de torreta del juego, igual para
 * todas las unidades: `relativeYaw` es el ángulo hacia el blanco menos el rumbo del
 * cuerpo y `elevation` sube el cañón cuando es positiva.
 */
export function aimTurret(rig, relativeYaw, elevation) {
  if (!rig?.turretYaw) return;
  rig.turretYaw.rotation.y = relativeYaw;
  if (rig.gunPitch) rig.gunPitch.rotation.x = -elevation;
}

/**
 * Muestra los cohetes cargados de un lanzador. Las bocas se turnan, así que los que quedan son los
 * siguientes en salir, contando desde `fireIndex`.
 */
export function syncRockets(rig, fireIndex, loaded) {
  const count = rig?.rockets?.length ?? 0;
  for (let offset = 0; offset < count; offset++) {
    rig.rockets[(Math.abs(fireIndex) + offset) % count].visible = offset < loaded;
  }
}

/** Posición en el mundo de una boca; `forwardOffset` la adelanta en la dirección del cañón. */
export function getMuzzleWorldPosition(rig, fireIndex = 0, forwardOffset = 0) {
  if (!rig?.muzzles.length) return null;
  const muzzle = rig.muzzles[Math.abs(fireIndex) % rig.muzzles.length];
  const position = muzzle.getWorldPosition(new THREE.Vector3());
  if (forwardOffset !== 0) {
    const rotation = muzzle.getWorldQuaternion(new THREE.Quaternion());
    position.add(new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).multiplyScalar(forwardOffset));
  }
  return position;
}
