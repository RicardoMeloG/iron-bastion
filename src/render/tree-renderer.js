import * as THREE from 'three';
import { createCoverHpBar, showCoverHp } from './cover-hp-bar.js';
import { MAT, mk } from './materials.js';
import { RENDERING_CONFIG } from './config/rendering.js';

const TREE = RENDERING_CONFIG.map.tree;

// Los árboles del mapa. Como las rocas, se construyen una sola vez y reintentar la oleada los
// devuelve tal como estaban. La copa pierde piezas con el daño y, al desaparecer del estado, el
// árbol cae, queda un momento en el suelo y se achica hasta no verse.
export class TreeRenderer {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.entries = new Map();
  }

  buildRoundCrown(s) {
    const { radius, spread, baseY, stepY } = TREE.round;
    // Dos bultos a los lados, vistos de frente desde la cámara inicial, y uno encima: el primero
    // que se pierde con el daño.
    const side = (Math.random() - 0.5) * 0.8;
    return Array.from({ length: TREE.pieces }, (_, index) => {
      const isTop = index === TREE.pieces - 1;
      const piece = mk(new THREE.IcosahedronGeometry(radius * s * (isTop ? 0.85 : 1), 1), index % 2 ? MAT.treeLeavesLight : MAT.treeLeaves);
      const angle = side + index * Math.PI;
      const reach = isTop ? 0 : spread * s;
      piece.position.set(Math.cos(angle) * reach, (baseY + (isTop ? stepY : 0)) * s, Math.sin(angle) * reach);
      piece.rotation.set(Math.random() * 2, Math.random() * 3, 0);
      return piece;
    });
  }

  buildPineCrown(s) {
    const { radius, height, baseY, stepY, shrink } = TREE.pine;
    return Array.from({ length: TREE.pieces }, (_, index) => {
      const factor = shrink ** index;
      const piece = mk(new THREE.ConeGeometry(radius * factor * s, height * factor * s, 7), MAT.treePine);
      piece.position.y = (baseY + index * stepY + (height * factor) / 2) * s;
      piece.rotation.y = Math.random() * Math.PI;
      return piece;
    });
  }

  build(tree) {
    const s = this.config.worldScale * (TREE.sizeMin + Math.random() * TREE.sizeRange);
    const root = new THREE.Group();
    root.position.set(tree.wx, this.config.groundTileHeightWorld, tree.wz);

    // Gira desde la base: así se inclina al temblar y al caer.
    const pivot = new THREE.Group();
    root.add(pivot);
    const trunk = mk(new THREE.CylinderGeometry(TREE.trunk.radius * 0.7 * s, TREE.trunk.radius * s, TREE.trunk.height * s, 6), MAT.treeTrunk);
    trunk.position.y = (TREE.trunk.height / 2) * s;
    pivot.add(trunk);
    const crown = Math.random() < 0.5 ? this.buildPineCrown(s) : this.buildRoundCrown(s);
    pivot.add(...crown);
    pivot.traverse((node) => {
      if (node.isMesh) node.castShadow = true;
    });

    const hpBar = createCoverHpBar(this.scene, TREE.hpBar, tree, this.config.groundTileHeightWorld, this.config.worldScale);
    this.scene.add(root);

    const angle = Math.random() * Math.PI * 2;
    return {
      root,
      pivot,
      crown,
      hpBar,
      axis: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
      lastHp: tree.hp,
      shakeUntil: -1,
      fellAt: null,
    };
  }

  showStanding(entry, tree, elapsedTime, camera) {
    entry.fellAt = null;
    entry.root.visible = true;
    entry.root.scale.setScalar(1);

    if (tree.hp < entry.lastHp) entry.shakeUntil = elapsedTime + TREE.shake.seconds;
    entry.lastHp = tree.hp;
    const shake = entry.shakeUntil - elapsedTime;
    const angle = shake > 0 ? Math.sin(elapsedTime * TREE.shake.frequency) * TREE.shake.angle * (shake / TREE.shake.seconds) : 0;
    entry.pivot.quaternion.setFromAxisAngle(entry.axis, angle);

    const ratio = tree.hp / tree.maxHp;
    const pieces = Math.ceil(ratio * entry.crown.length);
    entry.crown.forEach((piece, index) => {
      piece.visible = index < pieces;
    });

    showCoverHp(entry.hpBar, ratio, camera);
  }

  showFalling(entry, elapsedTime) {
    entry.hpBar.group.visible = false;
    if (entry.fellAt === null) entry.fellAt = elapsedTime;
    const { seconds, lying, shrinking, angle } = TREE.fall;
    const age = elapsedTime - entry.fellAt;
    const progress = Math.min(1, age / seconds);
    entry.pivot.quaternion.setFromAxisAngle(entry.axis, angle * progress * progress);
    const shrink = (age - seconds - lying) / shrinking;
    entry.root.scale.setScalar(Math.max(0, 1 - Math.max(0, shrink)));
    entry.root.visible = shrink < 1;
  }

  sync(state, elapsedTime, camera) {
    for (const tree of state.trees) {
      if (!this.entries.has(tree.id)) this.entries.set(tree.id, this.build(tree));
    }
    const standing = new Map(state.trees.map((tree) => [tree.id, tree]));
    for (const [id, entry] of this.entries) {
      const tree = standing.get(id);
      if (tree) this.showStanding(entry, tree, elapsedTime, camera);
      else this.showFalling(entry, elapsedTime);
    }
  }
}
