import * as THREE from 'three';
import { mk } from './materials.js';
import { hpBarColor } from './config/rendering.js';

// La barra de vida de una cobertura: fija sobre su celda y visible solo con daño.
export function createCoverHpBar(scene, cfg, cover, groundY, s) {
  const group = new THREE.Group();
  group.position.set(cover.wx, groundY + cfg.y * s, cover.wz);
  group.visible = false;
  const background = mk(
    new THREE.PlaneGeometry(cfg.width * s, cfg.height * s),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: cfg.opacity, depthWrite: false, depthTest: false }),
  );
  background.renderOrder = cfg.renderOrder;
  const fill = mk(
    new THREE.PlaneGeometry(cfg.fillWidth * s, cfg.fillHeight * s),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false }),
  );
  fill.renderOrder = cfg.renderOrder + 1;
  group.add(background, fill);
  scene.add(group);
  return { group, fill, halfWidth: (cfg.fillWidth * s) / 2 };
}

export function showCoverHp({ group, fill, halfWidth }, ratio, camera) {
  group.visible = ratio < 1;
  if (!group.visible) return;
  fill.scale.x = Math.max(0.01, ratio);
  fill.position.x = -(1 - ratio) * halfWidth;
  fill.material.color.setHex(hpBarColor(ratio));
  group.quaternion.copy(camera.quaternion);
}
