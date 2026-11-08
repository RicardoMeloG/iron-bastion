// El nivel de una torre, a la vista: un anillo del color de su nivel y ranuras encendidas que se
// pueden contar, para quien no distingue bien los colores. Van en la base, que no gira.
import * as THREE from 'three';
import { RENDERING_CONFIG } from './config/rendering.js';

const { colors, offColor, ring, slots } = RENDERING_CONFIG.tower.levelLights;

const lit = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
const LEVEL_MATERIALS = colors.map((color) => (color === null ? null : lit(color)));
const OFF_MATERIAL = lit(offColor);
const RING_GEOMETRY = new THREE.TorusGeometry(ring.radius, ring.tube, 6, 32);
const SLOT_GEOMETRY = new THREE.BoxGeometry(slots.width, slots.height, slots.depth);

function shared(mesh) {
  mesh.userData.sharedResources = true;
  return mesh;
}

/** Monta las luces del nivel `level` (desde 0) en el modelo: una ranura por mejora. El nivel 0 no lleva anillo. */
export function addLevelLights(unit, level) {
  const material = LEVEL_MATERIALS[level];
  const group = new THREE.Group();
  if (material) {
    const light = shared(new THREE.Mesh(RING_GEOMETRY, material));
    light.rotation.x = Math.PI / 2;
    light.position.y = ring.y;
    group.add(light);
  }
  slots.angles.forEach((angle, index) => {
    const slot = shared(new THREE.Mesh(SLOT_GEOMETRY, index < level ? material : OFF_MATERIAL));
    slot.position.set(Math.sin(angle) * slots.radius, slots.y, Math.cos(angle) * slots.radius);
    slot.rotation.order = 'YXZ';
    slot.rotation.y = angle;
    slot.rotation.x = slots.tilt;
    group.add(slot);
  });
  unit.add(group);
  return group;
}
