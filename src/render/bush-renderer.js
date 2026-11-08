import * as THREE from 'three';
import { MAT, mk } from './materials.js';
import { RENDERING_CONFIG } from './config/rendering.js';

const BUSH = RENDERING_CONFIG.map.bush;

// Los arbustos del mapa. Como las rocas, se construyen una sola vez y reintentar la oleada los
// devuelve. Pierden bultos con el daño y, al desaparecer del estado, solo quedan sus hojas al aire.
export class BushRenderer {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.entries = new Map();
  }

  build(bush) {
    const s = this.config.worldScale;
    const root = new THREE.Group();
    root.position.set(bush.wx, this.config.groundTileHeightWorld, bush.wz);
    const side = Math.random() * Math.PI * 2;
    const pieces = Array.from({ length: BUSH.pieces }, (_, index) => {
      const angle = side + (index * Math.PI * 2) / BUSH.pieces;
      const size = BUSH.radius * s * (0.85 + Math.random() * 0.3);
      const piece = mk(new THREE.IcosahedronGeometry(size, 0), index % 2 ? MAT.bushLight : MAT.bush);
      piece.position.set(Math.cos(angle) * BUSH.spread * s, BUSH.height * s, Math.sin(angle) * BUSH.spread * s);
      piece.rotation.set(Math.random() * 2, Math.random() * 3, 0);
      piece.castShadow = true;
      root.add(piece);
      return piece;
    });
    this.scene.add(root);
    return { root, pieces };
  }

  sync(state) {
    for (const bush of state.bushes) {
      if (!this.entries.has(bush.id)) this.entries.set(bush.id, this.build(bush));
    }
    const standing = new Map(state.bushes.map((bush) => [bush.id, bush]));
    for (const [id, entry] of this.entries) {
      const bush = standing.get(id);
      entry.root.visible = Boolean(bush);
      if (!bush) continue;
      const visible = Math.ceil((bush.hp / bush.maxHp) * entry.pieces.length);
      entry.pieces.forEach((piece, index) => {
        piece.visible = index < visible;
      });
    }
  }
}
