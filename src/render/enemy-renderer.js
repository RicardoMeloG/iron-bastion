import * as THREE from 'three';
import { gridToWorld } from '../core/coordinates.js';
import { HP_BAR_COLORS, RENDERING_CONFIG, hpBarColor } from './config/rendering.js';
import { createFlameCluster } from './flame.js';
import { disposeOwnedMeshes, mk } from './materials.js';
import { aimTurret, createUnit, getMuzzleWorldPosition, loadUnitModel } from './units.js';
import { addDefenseLaunchers, aimDefenseLauncher, updateDefenseLaunchers } from './defense-launcher.js';
import { createVeterancyEmblem } from './veterancy-emblem.js';

// Radio de las ruedas en el estándar: el de la patrulla (tools/asset-pipeline/blender/patrulla.py).
const WHEEL_RADIUS = 0.128;
// Un cohete disparado vuelve a verse cuando pasó esta parte del tiempo hasta que le toca salir de nuevo.
const ROCKET_RELOAD_SHARE = 0.6;
const EMBLEM = RENDERING_CONFIG.enemy.veterancyEmblem;
const ENM = RENDERING_CONFIG.enemy;

function attachHudDecorators(mesh, vehicleScale, vehicleHeight, vehicleWidth) {
  const hp = ENM.hpBar;
  const hpScale = Math.max(hp.minScale ?? 1, vehicleWidth * (hp.scaleByWidthFactor ?? 0.26));
  const hpYOffset = Math.max(hp.minYOffset, vehicleHeight * hp.yOffsetHeightFactor);
  const hpGroup = new THREE.Group();
  hpGroup.position.y = hpYOffset;
  const hpBackgroundMaterial = new THREE.MeshBasicMaterial({
    color: hp.background.color,
    transparent: true,
    opacity: hp.background.opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  });
  hpGroup.add(mk(new THREE.PlaneGeometry(hp.background.width * hpScale, hp.background.height * hpScale), hpBackgroundMaterial));
  const hpFill = mk(
    new THREE.PlaneGeometry(hp.fill.width * hpScale, hp.fill.height * hpScale),
    new THREE.MeshBasicMaterial({
      color: HP_BAR_COLORS.healthy,
      // Transparente, aunque sea sólido, para que se dibuje después del fondo y no quede debajo.
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    }),
  );
  hpFill.position.z = 0.001;
  hpFill.renderOrder = hp.renderOrder + 1;
  hpGroup.add(hpFill);
  hpGroup.renderOrder = hp.renderOrder;
  hpGroup.children[0].renderOrder = hp.renderOrder;
  mesh.add(hpGroup);
  mesh.userData.hpGroup = hpGroup;
  mesh.userData.hpFill = hpFill;
  mesh.userData.hpFillHalfWidth = hp.fill.halfWidth * hpScale;

  const tm = ENM.targetMarker;
  const markerScale = Math.max(tm.minScale ?? 1, vehicleWidth * (tm.scaleByWidthFactor ?? 0.22));
  const targetMarker = new THREE.Group();
  targetMarker.position.y = Math.max(tm.yOffset, vehicleHeight * (tm.yOffsetHeightFactor ?? 0.6));
  targetMarker.userData.baseY = targetMarker.position.y;
  targetMarker.visible = false;
  const ring = mk(
    new THREE.TorusGeometry(
      tm.ring.radius * markerScale,
      tm.ring.tube * markerScale,
      tm.ring.radialSegments,
      tm.ring.tubularSegments,
    ),
    new THREE.MeshBasicMaterial({ color: tm.ring.color, transparent: true, opacity: tm.ring.opacity }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.renderOrder = hp.renderOrder + 2;
  targetMarker.add(ring);
  const chevron = mk(
    new THREE.ConeGeometry(tm.chevron.radius * markerScale, tm.chevron.height * markerScale, tm.chevron.segments),
    new THREE.MeshBasicMaterial({ color: tm.chevron.color, transparent: true, opacity: tm.chevron.opacity }),
  );
  chevron.position.y = tm.chevron.height * markerScale;
  chevron.rotation.z = Math.PI;
  chevron.renderOrder = hp.renderOrder + 3;
  targetMarker.add(chevron);
  mesh.add(targetMarker);
  mesh.userData.targetMarker = targetMarker;
}

// Caja de reemplazo si el modelo no carga, para que la partida siga.
function buildPlaceholderVehicleMesh() {
  const root = new THREE.Group();
  const hull = mk(
    new THREE.BoxGeometry(0.06, 0.04, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x5b6470, roughness: 0.72, metalness: 0.25 }),
  );
  hull.position.y = 0.02;
  root.add(hull);
  root.userData.rig = { turretYaw: null, gunPitch: null, muzzles: [] };
  root.userData.placeholderHull = hull;
  attachHudDecorators(root, 1, 0.04, 0.06);
  return root;
}

// Lo que cada vehículo arma por código: la barra de vida, el marcador y la caja de reemplazo.
// El modelo es una copia que comparte geometría y materiales con su plantilla: no se libera.
function disposeVehicleParts(mesh) {
  for (const part of [mesh.userData.hpGroup, mesh.userData.targetMarker, mesh.userData.placeholderHull]) {
    if (part) disposeOwnedMeshes(part);
  }
}

// Un vehículo del estándar: el modelo normalizado (largo 1, +Z al frente) llevado al largo
// de su tipo. No hay ajustes por modelo.
function buildVehicleMesh(definition, model) {
  const root = new THREE.Group();
  const unit = createUnit(model);
  unit.scale.setScalar(definition.model.scale);
  root.add(unit);
  const size = new THREE.Box3().setFromObject(unit).getSize(new THREE.Vector3());
  root.userData.rig = unit.userData.rig;
  root.userData.legs = buildLegPivots(unit);
  root.userData.unit = unit;
  root.userData.bodyHeight = size.y;
  attachHudDecorators(root, definition.model.scale, size.y, size.x);
  if (root.userData.legs.length) {
    root.userData.hpGroup.scale.setScalar(WALK.hpBarScale);
    // Los soldados no proyectan sombra: son muchos, y así cuestan la mitad de dibujar.
    unit.traverse((node) => {
      if (node.isMesh) node.castShadow = false;
    });
    const coverIcon = new THREE.Sprite(COVER_MATERIALS.shielded);
    coverIcon.scale.setScalar(COVER.size);
    coverIcon.position.y = root.userData.hpGroup.position.y + COVER.gapAboveBar;
    coverIcon.renderOrder = COVER.renderOrder;
    coverIcon.visible = false;
    root.add(coverIcon);
    root.userData.coverIcon = coverIcon;
    // Cada uno lleva su paso.
    root.userData.stridePhase = Math.random() * Math.PI * 2;
    // El torso se echa atrás respecto de donde apunta, no de donde camina (ver sync).
    if (root.userData.rig.turretYaw) root.userData.rig.turretYaw.rotation.order = 'YXZ';
  }
  return root;
}

// A un costado de la barra de vida, arriba de la unidad: se ve de un vistazo quién es peligroso sin
// taparla. Se corre desde su centro, para que siga a la derecha en pantalla aunque el vehículo gire.
function addVeterancyEmblem(root, level) {
  if (!level) return root;
  const emblem = createVeterancyEmblem(level);
  const size = root.userData.legs.length ? EMBLEM.soldierSize : EMBLEM.size;
  const barHalfWidth = root.userData.hpFillHalfWidth * root.userData.hpGroup.scale.x;
  emblem.scale.setScalar(size);
  emblem.center.set(0.5 - (barHalfWidth + size * EMBLEM.gapFromBar) / size, 0.5);
  emblem.position.y = root.userData.hpGroup.position.y;
  emblem.renderOrder = EMBLEM.renderOrder;
  root.add(emblem);
  root.userData.emblem = emblem;
  return root;
}

// Los cohetes de un lanzador desaparecen al salir y vuelven antes de su próximo turno: las bocas se
// turnan, así que cada uno sale cada `cohetes / cadencia` segundos.
function reloadRockets(mesh, enemy, elapsedTime) {
  const rockets = mesh.userData.rig?.rockets;
  if (!rockets?.length) return;
  const hiddenUntil = (mesh.userData.rocketHiddenUntil ??= []);
  const turn = rockets.length / (enemy.weaponProfile?.rate || 1);
  for (const fireIndex of mesh.userData.rocketsFired ?? []) hiddenUntil[fireIndex % rockets.length] = elapsedTime + turn * ROCKET_RELOAD_SHARE;
  mesh.userData.rocketsFired = [];
  rockets.forEach((rocket, index) => { rocket.visible = !(hiddenUntil[index] > elapsedTime); });
}

// El radio de una rueda en el mundo: la mitad de su alto. Sin geometría medible, el de la patrulla.
function measureWheelRadius(wheel) {
  wheel.updateWorldMatrix(true, false);
  const height = new THREE.Box3().setFromObject(wheel).getSize(new THREE.Vector3()).y;
  return height > 0 ? height / 2 : WHEEL_RADIUS * wheel.getWorldScale(new THREE.Vector3()).x;
}

// Las ruedas giran según lo que avanzó el vehículo, cada una según su radio: así no patinan.
function spinWheels(mesh) {
  const wheels = mesh.userData.rig?.wheels;
  if (!wheels?.length) return;
  const last = mesh.userData.lastPosition ?? mesh.position.clone();
  mesh.userData.wheelRadii ??= wheels.map(measureWheelRadius);
  const moved = Math.hypot(mesh.position.x - last.x, mesh.position.z - last.z);
  wheels.forEach((wheel, index) => { wheel.rotation.x += moved / mesh.userData.wheelRadii[index]; });
  mesh.userData.lastPosition = last.copy(mesh.position);
}

// Las piernas de un soldado (nodos pierna_*, ver split.mjs) giran en la cadera: la parte alta
// de cada una. Devuelve sus pivotes, con el sentido de paso de cada pierna.
function buildLegPivots(unit) {
  const legs = [];
  LEG_NODES.forEach((name, index) => {
    const leg = unit.getObjectByName(name);
    if (!leg?.parent) return;
    leg.geometry?.computeBoundingBox();
    const box = leg.geometry?.boundingBox ?? new THREE.Box3().setFromObject(leg);
    const hip = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    const pivot = new THREE.Group();
    pivot.position.copy(hip);
    leg.parent.add(pivot);
    pivot.add(leg);
    leg.position.sub(hip);
    legs.push({ pivot, sign: index === 0 ? 1 : -1 });
  });
  return legs;
}

/** Un soldado caído: se va de espaldas, queda un momento en el suelo y se hunde. */
class FallenSoldier {
  constructor(scene, mesh, height) {
    this.scene = scene;
    this.mesh = mesh;
    this.age = 0;
    this.height = height;
    this.baseY = mesh.position.y;
    if (mesh.userData.hpGroup) mesh.userData.hpGroup.visible = false;
    if (mesh.userData.targetMarker) mesh.userData.targetMarker.visible = false;
    if (mesh.userData.coverIcon) mesh.userData.coverIcon.visible = false;
    this.side = Math.random() < 0.5 ? -1 : 1;
  }

  update(dt) {
    this.age += dt;
    const k = Math.min(1, this.age / FALLEN.fallSeconds);
    this.mesh.rotation.x = -k * k * (Math.PI / 2);
    this.mesh.rotation.z = this.side * k * FALLEN.roll;
    const sink = this.age > FALLEN.lieSeconds ? Math.min(1, (this.age - FALLEN.lieSeconds) / FALLEN.sinkSeconds) * this.height : 0;
    this.mesh.position.y = this.baseY - sink;
    return this.age < FALLEN.lieSeconds + FALLEN.sinkSeconds;
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}

const WRECK = ENM.wreck;
const FALLEN = ENM.fallenSoldier;
const WALK = ENM.walk;
const PRONE = ENM.prone;
const KNEEL = ENM.kneel;
const RECOIL = ENM.recoil;
const COVER = ENM.coverIcon;

// Dibuja el escudo del sistema de cobertura; el roto lleva una grieta en zigzag.
function createShieldMaterial(color, broken) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const shield = new Path2D('M32 4 L56 13 V30 C56 44 46 54 32 60 C18 54 8 44 8 30 V13 Z');
  context.fillStyle = color;
  context.fill(shield);
  context.lineWidth = 4;
  context.strokeStyle = '#0b1622';
  context.stroke(shield);
  if (broken) {
    context.globalCompositeOperation = 'destination-out';
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(36, 0);
    context.lineTo(24, 22);
    context.lineTo(38, 32);
    context.lineTo(26, 46);
    context.lineTo(32, 64);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
}

const COVER_MATERIALS = {
  shielded: createShieldMaterial(COVER.shielded, false),
  exposed: createShieldMaterial(COVER.exposed, true),
  prone: createShieldMaterial(COVER.prone, false),
};
const DODGE = ENM.dodge;
const LEG_NODES = ['pierna_izq', 'pierna_der'];

/**
 * Un vehículo destruido (spec 002): el mismo modelo, que estalla, pierde la torreta, se
 * quema y se hunde en el suelo. Es solo dibujo: para el núcleo el vehículo ya no existe.
 */
class Wreck {
  constructor(scene, mesh, definition, worldScale, particles) {
    this.scene = scene;
    this.mesh = mesh;
    this.worldScale = worldScale;
    this.particles = particles;
    this.age = 0;
    this.smokeTimer = 0;
    this.baseY = mesh.position.y;
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    this.height = size.y;
    const length = definition.model.scale;

    if (mesh.userData.hpGroup) mesh.userData.hpGroup.visible = false;
    if (mesh.userData.targetMarker) mesh.userData.targetMarker.visible = false;
    // Restos propios: en vez de quemar el modelo, se cambia por el de sus restos (ya quemado). El
    // cambio espera a que estén cargados, para que el vehículo no desaparezca un instante.
    if (definition.model.wreck) {
      loadUnitModel(definition.model.wreck)
        .then((model) => {
          for (const child of [...mesh.children]) if (child !== mesh.userData.hpGroup && child !== mesh.userData.targetMarker) mesh.remove(child);
          const unit = createUnit(model);
          unit.scale.setScalar(length);
          mesh.add(unit);
        })
        .catch((error) => console.warn(`No se pudo cargar el modelo ${definition.model.wreck}:`, error));
    }
    mesh.rotation.x = (Math.random() - 0.5) * WRECK.tilt;
    mesh.rotation.z = (Math.random() - 0.5) * WRECK.tilt;

    // Materiales propios para quemarlos sin tocar el modelo compartido (la barra de vida y
    // el marcador de blanco quedan fuera).
    this.materials = [];
    const decorators = [mesh.userData.hpGroup, mesh.userData.targetMarker].filter(Boolean);
    const isDecorator = (node) => {
      for (let parent = node.parent; parent; parent = parent.parent) if (decorators.includes(parent)) return true;
      return false;
    };
    mesh.traverse((node) => {
      if (!node.isMesh || node.material?.color === undefined || isDecorator(node)) return;
      node.material = node.material.clone();
      this.materials.push({ material: node.material, original: node.material.color.clone() });
    });

    // La torreta sale volando con su cañón y cae girando junto al casco.
    const turret = mesh.userData.rig?.turretYaw;
    this.turret = null;
    if (turret) {
      scene.attach(turret);
      const angle = Math.random() * Math.PI * 2;
      const drift = WRECK.turretDrift * worldScale;
      const launch = (definition.armorClass === 'heavy' ? WRECK.turretLaunchSpeedHeavy : WRECK.turretLaunchSpeed) * worldScale;
      this.turret = {
        node: turret,
        velocity: new THREE.Vector3(Math.cos(angle) * drift, launch * (0.85 + Math.random() * 0.3), Math.sin(angle) * drift),
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(WRECK.turretSpin),
        groundY: this.baseY + this.height * 0.35,
        landed: false,
      };
    }

    // Bola de fuego del tamaño del vehículo.
    this.fireball = new THREE.Mesh(
      new THREE.SphereGeometry(WRECK.fireballRadius * length * worldScale, 12, 10),
      new THREE.MeshBasicMaterial({ color: WRECK.fireballColor, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.fireball.position.copy(mesh.position).add(new THREE.Vector3(0, this.height * 0.5, 0));
    scene.add(this.fireball);

    // Llamas que siguen ardiendo sobre el casco.
    this.flames = createFlameCluster(WRECK.flameCount, WRECK.flameSize * length * worldScale, WRECK.flameLift);
    for (const flame of this.flames) {
      flame.userData.offsetX = flame.userData.clusterX * WRECK.flameSpread * length * worldScale;
      flame.userData.offsetZ = flame.userData.clusterZ * WRECK.flameSpread * length * worldScale;
      this.scene.add(flame);
    }
    this.placeFlames();
  }

  placeFlames() {
    for (const flame of this.flames) {
      flame.position.set(this.mesh.position.x + flame.userData.offsetX, this.mesh.position.y + this.height * 0.55, this.mesh.position.z + flame.userData.offsetZ);
    }
  }

  /** Avanza la animación; devuelve false cuando terminó y ya se puede quitar. */
  update(dt) {
    this.age += dt;
    const t = this.age;
    const ws = this.worldScale;

    // Fogonazo que crece y se apaga.
    if (this.fireball) {
      const k = t / WRECK.fireballSeconds;
      if (k >= 1) {
        this.scene.remove(this.fireball);
        this.fireball.geometry.dispose();
        this.fireball.material.dispose();
        this.fireball = null;
      } else {
        this.fireball.scale.setScalar(0.35 + k * 1.1);
        this.fireball.material.opacity = 0.85 * (1 - k) ** 1.5;
        this.fireball.material.color.setHex(WRECK.fireballColor).lerp(new THREE.Color(WRECK.charColor), k * 0.7);
      }
    }

    // Salto del casco por la explosión y luego, al terminar de arder, se hunde.
    const hop = t < WRECK.hopSeconds ? Math.sin((Math.PI * t) / WRECK.hopSeconds) * WRECK.hop * ws : 0;
    const sinkStart = WRECK.burnSeconds;
    const sink = t > sinkStart ? Math.min(1, (t - sinkStart) / WRECK.sinkSeconds) * this.height * 1.05 : 0;
    this.mesh.position.y = this.baseY + hop - sink;

    // Se quema: el color va al negro.
    const char = Math.min(1, t / WRECK.charSeconds);
    const charColor = new THREE.Color(WRECK.charColor);
    for (const { material, original } of this.materials) material.color.copy(original).lerp(charColor, char * 0.85);

    if (this.turret) {
      const turret = this.turret;
      if (!turret.landed) {
        turret.velocity.y -= WRECK.gravity * ws * dt;
        turret.node.position.addScaledVector(turret.velocity, dt);
        turret.node.rotation.x += turret.spin.x * dt;
        turret.node.rotation.y += turret.spin.y * dt;
        turret.node.rotation.z += turret.spin.z * dt;
        if (turret.velocity.y < 0 && turret.node.position.y <= turret.groundY) {
          turret.node.position.y = turret.groundY;
          turret.landed = true;
        }
      }
      if (sink > 0) turret.node.position.y = turret.groundY - sink;
    }

    // Llamas que titilan y se apagan antes de hundirse, y humo mientras arde.
    const burning = t < WRECK.burnSeconds;
    this.placeFlames();
    for (const flame of this.flames) {
      flame.visible = burning;
      const fade = 1 - (t / WRECK.burnSeconds) * 0.5;
      flame.userData.time = t;
      flame.userData.strength = fade;
      flame.scale.setScalar(flame.userData.baseSize * fade);
    }
    if (burning && this.particles) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = WRECK.smokeEvery;
        const position = this.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1 * ws, this.height * 0.8, (Math.random() - 0.5) * 0.1 * ws));
        this.particles.spawnSmokePuff(position, WRECK.smoke, { vx: (Math.random() - 0.5) * 0.05 * ws, vz: (Math.random() - 0.5) * 0.05 * ws });
      }
    }

    return t < WRECK.burnSeconds + WRECK.sinkSeconds;
  }

  dispose() {
    this.scene.remove(this.mesh);
    if (this.turret) this.scene.remove(this.turret.node);
    if (this.fireball) {
      this.scene.remove(this.fireball);
      this.fireball.geometry.dispose();
      this.fireball.material.dispose();
    }
    for (const flame of this.flames) {
      this.scene.remove(flame);
    }
    for (const { material } of this.materials) material.dispose();
    disposeVehicleParts(this.mesh);
  }
}

export class EnemyRenderer {
  // `particles` (opcional) pone el humo de los restos: ProjectileRenderer.spawnSmokePuff.
  constructor(scene, enemyDefinitions, worldScale = 1, particles = null) {
    this.scene = scene;
    this.enemyDefinitions = enemyDefinitions;
    this.worldScale = worldScale;
    this.particles = particles;
    this.meshes = new Map();
    this.pendingMeshes = new Map();
    this.activeEnemyIds = new Set();
    // Vehículos que salieron del estado en este cuadro: destruidos (pasan a restos) o que
    // llegaron a la base (se quitan). Lo decide handleEffects con los eventos del núcleo.
    this.departing = new Map();
    this.wrecks = [];
    this.lastElapsed = null;
  }

  /** Los eventos del cuadro: cada vehículo destruido deja sus restos en llamas. */
  handleEffects(effects) {
    for (const effect of effects) {
      if (effect.type === 'enemy-projectile-fired') {
        const shooter = this.meshes.get(effect.enemyId);
        if (shooter?.userData.legs?.length) shooter.userData.recoil = 1;
        if (shooter?.userData.rig?.rockets?.length) (shooter.userData.rocketsFired ??= []).push(effect.fireIndex);
        continue;
      }
      if (effect.type === 'enemy-dodged') {
        // Una salva puede traer otro misil a mitad de la maniobra: esa la termina.
        const dodger = this.meshes.get(effect.enemyId);
        if (dodger && !dodger.userData.dodge) dodger.userData.dodge = { elapsed: 0, side: effect.side };
        continue;
      }
      if (effect.type !== 'enemy-killed') continue;
      const departed = this.departing.get(effect.enemyId);
      if (!departed) continue;
      this.departing.delete(effect.enemyId);
      const { mesh, definition } = departed;
      // La veteranía muere con él: ni en los restos ni en el soldado caído.
      if (mesh.userData.emblem) mesh.userData.emblem.visible = false;
      // Lo que vuela estalla en el aire: no quedan restos.
      if (definition.flight) {
        this.scene.remove(mesh);
        disposeVehicleParts(mesh);
        continue;
      }
      this.wrecks.push(definition.locomotion === 'foot'
        ? new FallenSoldier(this.scene, mesh, definition.model.scale * this.worldScale)
        : new Wreck(this.scene, mesh, definition, this.worldScale, this.particles));
    }
    for (const { mesh } of this.departing.values()) {
      this.scene.remove(mesh);
      disposeVehicleParts(mesh);
    }
    this.departing.clear();
  }

  requestMesh(enemy) {
    if (this.meshes.has(enemy.id) || this.pendingMeshes.has(enemy.id)) return;

    const definition = this.enemyDefinitions[enemy.enemyTypeId];
    const { rig } = enemy;
    // Sus restos se cargan de una vez, para tenerlos listos cuando lo destruyan.
    if (definition.model.wreck) loadUnitModel(definition.model.wreck).catch(() => {});
    const promise = loadUnitModel(rig)
      .then((model) => {
        const mesh = addVeterancyEmblem(buildVehicleMesh(definition, model), enemy.veterancy);
        if (enemy.activeDefense && mesh.userData.rig.turretYaw) mesh.userData.defenseLaunchers = addDefenseLaunchers(mesh.userData.rig.turretYaw, enemy.activeDefense.charges);
        return mesh;
      })
      .catch((error) => {
        console.warn(`No se pudo cargar el modelo ${rig}:`, error);
        return buildPlaceholderVehicleMesh();
      })
      .then((mesh) => {
        this.pendingMeshes.delete(enemy.id);
        if (!this.activeEnemyIds.has(enemy.id)) return;
        mesh.userData.definition = definition;
        mesh.userData.veterancy = enemy.veterancy;
        mesh.scale.multiplyScalar(this.worldScale);
        this.scene.add(mesh);
        this.meshes.set(enemy.id, mesh);
      });

    this.pendingMeshes.set(enemy.id, promise);
  }

  sync(state, camera, cameraAngle, elapsedTime) {
    const dt = this.lastElapsed === null ? 0 : Math.max(0, elapsedTime - this.lastElapsed);
    this.lastElapsed = elapsedTime;
    this.wrecks = this.wrecks.filter((wreck) => {
      if (wreck.update(dt)) return true;
      wreck.dispose();
      return false;
    });

    const targetedEnemyIds = new Set(state.towers.map((tower) => tower.targetEnemyId).filter(Boolean));
    // El núcleo deja un cuadro en la lista al vehículo recién destruido (alive = false): se
    // suelta en el mismo cuadro en que llega su evento, para que deje restos.
    const liveEnemies = state.enemies.filter((enemy) => enemy.alive);
    const nextIds = new Set(liveEnemies.map((enemy) => enemy.id));
    this.activeEnemyIds = nextIds;
    for (const [enemyId, mesh] of this.meshes.entries()) {
      if (!nextIds.has(enemyId)) {
        this.departing.set(enemyId, { mesh, definition: mesh.userData.definition });
        this.meshes.delete(enemyId);
      }
    }

    const bob = ENM.bobbing;
    const hp = ENM.hpBar;
    const tm = ENM.targetMarker;
    const ta = ENM.turretAnimation;
    const hpMode = ENM.hpBar.visibilityMode ?? 'always';
    const { enemyTerritory } = state.config.mapDefinition;
    const { endColumn, fadeColumns } = RENDERING_CONFIG.map.edgeFog;
    const fogEdgeX = enemyTerritory
      ? gridToWorld(endColumn - 0.5 - fadeColumns / 2, 0, this.worldScale, state.config.halfWidth, state.config.halfHeight).x
      : -Infinity;
    const cameraQuaternion = camera.quaternion;
    const parentWorldQuaternion = new THREE.Quaternion();
    const inverseParentQuaternion = new THREE.Quaternion();
    // La veteranía es de la unidad: los galones van en uno solo, el primero vivo.
    const teamsWithEmblem = new Set();

    for (const enemy of liveEnemies) {
      let mesh = this.meshes.get(enemy.id);
      if (!mesh) {
        this.requestMesh(enemy);
        continue;
      }
      // Ganó veteranía: cambia su modelo y sus galones.
      if (mesh.userData.veterancy !== enemy.veterancy) {
        this.scene.remove(mesh);
        disposeVehicleParts(mesh);
        this.meshes.delete(enemy.id);
        this.requestMesh(enemy);
        continue;
      }

      if (mesh.userData.emblem) {
        mesh.userData.emblem.visible = !teamsWithEmblem.has(enemy.teamId);
        if (enemy.teamId) teamsWithEmblem.add(enemy.teamId);
      }

      mesh.position.set(
        enemy.position.x,
        enemy.position.y + Math.sin(elapsedTime * bob.frequency + enemy.pathIndex * bob.pathIndexMultiplier) * bob.amplitude * this.worldScale,
        enemy.position.z,
      );
      // El rumbo del núcleo es el ángulo de +Z, que en el estándar es el frente del modelo.
      mesh.rotation.y = enemy.rotation;
      spinWheels(mesh);
      reloadRockets(mesh, enemy, elapsedTime);
      if (mesh.userData.defenseLaunchers) updateDefenseLaunchers(mesh.userData.defenseLaunchers, dt, elapsedTime);
      const dodge = mesh.userData.dodge;
      if (dodge) {
        dodge.elapsed += dt;
        const swerve = Math.sin(Math.PI * Math.min(1, dodge.elapsed / DODGE.seconds));
        const offset = dodge.side * swerve * DODGE.offset * this.worldScale;
        mesh.position.x += Math.cos(enemy.rotation) * offset;
        mesh.position.z -= Math.sin(enemy.rotation) * offset;
        mesh.rotation.z = -dodge.side * swerve * DODGE.lean;
        if (dodge.elapsed >= DODGE.seconds) {
          mesh.userData.dodge = null;
          mesh.rotation.z = 0;
        }
      }
      if (mesh.userData.legs?.length) {
        const kneeling = enemy.kneelSeconds > 0;
        const prone = THREE.MathUtils.damp(mesh.userData.prone ?? 0, enemy.proneSeconds > 0 && !kneeling ? 1 : 0, PRONE.rate, dt);
        mesh.userData.prone = prone;
        const kneel = THREE.MathUtils.damp(mesh.userData.kneel ?? 0, kneeling ? 1 : 0, KNEEL.rate, dt);
        mesh.userData.kneel = kneel;
        const crawling = prone > 0.5;
        // Frente a lo que le cierra el paso se queda quieto, con las piernas juntas.
        const stride = Math.sin(elapsedTime * (crawling ? PRONE.crawlFrequency : WALK.frequency) + mesh.userData.stridePhase)
          * (crawling ? PRONE.legShare : 1);
        const { unit, bodyHeight } = mesh.userData;
        unit.rotation.x = prone * PRONE.pitch;
        unit.rotation.z = crawling && !enemy.blockedBy ? stride * PRONE.sway : 0;
        unit.position.y = (prone * PRONE.lift - kneel * KNEEL.drop) * bodyHeight;
        unit.position.z = -prone * PRONE.shift * bodyHeight;
        for (const { pivot, sign } of mesh.userData.legs) {
          pivot.rotation.x = enemy.blockedBy ? THREE.MathUtils.damp(pivot.rotation.x, 0, WALK.stopRate, dt) : stride * sign * WALK.swing;
          if (kneel > 0.01) pivot.rotation.x = THREE.MathUtils.lerp(pivot.rotation.x, sign > 0 ? KNEEL.frontLeg : KNEEL.backLeg, kneel);
        }
        const recoil = Math.max(0, (mesh.userData.recoil ?? 0) - dt * RECOIL.recovery);
        mesh.userData.recoil = recoil;
        if (mesh.userData.rig.turretYaw) mesh.userData.rig.turretYaw.rotation.x = -recoil * RECOIL.lean;
      }
      const hpRatio = enemy.hp / enemy.maxHp;
      // En la niebla el vehículo no se ve: tampoco su barra ni su escudo.
      const inFog = enemy.position.x < fogEdgeX;
      mesh.userData.hpFill.scale.x = Math.max(0.01, hpRatio);
      mesh.userData.hpFill.position.x = -(1 - hpRatio) * (mesh.userData.hpFillHalfWidth ?? hp.fill.halfWidth);
      mesh.userData.hpFill.material.color.setHex(hpBarColor(hpRatio));
      const coverIcon = mesh.userData.coverIcon;
      if (coverIcon) {
        // Por nivel de cobertura: 0 rojo roto (calle), 1 sin ícono (pasto), 2 azul, 3 dorado.
        const material = [COVER_MATERIALS.exposed, null, COVER_MATERIALS.shielded, COVER_MATERIALS.prone][enemy.coverLevel ?? 1];
        coverIcon.visible = !inFog && Boolean(material);
        if (material) coverIcon.material = material;
      }
      const hpGroup = mesh.userData.hpGroup;
      const isTargeted = targetedEnemyIds.has(enemy.id);
      if (inFog) {
        hpGroup.visible = false;
      } else if (hpMode === 'damaged') {
        hpGroup.visible = hpRatio < 0.999;
      } else if (hpMode === 'damaged-or-targeted') {
        hpGroup.visible = hpRatio < 0.999 || isTargeted;
      } else {
        hpGroup.visible = true;
      }
      if (hpGroup.visible) {
        mesh.getWorldQuaternion(parentWorldQuaternion);
        inverseParentQuaternion.copy(parentWorldQuaternion).invert();
        hpGroup.quaternion.copy(inverseParentQuaternion.multiply(cameraQuaternion));
      }

      const targetMarker = mesh.userData.targetMarker;
      if (targetMarker) {
        targetMarker.visible = isTargeted;
        if (isTargeted) {
          targetMarker.rotation.y = cameraAngle;
          const baseY = targetMarker.userData.baseY ?? tm.bob.base;
          targetMarker.position.y = baseY + Math.sin(elapsedTime * tm.bob.frequency + enemy.pathIndex) * tm.bob.amplitude;
          targetMarker.children[0].material.opacity = tm.opacityPulse.base + Math.sin(elapsedTime * tm.opacityPulse.frequency) * tm.opacityPulse.amplitude;
        }
      }

      const rig = mesh.userData.rig;
      if (enemy.targetTowerId) {
        aimTurret(rig, enemy.aimAngle - enemy.rotation, enemy.aimPitch);
      } else {
        aimTurret(
          rig,
          Math.sin(elapsedTime * ta.yawFrequency + enemy.pathIndex) * ta.yawAmplitude,
          ta.elevationBase + Math.sin(elapsedTime * ta.pitchFrequency + enemy.pathIndex) * ta.pitchAmplitude,
        );
      }
      // Tirado no gira la cintura: apunta con todo el cuerpo, y levanta el arma lo que se inclinó.
      const prone = mesh.userData.prone ?? 0;
      if (prone > 0 && rig?.turretYaw && rig.gunPitch) {
        const relative = enemy.targetTowerId ? Math.atan2(Math.sin(enemy.aimAngle - enemy.rotation), Math.cos(enemy.aimAngle - enemy.rotation)) : 0;
        mesh.rotation.y += relative * prone;
        rig.turretYaw.rotation.y *= 1 - prone;
        rig.gunPitch.rotation.x -= prone * PRONE.pitch;
      }
    }
  }

  /** El lanzador de esa carga gira hacia `target` y devuelve desde dónde sale el interceptor, si el modelo ya cargó. */
  aimDefenseLauncher(enemyId, index, target) {
    const launchers = this.meshes.get(enemyId)?.userData.defenseLaunchers;
    if (!launchers?.length) return null;
    const launcher = launchers[index % launchers.length];
    aimDefenseLauncher(launcher, target);
    return launcher.getWorldPosition(new THREE.Vector3());
  }

  getMuzzleWorldPosition(enemyId, fireIndex = 0, forwardOffset = 0) {
    return getMuzzleWorldPosition(this.meshes.get(enemyId)?.userData.rig, fireIndex, forwardOffset);
  }
}
