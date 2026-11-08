// T07: la bala nace en la boca del modelo y sale en la dirección del cañón.
//
// El núcleo calcula la boca con el rig (src/core/rig-geometry.js). Estas pruebas arman la
// misma unidad con three.js, como la dibuja render, y comparan: si el núcleo y el dibujo no
// coinciden, la bala sale de un lugar donde no hay cañón.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, Vector3 } from 'three';

import { applyCombatStep, createGameConfig, createInitialState, placeTower, selectTargets } from '../src/core/index.js';
import { getTowerSize } from '../src/core/tower-geometry.js';
import { enemyDefinitions } from '../src/content/enemies/index.js';
import { MUNITION_CLASSES } from '../src/content/enemies/vehicle-combat.js';
import { rigDefinitions } from '../src/content/rigs/index.js';
import { towerDefinitions } from '../src/content/towers/index.js';
import { aimTurret, getMuzzleWorldPosition } from '../src/render/units.js';

const WORLD_SCALE = 10;
// El rig guarda sus medidas con 4 decimales y la MG-7 se dibuja con las exactas: hasta
// 0,001 unidades de diferencia (una celda mide WORLD_SCALE) es la misma boca.
const SAME_POINT = 0.001;

// Un vehículo armado con la jerarquía del estándar, armada desde su rig como la carga render.
function vehicleFromRig(rig) {
  const root = new Object3D();
  const turret = new Object3D();
  turret.position.fromArray(rig.turretPivot);
  const gun = new Object3D();
  gun.position.fromArray(rig.gunPivot).sub(turret.position);
  const muzzles = rig.muzzles.map((point) => {
    const muzzle = new Object3D();
    muzzle.position.fromArray(point).sub(new Vector3().fromArray(rig.gunPivot));
    gun.add(muzzle);
    return muzzle;
  });
  turret.add(gun);
  root.add(turret);
  return { root, rig: { turretYaw: turret, gunPitch: gun, muzzles } };
}

function muzzleDirection(rig, fireIndex) {
  return rig.muzzles[fireIndex % rig.muzzles.length].getWorldDirection(new Vector3());
}

function assertSamePoint(actual, expected, label) {
  const gap = Math.hypot(actual.x - expected.x, actual.y - expected.y, actual.z - expected.z);
  assert.ok(gap < SAME_POINT, `${label}: la bala sale a ${gap.toFixed(4)} de la boca dibujada`);
}

function assertSameDirection(projectile, expected, label) {
  const dot = projectile.vx * expected.x + projectile.vy * expected.y + projectile.vz * expected.z;
  assert.ok(dot > 0.999999, `${label}: la bala sale desviada ${(Math.acos(Math.min(1, dot)) * 180 / Math.PI).toFixed(3)}° del cañón`);
}

test('la bala del vehículo nace en la boca de su modelo y sale en la dirección del cañón', () => {
  const state = createInitialState(createGameConfig({ worldScale: WORLD_SCALE }));
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 6, gy: 4 });
  const definition = enemyDefinitions['apc-8x8'];
  // Rumbo cruzado respecto a la torre: la torreta tiene que girar y el cañón tiene dos bocas.
  const enemy = {
    id: 'enemigo-prueba',
    enemyTypeId: definition.id,
    hp: 500,
    maxHp: 500,
    armor: 0,
    armorClass: 'light',
    speed: 0,
    pathIndex: 0,
    progress: 0,
    alive: true,
    position: { x: tower.wx + 14, y: state.config.pathSurfaceY, z: tower.wz + 9 },
    rotation: 0.7,
    damageType: MUNITION_CLASSES.lightBallistic,
    isArmed: true,
    weaponProfile: { ...definition.combatModel.weaponProfile, range: 4, rate: 6 },
    weaponCooldown: 0,
    fireIndex: 0,
    targetTowerId: null,
    aimAngle: 0.7,
    aimPitch: 0,
    hitRadius: 1.4,
  };
  state.enemies.push(enemy);

  const shots = [];
  for (let step = 0; step < 200 && shots.length < 2; step++) {
    const before = state.projectiles.length;
    applyCombatStep(state, 0.016);
    const effect = state.effects.filter((item) => item.type === 'enemy-projectile-fired').at(-1);
    if (state.projectiles.length > before && effect) {
      shots.push({ effect, projectile: state.projectiles.at(-1), aimAngle: enemy.aimAngle, aimPitch: enemy.aimPitch });
    }
    state.effects = [];
  }
  assert.equal(shots.length, 2, 'el vehículo dispara dos veces');

  const { root, rig } = vehicleFromRig(rigDefinitions[definition.model.rig]);
  root.position.set(enemy.position.x, enemy.position.y, enemy.position.z);
  root.rotation.y = enemy.rotation;
  root.scale.setScalar(definition.model.scale * WORLD_SCALE);
  for (const shot of shots) {
    aimTurret(rig, shot.aimAngle - enemy.rotation, shot.aimPitch);
    root.updateMatrixWorld(true);
    const label = `boca ${shot.effect.fireIndex + 1}`;
    assertSamePoint(shot.effect.position, getMuzzleWorldPosition(rig, shot.effect.fireIndex), label);
    assertSameDirection(shot.projectile, muzzleDirection(rig, shot.effect.fireIndex), label);
  }
  assert.notDeepEqual(shots[0].effect.position, shots[1].effect.position, 'las dos bocas se turnan');
});

test('la bala de la MG-7 nace en la boca de su modelo, en todos sus niveles', () => {
  for (let level = 0; level < towerDefinitions['mg7-vulcan'].levels.length; level++) {
    const state = createInitialState(createGameConfig({ worldScale: WORLD_SCALE }));
    state.credits = 99999;
    const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 6, gy: 4 });
    tower.level = level;
    tower.fireIndex = level; // que no salga siempre por la primera boca
    state.enemies.push({
      id: 'blanco',
      enemyTypeId: 'patrulla',
      hp: 9999,
      maxHp: 9999,
      armor: 0,
      armorClass: 'light',
      speed: 0,
      alive: true,
      position: { x: tower.wx - 12, y: state.config.pathSurfaceY, z: tower.wz + 21 },
      rotation: 0,
      isArmed: false,
      hitRadius: 1.4,
    });
    // La torreta gira hasta quedar alineada y recién ahí dispara (T08).
    let effect = null;
    for (let step = 0; step < 120 && !effect; step++) {
      selectTargets(state);
      applyCombatStep(state, 0.016);
      effect = state.effects.find((item) => item.type === 'projectile-fired');
    }
    assert.ok(effect, `nivel ${level + 1}: la torre dispara`);
    const projectile = state.projectiles[0];

    const definition = towerDefinitions['mg7-vulcan'];
    const { root, rig } = vehicleFromRig(rigDefinitions[definition.model.rigs[level]]);
    root.position.set(tower.wx, 0, tower.wz);
    root.scale.setScalar(getTowerSize(definition, level) * WORLD_SCALE);
    aimTurret(rig, tower.aimAngle, tower.aimPitch);
    root.updateMatrixWorld(true);
    const label = `nivel ${level + 1}, boca ${effect.fireIndex % rig.muzzles.length + 1}`;
    assertSamePoint(effect.position, getMuzzleWorldPosition(rig, effect.fireIndex), label);
    assertSameDirection(projectile, muzzleDirection(rig, effect.fireIndex), label);
  }
});

test('cada tipo de enemigo armado tiene un rig con bocas y cada modelo del juego está en el índice', async () => {
  for (const definition of Object.values(enemyDefinitions)) {
    const rig = rigDefinitions[definition.model.rig];
    assert.ok(rig, `${definition.id}: falta el rig ${definition.model.rig}`);
    if (definition.combatModel.isArmed) assert.ok(rig.muzzles?.length, `${definition.id}: su rig no tiene bocas`);
  }
  const { readdirSync } = await import('node:fs');
  // Los modelos de public/models/; no los de prueba.
  const published = readdirSync('public/models').filter((name) => name.endsWith('.glb')).map((name) => name.replace('.glb', ''));
  assert.deepEqual(Object.keys(rigDefinitions).sort(), published.sort(), 'src/content/rigs/index.js lista los rigs de lo que el juego dibuja');
});
