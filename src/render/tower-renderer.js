import * as THREE from 'three';
import { disposeOwnedMeshes, mk } from './materials.js';
import { rigDefinitions } from '../content/rigs/index.js';
import { getLoadedRockets, getTowerSize } from '../core/tower-geometry.js';
import { getTowerLevel } from '../core/state.js';
import { createFlameCluster } from './flame.js';
import { addLevelLights } from './tower-level-lights.js';
import { HP_BAR_COLORS, RENDERING_CONFIG, hpBarColor } from './config/rendering.js';
import { aimTurret, createUnit, findRigNodes, getMuzzleWorldPosition, loadUnitModel, syncRockets } from './units.js';

const TWR = RENDERING_CONFIG.tower;

/**
 * La explosión de una torre (spec 002): fogonazo y la parte de arriba, que sale volando y cae
 * junto a los restos. Es solo dibujo: una copia de la torreta, sin tocar el modelo.
 */
class TowerBlast {
  constructor(scene, rig, position, size, worldScale) {
    const cfg = TWR.blast;
    this.scene = scene;
    this.age = 0;
    this.worldScale = worldScale;
    this.groundY = position.y;
    this.fireball = new THREE.Mesh(
      new THREE.SphereGeometry(cfg.fireballRadius * size * worldScale, 12, 10),
      new THREE.MeshBasicMaterial({ color: cfg.fireballColor, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.fireball.position.copy(position).add(new THREE.Vector3(0, cfg.fireballHeight * size * worldScale, 0));
    scene.add(this.fireball);
    this.turret = null;
    if (rig.turretYaw) {
      const node = rig.turretYaw.clone();
      rig.turretYaw.getWorldPosition(node.position);
      rig.turretYaw.getWorldQuaternion(node.quaternion);
      rig.turretYaw.getWorldScale(node.scale);
      scene.add(node);
      const angle = Math.random() * Math.PI * 2;
      this.turret = {
        node,
        velocity: new THREE.Vector3(Math.cos(angle) * cfg.drift, cfg.launchSpeed, Math.sin(angle) * cfg.drift).multiplyScalar(worldScale),
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(cfg.spin),
      };
    }
  }

  /** Avanza la animación; devuelve false cuando terminó. */
  update(dt) {
    const cfg = TWR.blast;
    this.age += dt;
    const k = Math.min(1, this.age / cfg.fireballSeconds);
    this.fireball.scale.setScalar(0.35 + k * 1.2);
    this.fireball.material.opacity = 0.9 * (1 - k) ** 1.5;
    if (this.turret) {
      const { node, velocity, spin } = this.turret;
      velocity.y -= cfg.gravity * this.worldScale * dt;
      node.position.addScaledVector(velocity, dt);
      node.rotation.x += spin.x * dt;
      node.rotation.y += spin.y * dt;
      node.rotation.z += spin.z * dt;
      if (node.position.y <= this.groundY) this.removeTurret();
    }
    return k < 1 || Boolean(this.turret);
  }

  removeTurret() {
    if (!this.turret) return;
    this.scene.remove(this.turret.node);
    this.turret = null;
  }

  dispose() {
    this.removeTurret();
    this.scene.remove(this.fireball);
    this.fireball.geometry.dispose();
    this.fireball.material.dispose();
  }
}

function buildDamageFxGroup(definition, level) {
  const stats = definition.levels[level];
  const s = 0.66 * stats.scale;
  const dmg = TWR.damageState;
  const group = new THREE.Group();
  const flames = [];
  const smokes = [];

  for (const flame of createFlameCluster(dmg.flameCount, 1, dmg.flameLift)) {
    flame.userData.sizeFactor = s * flame.userData.factor;
    flame.userData.towerSize = s;
    flame.position.y = dmg.fireBaseHeight * s;
    group.add(flame);
    flames.push(flame);
  }

  // Columna de humo (Ricardo, 14-11-2026): bocanadas que suben, crecen, se inclinan con el viento y se
  // aclaran hasta desaparecer, escalonadas en el tiempo para que la columna nunca se corte.
  const plume = dmg.plume;
  for (let i = 0; i < plume.puffs; i += 1) {
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSmokePuffTexture(), color: plume.colorDark, transparent: true, opacity: 0, depthWrite: false }));
    smoke.userData.phase = i / plume.puffs;
    smoke.userData.jitter = Math.sin(i * 12.9898) * 0.5;
    smoke.userData.towerSize = s;
    smoke.renderOrder = 900;
    group.add(smoke);
    smokes.push(smoke);
  }

  group.visible = false;
  group.userData.flames = flames;
  group.userData.smokes = smokes;
  return group;
}

function buildTowerHpBar(definition, level, worldScale) {
  const stats = definition.levels[level];
  const cfg = TWR.hpBar;
  const hpScale = worldScale * stats.scale;
  const group = new THREE.Group();
  // Justo sobre lo más alto de su modelo, que cambia con cada nivel.
  const height = rigDefinitions[definition.model.rigs[level]].height * getTowerSize(definition, level);
  group.position.y = (height + cfg.yMargin) * worldScale;
  group.renderOrder = cfg.renderOrder;

  const background = mk(
    new THREE.PlaneGeometry(cfg.widthBase * hpScale, cfg.heightBase * hpScale),
    new THREE.MeshBasicMaterial({
      color: cfg.backgroundColor,
      transparent: true,
      opacity: cfg.backgroundOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    }),
  );
  background.renderOrder = cfg.renderOrder;
  group.add(background);

  const fill = mk(
    new THREE.PlaneGeometry(cfg.fillWidthBase * hpScale, cfg.fillHeightBase * hpScale),
    new THREE.MeshBasicMaterial({
      color: HP_BAR_COLORS.healthy,
      // Transparente, aunque sea sólido, para que se dibuje después del fondo y no quede debajo.
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    }),
  );
  fill.position.z = 0.001;
  fill.renderOrder = cfg.renderOrder + 1;
  group.add(fill);

  return {
    group,
    fill,
    halfWidth: (cfg.fillWidthBase * hpScale) * 0.5,
  };
}

// El aviso de «se puede evolucionar»: un punto verde con un halo suave, dibujado una vez en un lienzo
// y compartido por todas las torres (cada una lleva su propio material para titilar a su ritmo sin
// afectar a las demás). Va en una esquina de la torre y no parece un botón.
let upgradeBadgeTexture = null;
function getUpgradeBadgeTexture() {
  if (upgradeBadgeTexture) return upgradeBadgeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const halo = context.createRadialGradient(64, 64, 10, 64, 64, 62);
  halo.addColorStop(0, TWR.upgradeBadge.color);
  halo.addColorStop(0.45, `${TWR.upgradeBadge.color}88`);
  halo.addColorStop(1, `${TWR.upgradeBadge.color}00`);
  context.fillStyle = halo;
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = '#d9ffe6';
  context.beginPath();
  context.arc(64, 64, 16, 0, Math.PI * 2);
  context.fill();
  upgradeBadgeTexture = new THREE.CanvasTexture(canvas);
  upgradeBadgeTexture.colorSpace = THREE.SRGBColorSpace;
  return upgradeBadgeTexture;
}

// Una bocanada de humo: un disco con borde difuso, dibujado una vez y compartido por todas las torres.
let smokePuffTexture = null;
function getSmokePuffTexture() {
  if (smokePuffTexture) return smokePuffTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const soft = context.createRadialGradient(32, 32, 4, 32, 32, 31);
  soft.addColorStop(0, 'rgba(255,255,255,0.95)');
  soft.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  soft.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = soft;
  context.fillRect(0, 0, 64, 64);
  smokePuffTexture = new THREE.CanvasTexture(canvas);
  smokePuffTexture.colorSpace = THREE.SRGBColorSpace;
  return smokePuffTexture;
}

const plumeDark = new THREE.Color()
const plumeLight = new THREE.Color()

function buildUpgradeBadge(definition, level, worldScale) {
  const cfg = TWR.upgradeBadge;
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: getUpgradeBadgeTexture(), transparent: true, depthTest: false, depthWrite: false }));
  const height = rigDefinitions[definition.model.rigs[level]].height * getTowerSize(definition, level);
  badge.position.set(cfg.corner * worldScale, (height + cfg.yMargin) * worldScale, cfg.corner * worldScale);
  badge.scale.setScalar(cfg.size * worldScale);
  badge.renderOrder = cfg.renderOrder;
  badge.visible = false;
  return badge;
}

/** Hay dinero para evolucionar el ataque de la torre, y no está destruida ni en su nivel máximo. */
export function canAffordUpgrade(state, tower, definition) {
  const cost = definition.levels[tower.level]?.upgradeCost;
  return !tower.destroyed && cost != null && state.credits >= cost;
}

// Quita una torre de la escena. Sus efectos de daño y su barra de vida son suyos; el modelo y los
// restos son copias que comparten geometría y materiales con su plantilla.
function removeTowerEntry(scene, entry) {
  scene.remove(entry.root);
  disposeOwnedMeshes(entry.damageFx);
  // Las bocanadas de humo son sprites, que disposeOwnedMeshes no recorre: cada una tiene su material
  // (opacidad y color propios); la textura es compartida y no se libera (auditoría, 14-11-2026).
  for (const smoke of entry.damageFx.userData.smokes ?? []) smoke.material.dispose();
  disposeOwnedMeshes(entry.hpBar.group);
  entry.upgradeBadge.material.dispose();
}

export class TowerRenderer {
  constructor(scene, towerDefinitions, worldScale = 1) {
    this.scene = scene;
    this.towerDefinitions = towerDefinitions;
    this.worldScale = worldScale;
    this.meshes = new Map();
    this.blasts = [];
    this.lastTime = null;
  }

  // La unidad del rig, llevada al tamaño de su nivel dentro de un contenedor con la escala
  // del mundo: así quien la muestra (la vista previa del panel) puede escalarla aparte. Se
  // carga de public/models/<rig>.glb, como los vehículos, y aparece cuando termina la carga
  // (hasta entonces el rig queda vacío).
  buildMesh(towerTypeId, level) {
    const definition = this.towerDefinitions[towerTypeId];
    const mesh = new THREE.Group();
    mesh.scale.setScalar(this.worldScale);
    mesh.userData.turret = null;
    mesh.userData.rig = null;
    const rig = definition.model.rigs[level];
    loadUnitModel(rig)
      .then((model) => {
        const unit = createUnit(model);
        unit.scale.setScalar(getTowerSize(definition, level));
        addLevelLights(unit, level);
        mesh.add(unit);
        mesh.userData.turret = unit.userData.rig.turretYaw;
        mesh.userData.rig = unit.userData.rig;
      })
      .catch((error) => console.warn(`No se pudo cargar el modelo ${rig}:`, error));
    return mesh;
  }

  buildWreck(towerTypeId, level) {
    const definition = this.towerDefinitions[towerTypeId];
    const wreck = new THREE.Group();
    wreck.scale.setScalar(this.worldScale);
    wreck.visible = false;
    loadUnitModel(definition.model.wreck)
      .then((model) => {
        const unit = createUnit(model);
        unit.scale.setScalar(getTowerSize(definition, level));
        wreck.add(unit);
      })
      .catch((error) => console.warn(`No se pudo cargar el modelo ${definition.model.wreck}:`, error));
    return wreck;
  }

  // La fortificación del blindaje: un anillo en el suelo, aparte de la torre, así que sirve a
  // cualquiera. El casco de toda torre mide 1 de largo, así que basta su tamaño para ajustarlo.
  syncArmor(entry, tower) {
    if (entry.armor) entry.root.remove(entry.armor);
    entry.armor = null;
    entry.armorTier = tower.defenseTier;
    const rig = TWR.armorRings[tower.defenseTier - 1];
    if (!rig) return;
    const armor = new THREE.Group();
    armor.scale.setScalar(this.worldScale * getTowerSize(this.towerDefinitions[tower.towerTypeId], tower.level) * rig.fit);
    entry.root.add(armor);
    entry.armor = armor;
    loadUnitModel(rig.model)
      .then((model) => armor.add(createUnit(model)))
      .catch((error) => console.warn(`No se pudo cargar el modelo ${rig.model}:`, error));
  }

  buildDamageFx(towerTypeId, level) {
    const fx = buildDamageFxGroup(this.towerDefinitions[towerTypeId], level);
    fx.scale.setScalar(this.worldScale);
    return fx;
  }

  sync(state, elapsedTime, camera = null) {
    const targetedTowerIds = new Set(state.enemies.map((enemy) => enemy.targetTowerId).filter(Boolean));
    const hpCfg = TWR.hpBar;
    const nextIds = new Set(state.towers.map((tower) => tower.id));
    for (const [towerId, entry] of this.meshes.entries()) {
      if (!nextIds.has(towerId)) {
        removeTowerEntry(this.scene, entry);
        this.meshes.delete(towerId);
      }
    }

    const dt = this.lastTime === null ? 0 : Math.max(0, elapsedTime - this.lastTime);
    this.lastTime = elapsedTime;
    this.blasts = this.blasts.filter((blast) => {
      if (blast.update(dt)) return true;
      blast.dispose();
      return false;
    });

    for (const tower of state.towers) {
      let entry = this.meshes.get(tower.id);
      if (!entry || entry.level !== tower.level) {
        if (entry) removeTowerEntry(this.scene, entry);

        const root = new THREE.Group();
        const mesh = this.buildMesh(tower.towerTypeId, tower.level);
        const wreck = this.buildWreck(tower.towerTypeId, tower.level);
        const damageFx = this.buildDamageFx(tower.towerTypeId, tower.level);
        const hpBar = buildTowerHpBar(this.towerDefinitions[tower.towerTypeId], tower.level, this.worldScale);
        root.add(mesh);
        root.add(wreck);
        root.add(damageFx);
        root.add(hpBar.group);
        const upgradeBadge = buildUpgradeBadge(this.towerDefinitions[tower.towerTypeId], tower.level, this.worldScale);
        root.add(upgradeBadge);
        this.scene.add(root);

        entry = { root, mesh, wreck, damageFx, level: tower.level, hpBar, upgradeBadge, wasDestroyed: tower.destroyed, armorTier: 0, armor: null };
        this.meshes.set(tower.id, entry);
      }
      if (entry.armorTier !== tower.defenseTier) this.syncArmor(entry, tower);

      entry.root.position.set(tower.wx, 0, tower.wz);
      // La torre no gira su cuerpo, así que el ángulo relativo es el ángulo de tiro. Sin
      // blanco, el núcleo deja el cañón en su elevación de reposo.
      aimTurret(entry.mesh.userData.rig, tower.aimAngle, tower.aimPitch);
      const rotor = entry.mesh.userData.rig?.rotor;
      if (rotor) {
        // A la cadencia real: cada disparo es el paso de un cañón al siguiente. Arranca y se detiene de a poco.
        const { rate } = getTowerLevel(this.towerDefinitions[tower.towerTypeId], tower.level);
        const target = tower.hasTarget && !tower.destroyed ? (rate / entry.mesh.userData.rig.muzzles.length) * Math.PI * 2 : 0;
        const speed = entry.rotorSpeed ?? 0;
        const change = (target > speed ? TWR.rotor.spinUp : TWR.rotor.spinDown) * dt;
        entry.rotorSpeed = speed + Math.max(-change, Math.min(change, target - speed));
        rotor.rotation.z += entry.rotorSpeed * dt;
      }
      if (entry.mesh.userData.rig?.rockets?.length) {
        syncRockets(entry.mesh.userData.rig, tower.fireIndex, getLoadedRockets(tower, getTowerLevel(this.towerDefinitions[tower.towerTypeId], tower.level)));
      }

      if (tower.destroyed && !entry.wasDestroyed && entry.mesh.userData.rig) {
        const size = getTowerSize(this.towerDefinitions[tower.towerTypeId], tower.level);
        this.blasts.push(new TowerBlast(this.scene, entry.mesh.userData.rig, entry.root.position, size, this.worldScale));
      }
      entry.wasDestroyed = tower.destroyed;

      const hpRatio = tower.maxHp > 0 ? tower.hp / tower.maxHp : 0;
      const showDamage = !tower.destroyed && (tower.damageFxActive || hpRatio <= TWR.damageState.threshold);
      const showWreck = tower.destroyed;
      const isTargeted = targetedTowerIds.has(tower.id);
      entry.mesh.visible = !showWreck;
      entry.wreck.visible = showWreck;
      entry.damageFx.visible = showDamage || showWreck;
      entry.hpBar.fill.scale.x = Math.max(0.01, hpRatio);
      entry.hpBar.fill.position.x = -(1 - hpRatio) * entry.hpBar.halfWidth;
      entry.hpBar.fill.material.color.setHex(
        hpBarColor(hpRatio),
      );
      if (hpCfg.visibilityMode === 'damaged-or-targeted') {
        entry.hpBar.group.visible = hpRatio < 0.999 || isTargeted || tower.destroyed;
      } else {
        entry.hpBar.group.visible = true;
      }
      // Los restos ya no tienen vida que mostrar.
      if (tower.destroyed) entry.hpBar.group.visible = false;
      if (entry.hpBar.group.visible && camera) {
        entry.hpBar.group.quaternion.copy(camera.quaternion);
      }

      entry.upgradeBadge.visible = canAffordUpgrade(state, tower, this.towerDefinitions[tower.towerTypeId]);
      if (entry.upgradeBadge.visible) {
        const { blinkHz, minOpacity } = TWR.upgradeBadge;
        const wave = 0.5 + 0.5 * Math.cos(elapsedTime * blinkHz * Math.PI * 2);
        entry.upgradeBadge.material.opacity = minOpacity + (1 - minOpacity) * wave;
      }

      if (entry.damageFx.visible) {
        const flames = entry.damageFx.userData.flames ?? [];
        const smokes = entry.damageFx.userData.smokes ?? [];
        for (let index = 0; index < flames.length; index += 1) {
          const flame = flames[index];
          const dmg = TWR.damageState;
          // Con daño arden pocas y juntas, las más grandes; destruida, todas y abiertas.
          flame.visible = showWreck || index < dmg.flameCountDamaged;
          const spread = (showWreck ? dmg.flameSpread : dmg.flameSpreadDamaged) * flame.userData.towerSize;
          flame.position.x = flame.userData.clusterX * spread;
          flame.position.z = flame.userData.clusterZ * spread;
          flame.userData.time = elapsedTime;
          flame.userData.strength = showWreck ? 1 : dmg.flameStrength;
          flame.scale.setScalar(flame.userData.sizeFactor * (showWreck ? dmg.flameSizeDestroyed : dmg.flameSize));
        }
        const plume = TWR.damageState.plume;
        plumeDark.setHex(plume.colorDark);
        plumeLight.setHex(plume.colorLight);
        // Destruida: columna alta y densa. Dañada: un hilo más bajo, con la mitad de las bocanadas.
        const height = showWreck ? plume.height : plume.height * 0.5;
        for (let index = 0; index < smokes.length; index += 1) {
          const smoke = smokes[index];
          const size = smoke.userData.towerSize;
          smoke.visible = showWreck || index % 2 === 0;
          // Tiempo, no cuadros: la columna sube igual a 30 o a 120 FPS.
          const t = (elapsedTime / plume.seconds + smoke.userData.phase) % 1;
          const lean = t * t * plume.lean;
          smoke.position.set(
            (lean + smoke.userData.jitter * plume.wobble * t) * size,
            (TWR.damageState.smokeBaseHeight + t * height) * size,
            lean * 0.4 * size,
          );
          smoke.scale.setScalar((plume.startSize + t * (plume.endSize - plume.startSize)) * size);
          // Aparece rápido y se desvanece lento, y se aclara al subir.
          const fade = Math.min(1, t / 0.12) * (1 - t) ** 1.4;
          smoke.material.opacity = (showWreck ? plume.opacity : plume.opacity * 0.6) * fade;
          smoke.material.color.copy(plumeDark).lerp(plumeLight, t);
        }
      }
    }
  }

  getTowerRoot(towerId) {
    return this.meshes.get(towerId)?.root ?? null;
  }

  getTowerCenter(towerId) {
    const root = this.getTowerRoot(towerId);
    if (!root) return null;
    const center = new THREE.Vector3();
    root.getWorldPosition(center);
    return center;
  }

  getTurret(towerId) {
    return this.meshes.get(towerId)?.mesh.userData.turret ?? null;
  }

  getMuzzleWorldPosition(towerId, fireIndex = 0, forwardOffset = 0) {
    return getMuzzleWorldPosition(this.meshes.get(towerId)?.mesh.userData.rig, fireIndex, forwardOffset);
  }
}
