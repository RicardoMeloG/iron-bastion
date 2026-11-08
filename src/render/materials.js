import * as THREE from 'three';

export const MAT = {
  grass: new THREE.MeshStandardMaterial({ color: 0x4a7a3a, roughness: 0.9 }),
  road: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8 }),
  roadEdge: new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 }),
  roadLine: new THREE.MeshStandardMaterial({ color: 0xcccc55, roughness: 0.6 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x777766, roughness: 0.95 }),
  treeTrunk: new THREE.MeshStandardMaterial({ color: 0x5b4028, roughness: 0.95, flatShading: true }),
  treeLeaves: new THREE.MeshStandardMaterial({ color: 0x2f7a36, roughness: 0.9, flatShading: true }),
  treeLeavesLight: new THREE.MeshStandardMaterial({ color: 0x3f8f3f, roughness: 0.9, flatShading: true }),
  treePine: new THREE.MeshStandardMaterial({ color: 0x1f5a3a, roughness: 0.9, flatShading: true }),
  bush: new THREE.MeshStandardMaterial({ color: 0x4f7d2c, roughness: 0.95, flatShading: true }),
  bushLight: new THREE.MeshStandardMaterial({ color: 0x618f35, roughness: 0.95, flatShading: true }),
  base: new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.55, metalness: 0.5 }),
  baseDark: new THREE.MeshStandardMaterial({ color: 0x42474d, roughness: 0.45, metalness: 0.6 }),
  hull: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.5, metalness: 0.35 }),
  hullDark: new THREE.MeshStandardMaterial({ color: 0x7a8088, roughness: 0.45, metalness: 0.4 }),
  barrel: new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.25, metalness: 0.8 }),
  barrelDark: new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.2, metalness: 0.85 }),
  bolt: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3, metalness: 0.7 }),
  turretMetal: new THREE.MeshStandardMaterial({ color: 0x8b8f95, roughness: 0.38, metalness: 0.78 }),
  turretMetalDark: new THREE.MeshStandardMaterial({ color: 0x5f666f, roughness: 0.34, metalness: 0.82 }),
  turretMetalEdge: new THREE.MeshStandardMaterial({ color: 0xb0b6bd, roughness: 0.28, metalness: 0.9 }),
  gunMetal: new THREE.MeshStandardMaterial({ color: 0x25282d, roughness: 0.18, metalness: 0.92 }),
  gunMetalMid: new THREE.MeshStandardMaterial({ color: 0x414852, roughness: 0.24, metalness: 0.88 }),
  enemyBody: new THREE.MeshStandardMaterial({ color: 0x8b5a30, roughness: 0.45, metalness: 0.25 }),
  enemyDark: new THREE.MeshStandardMaterial({ color: 0x4a2a15, roughness: 0.4, metalness: 0.3 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x3a4555, roughness: 0.3, metalness: 0.7 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x88bbdd, roughness: 0.1, transparent: true, opacity: 0.6 }),
  hover: new THREE.MeshStandardMaterial({ color: 0x55aa55, roughness: 0.6, transparent: true, opacity: 0.7 }),
  invalid: new THREE.MeshStandardMaterial({ color: 0xaa3333, roughness: 0.6, transparent: true, opacity: 0.5 }),
  selected: new THREE.MeshStandardMaterial({ color: 0x4488aa, roughness: 0.6, transparent: true, opacity: 0.6 }),
};

export function mk(geometry, material) {
  return new THREE.Mesh(geometry, material);
}

/**
 * Libera en la GPU las geometrías y los materiales de un grupo armado por código, de uso exclusivo
 * suyo. Nunca sobre una copia de un modelo cargado: comparte geometría y materiales con la plantilla.
 */
export function disposeOwnedMeshes(root) {
  root.traverse((node) => {
    if (!node.isMesh || node.userData.sharedResources) return;
    node.geometry.dispose();
    node.material.dispose();
  });
}
