import {
  allocateId,
  cloneStateValue,
  createWaveSnapshot,
  getCellWorldPosition,
  getTowerLevel,
  markUiDirty,
  markWorldDirty,
  queueEffect,
} from './state.js';
import { worldToGrid } from './coordinates.js';
import { getTowerSize } from './tower-geometry.js';
import { aimAt, getAimPoint, getBarrelDirection, getMuzzleWorld } from './rig-geometry.js';
import { ARMOR_CLASSES, DAMAGE_MATRIX } from '../content/enemies/vehicle-combat.js';
import { GAMEPLAY_CONFIG } from '../content/gameplay.js';
import { rigDefinitions } from '../content/rigs/index.js';

const SIM = GAMEPLAY_CONFIG.simulation;
const INF = SIM.infantry;
const ROCKS = GAMEPLAY_CONFIG.rocks;
const COVER = { rock: ROCKS, tree: GAMEPLAY_CONFIG.trees, bush: GAMEPLAY_CONFIG.bushes };
const COVER_SEEK = GAMEPLAY_CONFIG.coverSeek;
const INFANTRY_COMBAT = GAMEPLAY_CONFIG.infantryCombat;
const TEAMS = GAMEPLAY_CONFIG.infantryTeams;
const TEAM_SIZE = TEAMS.frontPerTeam + TEAMS.rearPerTeam;
const FIRE = GAMEPLAY_CONFIG.fire;
const FLYING = GAMEPLAY_CONFIG.flying;
// Parte del tamaño del vehículo con la que choca un misil.
const MISSILE_BODY_SHARE = 0.7;
// Distancia a la boca (celdas) a la que un misil pega al salir, sin tiempo de volar.
const MISSILE_POINT_BLANK = 0.4;
// De la que más protege a la que menos: si alcanza varias, se cubre con la primera.
const COVER_LISTS = ['rocks', 'trees', 'bushes'];
const COVER_LIST_OF = { rock: 'rocks', tree: 'trees', bush: 'bushes' };
const FX = GAMEPLAY_CONFIG.effects;
const OVR = GAMEPLAY_CONFIG.overlays;
const COMBAT = GAMEPLAY_CONFIG.combat;
const VETERANCY = GAMEPLAY_CONFIG.veterancy;

function getTowerDefinition(state, tower) {
  return state.config.towerDefinitions[tower.towerTypeId];
}

function getEnemyDefinition(state, enemyTypeId) {
  return state.config.enemyDefinitions[enemyTypeId];
}

function getTowerDefenseLevel(definition, defenseTier) {
  const levels = definition.defenseLevels ?? [];
  if (levels.length === 0) {
    return {
      label: 'Base Armor',
      armorClass: 'light',
      maxHp: 180,
      armor: 3,
      upgradeCost: null,
    };
  }
  const safeIndex = Math.max(0, Math.min(defenseTier, levels.length - 1));
  return levels[safeIndex];
}

const ARMOR_RANK = { infantry: -1, light: 0, medium: 1, heavy: 2 };

function distance2d(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function distance3d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// El enfriamiento baja con el tiempo y al disparar se le suma el intervalo, así que el sobrante
// del paso en que terminó (a lo sumo un paso, negativo) cuenta para el disparo siguiente y la
// cadencia real es la nominal. El arma ociosa no acumula más que eso: no suelta una ráfaga.
function tickCooldown(cooldown, dt) {
  return Math.max(cooldown - dt, -dt);
}

/** Daño de lo que arde: la armadura no se resta, sino que lo reduce en proporción hasta anularlo. */
export function resolveBurnDamage(baseDamage, munitionClass, armorClass, flatArmor) {
  return resolveDamage(baseDamage, munitionClass, armorClass, 0) * Math.max(0, 1 - flatArmor / FIRE.armorFalloff);
}

/** A un enemigo el fuego siempre le hace algo: por blindado que sea, un vehículo se lleva un mínimo. */
export function resolveEnemyBurnDamage(baseDamage, munitionClass, armorClass, flatArmor) {
  return Math.max(baseDamage * FIRE.vehicleMinShare, resolveBurnDamage(baseDamage, munitionClass, armorClass, flatArmor));
}

export function resolveDamage(baseDamage, munitionClass, armorClass, flatArmor) {
  const multiplier = DAMAGE_MATRIX[munitionClass]?.[armorClass] ?? 1;
  return Math.max(0, baseDamage * multiplier - flatArmor);
}

function resetTowerCombatFlags(tower) {
  tower.destroyed = false;
  tower.damageFxActive = false;
  tower.hasTarget = false;
  tower.targetEnemyId = null;
  tower.cooldown = 0;
  tower.ammo = null;
  tower.aimPitch = SIM.towerRestElevation;
}

/** Cuánto más vida traen los enemigos en esa oleada (desde 1), y qué parte de la recompensa dan. */
export function getLateWaveScale(wave) {
  const { fromWave, hpGrowth, rewardScale } = GAMEPLAY_CONFIG.waves.late;
  if (wave < fromWave) return { hp: 1, reward: 1 };
  const n = wave - fromWave + 1;
  return { hp: 1 + hpGrowth * n * n, reward: rewardScale };
}

/** Qué nivel de veteranía sale en una oleada, según un azar de 0 a 1. */
export function rollVeterancy(wave, random, odds = VETERANCY.odds) {
  const { chances } = odds.findLast(({ fromWave }) => wave >= fromWave);
  let reached = 0;
  for (let level = 0; level < chances.length; level++) {
    reached += chances[level];
    if (random < reached) return level;
  }
  return chances.length - 1;
}

/** Solo los vehículos de tierra tienen veteranía. Una oleada de prueba puede fijar el nivel. */
function pickVeterancy(state, definition) {
  if (definition.flight || definition.locomotion === 'foot') return 0;
  const active = state.activeWaveDefinition;
  if (active?.veterancy !== undefined) return active.veterancy;
  if (active?.tags?.debugOverride) return 0;
  return rollVeterancy(state.wave, nextCombatRandom(state));
}

/** Una unidad lleva tantos misileros como su nivel; los demás, ametralladora, y van primero. */
function squadAtLevel(size, veterancy) {
  return Array.from({ length: size }, (_, index) => (index < size - veterancy ? TEAMS.front : TEAMS.rear));
}

/** Lo que un nivel de veteranía le cambia a una unidad: modelo, tripulación, arma y números. */
function getVeteranProfile(state, enemyTypeId, veterancy) {
  const definition = getEnemyDefinition(state, enemyTypeId);
  const veteran = definition.veteranLevels?.[veterancy];
  const weapon = veteran?.weaponProfile ? { firingArc: Math.PI * 2, ...veteran.weaponProfile } : definition.combatModel.weaponProfile ?? null;
  const stats = { ...definition.stats, ...veteran?.stats };
  const late = getLateWaveScale(state.wave);
  const speedModifier = ARMOR_CLASSES[definition.armorClass ?? 'light']?.speedModifier ?? 1;
  return {
    rig: veteran?.rig ?? definition.model.rig,
    crew: veteran?.dismount ?? definition.dismount ?? [],
    activeDefense: veteran?.activeDefense ?? null,
    maxHp: stats.hp * late.hp,
    armor: stats.armor,
    speed: stats.speed * speedModifier * state.config.worldScale,
    reward: Math.round(stats.reward * late.reward),
    isArmed: Boolean(weapon),
    weaponProfile: weapon,
  };
}

/** Sube un nivel, con todo lo que trae, y conserva la parte de vida que le quedaba. A pie, sigue al paso de su unidad. */
function raiseVeterancy(state, enemy) {
  const onFoot = getEnemyDefinition(state, enemy.enemyTypeId).locomotion === 'foot';
  enemy.veterancy += 1;
  const { speed, ...profile } = getVeteranProfile(state, enemy.enemyTypeId, enemy.veterancy);
  const hpShare = enemy.hp / enemy.maxHp;
  Object.assign(enemy, profile);
  if (!onFoot) enemy.speed = speed;
  enemy.hp = hpShare * enemy.maxHp;
  if (enemy.activeDefense) enemy.defenseCharges += 1;
}

/**
 * Quien destruye una torre gana un nivel de veteranía. Entre soldados, lo gana su unidad entera, y
 * uno más toma un lanzamisiles: quien la destruyó, si aún no lo tenía.
 */
function promoteEnemy(state, enemy) {
  if (!enemy.alive || enemy.flying || enemy.veterancy >= VETERANCY.odds[0].chances.length - 1) return;
  const onFoot = getEnemyDefinition(state, enemy.enemyTypeId).locomotion === 'foot';
  const team = enemy.teamId ? state.enemies.filter((other) => other.alive && other.teamId === enemy.teamId) : [enemy];
  const armed = onFoot ? [enemy, ...team].find((soldier) => soldier.enemyTypeId !== TEAMS.rear) : null;
  if (armed) armed.enemyTypeId = TEAMS.rear;
  for (const member of team) raiseVeterancy(state, member);
  queueEffect(state, { type: 'enemy-promoted', enemyId: enemy.id, enemyTypeId: enemy.enemyTypeId, veterancy: enemy.veterancy });
}

function createEnemyInstance(state, enemyTypeId, veterancy = pickVeterancy(state, getEnemyDefinition(state, enemyTypeId))) {
  const definition = getEnemyDefinition(state, enemyTypeId);
  const profile = getVeteranProfile(state, enemyTypeId, veterancy);
  const startPos = state.config.pathWorld[0];
  const armorClass = definition.armorClass ?? 'light';
  const defaultHitRadiusByArmor = {
    light: 0.14,
    medium: 0.18,
    heavy: 0.22,
  };
  const hitRadiusBase = definition.combatModel.hitRadius ?? defaultHitRadiusByArmor[armorClass] ?? 0.16;

  return {
    id: allocateId('enemy'),
    enemyTypeId,
    veterancy,
    ...profile,
    hp: profile.maxHp,
    defenseCharges: profile.activeDefense?.charges ?? 0,
    defenseReload: 0,
    armorClass,
    pathIndex: 0,
    progress: 0,
    alive: true,
    position: { ...startPos },
    rotation: 0,
    damageType: definition.combatModel.damageType,
    weaponCooldown: 0,
    fireIndex: 0,
    targetTowerId: null,
    aimAngle: 0,
    aimPitch: 0,
    hitRadius: hitRadiusBase * state.config.worldScale,
    // A pie: va derecho a la base, sin usar el camino, y se detiene ante la torre que le cierre el paso.
    offRoad: definition.locomotion === 'foot',
    flying: Boolean(definition.flight),
    velocity: { x: 0, y: 0, z: 0 },
    // La torre que le cierra el paso.
    blockedBy: null,
    // Junto a una roca, un árbol o un arbusto tiene cobertura: parte de los disparos le pegan a ella.
    inCover: false,
    onRoad: false,
    proneSeconds: 0,
    kneelSeconds: 0,
    combatSeconds: 0,
    grenadeCooldown: 0,
    coverId: null,
    // La cobertura a la que va, cuánto lleva yendo y las que ya usó.
    coverGoalId: null,
    coverGoalSeconds: 0,
    usedCover: [],
    // Su escuadra y su puesto en ella; un soldado suelto no tiene.
    teamId: null,
    teamSlot: null,
    // Cuánto acepta alargar su camino para cubrirse.
    coverDetour: nextCombatRandom(state) * COVER_SEEK.maxDetour * state.config.worldScale,
  };
}

// Rig y pose de cada unidad para rig-geometry.js. En torres y vehículos, `aimPitch` es la
// elevación del cañón, positiva hacia arriba.
function getTowerRig(definition, tower) {
  return rigDefinitions[definition.model.rigs[tower.level]];
}

function getTowerPose(state, definition, tower) {
  return {
    x: tower.wx,
    y: 0,
    z: tower.wz,
    scale: getTowerSize(definition, tower.level) * state.config.worldScale,
    bodyYaw: 0,
    aimAngle: tower.aimAngle,
    elevation: tower.aimPitch,
  };
}

function getEnemyRig(state, enemy) {
  return rigDefinitions[enemy.rig ?? getEnemyDefinition(state, enemy.enemyTypeId).model.rig];
}

function getEnemyPose(state, enemy) {
  const scale = getEnemyDefinition(state, enemy.enemyTypeId).model.scale * state.config.worldScale;
  const { kneel, prone } = INFANTRY_COMBAT;
  const lying = enemy.proneSeconds > 0 && !(enemy.kneelSeconds > 0);
  const drop = enemy.kneelSeconds > 0 ? kneel.muzzleDrop : lying ? prone.muzzleDrop : 0;
  // Tirado, el cuerpo queda a lo largo hacia el blanco: el arma avanza.
  const forward = lying ? prone.muzzleForward * scale : 0;
  return {
    ...enemy.position,
    x: enemy.position.x + Math.sin(enemy.aimAngle ?? 0) * forward,
    y: enemy.position.y - drop * scale,
    z: enemy.position.z + Math.cos(enemy.aimAngle ?? 0) * forward,
    scale,
    bodyYaw: enemy.rotation,
    aimAngle: enemy.aimAngle,
    elevation: enemy.aimPitch,
  };
}

// Los vehículos apuntan al centro de la altura de la torre, y ahí se mide el impacto.
function getTowerAimPoint(state, tower) {
  const definition = getTowerDefinition(state, tower);
  return getAimPoint(getTowerRig(definition, tower), getTowerPose(state, definition, tower));
}

// La torre apunta al centro de la altura del vehículo, y ahí se mide el impacto.
function getEnemyAimPoint(state, enemy) {
  return getAimPoint(getEnemyRig(state, enemy), getEnemyPose(state, enemy));
}

// Velocidad del vehículo en el mundo: avanza a `speed` por el tramo del camino en que va.
function getVehicleSpeed(enemy) {
  return enemy.overheatSeconds > 0 ? enemy.speed * FIRE.overheatSpeed : enemy.speed;
}

function getEnemyVelocity(state, enemy) {
  if (enemy.offRoad || enemy.flying) return enemy.velocity;
  const { pathWorld } = state.config;
  if (enemy.pathIndex >= pathWorld.length - 1 || !enemy.speed) return { x: 0, y: 0, z: 0 };
  const from = pathWorld[enemy.pathIndex];
  const to = pathWorld[enemy.pathIndex + 1];
  const length = distance3d(from, to) || 1;
  const speed = getVehicleSpeed(enemy);
  return {
    x: ((to.x - from.x) / length) * speed,
    y: ((to.y - from.y) / length) * speed,
    z: ((to.z - from.z) / length) * speed,
  };
}

/**
 * La torreta sigue al blanco anticipando su movimiento: apunta a donde va a estar el vehículo
 * cuando llegue la bala, suponiendo que sigue derecho por su tramo. Gira a yawSpeed, toma la
 * elevación justa y devuelve si quedó alineada para disparar (readyAngle).
 */
function aimTower(state, definition, tower, enemy, dt) {
  const combat = definition.combatModel;
  const rig = getTowerRig(definition, tower);
  const pose = getTowerPose(state, definition, tower);
  const projectileSpeed = combat.projectileSpeed * state.config.worldScale;
  const center = getEnemyAimPoint(state, enemy);
  const velocity = getEnemyVelocity(state, enemy);

  // Unas pocas vueltas bastan: el tiempo de vuelo cambia poco al corregir el punto.
  let target = center;
  let aim = aimAt(rig, pose, target);
  for (let iteration = 0; iteration < 3; iteration++) {
    const muzzle = getMuzzleWorld(rig, { ...pose, aimAngle: aim.aimAngle, elevation: aim.elevation }, tower.fireIndex);
    const flightTime = distance3d(muzzle, target) / projectileSpeed;
    target = {
      x: center.x + velocity.x * flightTime,
      y: center.y + velocity.y * flightTime,
      z: center.z + velocity.z * flightTime,
    };
    aim = aimAt(rig, pose, target);
  }

  const limits = combat.elevationLimits ?? SIM.defaultElevationLimits;
  tower.aimAngle = rotateTurretToward(tower.aimAngle, aim.aimAngle, combat.yawSpeed ?? Math.PI * 2, dt);
  // La artillería tira en arco: la elevación es siempre la misma, y el cohete baja a donde va.
  tower.aimPitch = combat.artillery ? combat.artillery.elevation : Math.max(limits.min, Math.min(limits.max, aim.elevation));
  tower.leadPoint = { x: target.x, y: target.y, z: target.z };
  return Math.abs(wrapAngle(aim.aimAngle - tower.aimAngle)) <= (combat.readyAngle ?? 0.05);
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// Quita una vida, o una por cada soldado que traía adentro: dejar pasar un camión no puede salir
// más barato que destruirlo.
/**
 * Lo que cuesta que llegue: una escuadra, una sola vez, llegue quien llegue. Un vehículo, una por
 * cada escuadra que lleva: lo mismo que costaría su tripulación a pie.
 */
function livesCostOf(state, enemy) {
  const { flight } = getEnemyDefinition(state, enemy.enemyTypeId);
  if (flight) return flight.lives;
  if (!enemy.teamId) return Math.max(1, splitIntoTeams(enemy.crew ?? getEnemyDefinition(state, enemy.enemyTypeId).dismount ?? []).length);
  if (state.leakedTeams.includes(enemy.teamId)) return 0;
  state.leakedTeams.push(enemy.teamId);
  return 1;
}

function leakEnemy(state, enemy) {
  enemy.alive = false;
  state.lives -= livesCostOf(state, enemy);
  queueEffect(state, { type: 'enemy-leaked', enemyId: enemy.id, enemyTypeId: enemy.enemyTypeId, fireDelaySeconds: enemy.fireDelaySeconds ?? 0 });
  markUiDirty(state);

  if (state.lives <= 0) {
    state.gameOver = true;
    state.victory = false;
    state.overlay = {
      visible: true,
      title: OVR.gameOver.title,
      text: `El enemigo llegó a la base en la oleada ${state.wave}.`,
      color: OVR.gameOver.color,
    };
    queueEffect(state, { type: 'game-ended', victory: false, wave: state.wave, lives: 0, credits: state.credits });
    markUiDirty(state);
  }
}

function turnEnemyToward(enemy, targetAngle, dt) {
  let diff = targetAngle - enemy.rotation;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  enemy.rotation += diff * Math.min(1, dt * SIM.enemyRotationLerp);
}

// El id de la torre en pie en la que entraría al pasar de (x, z) a (nextX, nextZ). Alejarse de una,
// aunque esté encima (la pusieron donde ya estaba), no cuenta; los restos de una torre no estorban.
function findTowerInTheWay(state, x, z, nextX, nextZ) {
  const contact = INF.towerContact * state.config.worldScale;
  for (const tower of state.towers) {
    if (tower.destroyed) continue;
    const next = distance2d(nextX, nextZ, tower.wx, tower.wz);
    if (next < contact && next < distance2d(x, z, tower.wx, tower.wz)) return tower.id;
  }
  return null;
}

// Hacia dónde lo empujan los soldados que tiene encima: así no caminan uno dentro del otro.
function getSoldierSpread(state, enemy) {
  const radius = INF.spacing * state.config.worldScale;
  const spread = { x: 0, z: 0 };
  for (const other of state.enemies) {
    if (other === enemy || !other.alive || !other.offRoad) continue;
    if (enemy.teamId && other.teamId === enemy.teamId) continue;
    const distance = distance2d(enemy.position.x, enemy.position.z, other.position.x, other.position.z);
    if (distance === 0 || distance >= radius) continue;
    const strength = 1 - distance / radius;
    spread.x += ((enemy.position.x - other.position.x) / distance) * strength;
    spread.z += ((enemy.position.z - other.position.z) / distance) * strength;
  }
  return spread;
}

// La infantería va derecho a la base, por donde sea. Si una torre en pie le cierra el paso, se
// detiene y le dispara hasta destruirla (updateEnemyWeapons); después sigue. La cobertura no la
// detiene: la busca de camino y pasa por encima o por debajo, más lento. En la calle queda expuesta.
function findCoverById(state, coverId) {
  for (const list of COVER_LISTS) {
    const item = state[list].find((candidate) => candidate.id === coverId);
    if (item) return item;
  }
  return null;
}

function findCoverAt(state, x, z) {
  for (const list of COVER_LISTS) {
    for (const item of state[list]) {
      if (distance2d(x, z, item.wx, item.wz) <= COVER[item.kind].coverRadius * state.config.worldScale) return item;
    }
  }
  return null;
}

/** La cobertura a la que va el soldado: la que ya eligió o la más cercana que quede de camino. */
function updateCoverGoal(state, enemy, dt, base, distanceToBase) {
  const { worldScale } = state.config;
  const { x, z } = enemy.position;
  let goal = enemy.coverGoalId ? findCoverById(state, enemy.coverGoalId) : null;
  if (goal) {
    enemy.coverGoalSeconds += dt;
    if (distance2d(x, z, goal.wx, goal.wz) < COVER_SEEK.reach * worldScale || enemy.coverGoalSeconds > COVER_SEEK.patience) {
      enemy.usedCover.push(goal.id);
      goal = null;
    }
  }
  if (!goal) {
    enemy.coverGoalSeconds = 0;
    let nearest = COVER_SEEK.radius * worldScale;
    for (const list of COVER_LISTS) {
      for (const item of state[list]) {
        const distance = distance2d(x, z, item.wx, item.wz);
        if (distance > nearest || enemy.usedCover.includes(item.id)) continue;
        const remaining = distance2d(item.wx, item.wz, base.x, base.z);
        if (remaining >= distanceToBase || distance + remaining - distanceToBase > enemy.coverDetour) continue;
        nearest = distance;
        goal = item;
      }
    }
  }
  enemy.coverGoalId = goal?.id ?? null;
  return goal;
}

/** Dónde queda un puesto de la escuadra respecto de su centro, mirando hacia `rotation`. */
function teamSlotOffset(slot, rotation, worldScale) {
  return {
    x: (Math.cos(rotation) * slot.side - Math.sin(rotation) * slot.back) * worldScale,
    z: (-Math.sin(rotation) * slot.side - Math.cos(rotation) * slot.back) * worldScale,
  };
}

/** Los puestos de una unidad: los primeros adelante, en fila, y el último detrás, al medio. Solo, al centro. */
function createTeamSlots(enemyTypeIds) {
  if (enemyTypeIds.length === 1) return [{ side: 0, back: 0 }];
  return enemyTypeIds.map((_, index) => (index < TEAMS.frontPerTeam
    ? { side: index === 0 ? -TEAMS.slotSide : TEAMS.slotSide, back: 0 }
    : { side: 0, back: TEAMS.slotBack }));
}

/** Reparte soldados en unidades, con quienes van adelante primero: uno de ellos manda. */
function splitIntoTeams(enemyTypeIds) {
  const ordered = [...enemyTypeIds].sort((a, b) => Number(a === TEAMS.rear) - Number(b === TEAMS.rear));
  const teams = [];
  for (let index = 0; index < ordered.length; index += TEAM_SIZE) teams.push(ordered.slice(index, index + TEAM_SIZE));
  return teams;
}

function findTeamLeader(state, teamId) {
  return state.enemies.find((item) => item.teamId === teamId && item.alive) ?? null;
}

/** No elige camino: mantiene su puesto respecto de quien manda, y se detiene con él. */
function updateTeamFollower(state, enemy, leader, dt) {
  const { worldScale } = state.config;
  const leaderSlot = teamSlotOffset(leader.teamSlot, leader.rotation, worldScale);
  const ownSlot = teamSlotOffset(enemy.teamSlot, leader.rotation, worldScale);
  const toX = leader.position.x - leaderSlot.x + ownSlot.x - enemy.position.x;
  const toZ = leader.position.z - leaderSlot.z + ownSlot.z - enemy.position.z;
  const distance = Math.hypot(toX, toZ);
  const step = Math.min(enemy.speed * soldierPace(enemy) * TEAMS.catchUp * dt, distance);
  const nextX = enemy.position.x + (distance > 0 ? (toX / distance) * step : 0);
  const nextZ = enemy.position.z + (distance > 0 ? (toZ / distance) * step : 0);
  enemy.blockedBy = leader.blockedBy;
  const moves = !findTowerInTheWay(state, enemy.position.x, enemy.position.z, nextX, nextZ);
  enemy.velocity = moves && distance > 0
    ? { x: (toX / distance) * (step / dt), y: 0, z: (toZ / distance) * (step / dt) }
    : { x: 0, y: 0, z: 0 };
  if (moves) {
    enemy.position.x = nextX;
    enemy.position.z = nextZ;
  }
  settleSoldierOnGround(state, enemy, dt);
  const obstacle = enemy.blockedBy && state.towers.find((tower) => tower.id === enemy.blockedBy);
  turnEnemyToward(enemy, obstacle ? Math.atan2(obstacle.wx - enemy.position.x, obstacle.wz - enemy.position.z) : leader.rotation, dt);
}

// De rodilla no avanza; tirado, se arrastra.
function soldierPace(enemy) {
  if (enemy.kneelSeconds > 0) return 0;
  return enemy.proneSeconds > 0 ? INFANTRY_COMBAT.prone.speed : 1;
}

function updateInfantryMovement(state, enemy, dt) {
  if (enemy.proneSeconds > 0) enemy.proneSeconds -= dt;
  if (enemy.kneelSeconds > 0) enemy.kneelSeconds -= dt;
  const { baseGrid, groundTileHeightWorld, halfHeight, halfWidth, pathSurfaceY, pathWorld, worldScale } = state.config;
  const { x, z } = enemy.position;
  const base = pathWorld.at(-1);
  const distanceToBase = distance2d(x, z, base.x, base.z);
  if (distanceToBase <= INF.baseReach * worldScale) {
    leakEnemy(state, enemy);
    return;
  }

  const leader = enemy.teamId ? findTeamLeader(state, enemy.teamId) : null;
  if (leader && leader !== enemy) {
    updateTeamFollower(state, enemy, leader, dt);
    return;
  }

  const goal = updateCoverGoal(state, enemy, dt, base, distanceToBase);
  const goalX = goal ? goal.wx : base.x;
  const goalZ = goal ? goal.wz : base.z;
  const distanceToGoal = Math.max(distance2d(x, z, goalX, goalZ), 1e-6);
  const headingX = (goalX - x) / distanceToGoal;
  const headingZ = (goalZ - z) / distanceToGoal;
  const cover = enemy.coverId ? findCoverById(state, enemy.coverId) : null;
  const speed = enemy.speed * (cover ? COVER[cover.kind].coverSpeed : 1) * soldierPace(enemy);
  const step = speed * dt;
  enemy.blockedBy = findTowerInTheWay(state, x, z, x + headingX * step, z + headingZ * step);
  const walk = enemy.blockedBy ? 0 : 1;
  enemy.velocity = { x: headingX * speed * walk, y: 0, z: headingZ * speed * walk };

  const walkedX = x + headingX * step * walk;
  const walkedZ = z + headingZ * step * walk;
  const spread = getSoldierSpread(state, enemy);
  const spreadX = walkedX + spread.x * step * INF.spreadSpeed;
  const spreadZ = walkedZ + spread.z * step * INF.spreadSpeed;
  const spreadBlocked = findTowerInTheWay(state, x, z, spreadX, spreadZ);
  enemy.position.x = spreadBlocked ? walkedX : spreadX;
  enemy.position.z = spreadBlocked ? walkedZ : spreadZ;

  settleSoldierOnGround(state, enemy, dt);

  // Frente a la torre que le cierra el paso gira el cuerpo hacia ella: rozándola de costado, el
  // arma no la alcanzaría y no dispararía nunca.
  const obstacle = enemy.blockedBy && state.towers.find((tower) => tower.id === enemy.blockedBy);
  turnEnemyToward(enemy, obstacle ? Math.atan2(obstacle.wx - enemy.position.x, obstacle.wz - enemy.position.z) : Math.atan2(headingX, headingZ), dt);
}

/** Pisa el pasto, el camino (un poco más alto) o sube a la roca, y mira si está a cubierto o sin cobertura. */
function settleSoldierOnGround(state, enemy, dt) {
  const { baseGrid, groundTileHeightWorld, halfHeight, halfWidth, pathSurfaceY, worldScale } = state.config;
  const { gx, gy } = worldToGrid(enemy.position.x, enemy.position.z, worldScale, halfWidth, halfHeight);
  const onRoad = baseGrid[gy]?.[gx] === 1;
  const coverRadius = ROCKS.coverRadius * worldScale;
  const rockDistance = Math.min(Infinity, ...state.rocks.map((rock) => distance2d(enemy.position.x, enemy.position.z, rock.wx, rock.wz)));
  const onRock = Math.max(0, 1 - rockDistance / coverRadius);
  const groundY = (onRoad ? pathSurfaceY : groundTileHeightWorld) + onRock * onRock * (3 - 2 * onRock) * ROCKS.climbHeight * worldScale;
  enemy.position.y += (groundY - enemy.position.y) * Math.min(1, dt * INF.groundLerp);

  enemy.coverId = findCoverAt(state, enemy.position.x, enemy.position.z)?.id ?? null;
  enemy.inCover = Boolean(enemy.coverId);
  enemy.onRoad = onRoad;
  enemy.coverLevel = getCoverLevel(enemy);
  enemy.exposed = enemy.coverLevel === 0;
}

function findNearestStandingTower(state, x, z) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const tower of state.towers) {
    if (tower.destroyed) continue;
    const distance = distance2d(x, z, tower.wx, tower.wz);
    if (distance < nearestDistance) {
      nearest = tower;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** La torre en la que más se invirtió, la más evolucionada; a igual inversión, la más cercana. */
function findPriciestStandingTower(state, x, z) {
  let priciest = null;
  for (const tower of state.towers) {
    if (tower.destroyed) continue;
    if (!priciest || tower.invested > priciest.invested
      || (tower.invested === priciest.invested && distance2d(x, z, tower.wx, tower.wz) < distance2d(x, z, priciest.wx, priciest.wz))) {
      priciest = tower;
    }
  }
  return priciest;
}

/** Le rompe un nivel de blindaje a una torre: vuelve al anterior, y no conserva más vida que su nuevo máximo. */
function breakTowerArmor(state, definition, tower) {
  tower.defenseTier -= 1;
  const defense = definition.defenseLevels[tower.defenseTier];
  tower.armorClass = defense.armorClass;
  tower.armor = defense.armor;
  tower.maxHp = getTowerMaxHp(definition, tower);
  tower.hp = Math.min(tower.hp, tower.maxHp);
  queueEffect(state, { type: 'tower-armor-lost', towerId: tower.id, tier: tower.defenseTier });
  markUiDirty(state);
  markWorldDirty(state);
}

/** Un dron estalla sobre su blanco. Le quita a la torre una parte de su vida total: no es un disparo y el blindaje no lo frena. */
function detonateDrone(state, enemy, flight, tower) {
  const { worldScale } = state.config;
  const source = { damageType: enemy.damageType, sourceId: enemy.id, sourceTypeId: enemy.enemyTypeId };
  const strike = (target, share) => {
    const damage = target.maxHp * share;
    applyTowerDamage(state, source, target, damage, damage, false);
  };
  if (flight.breaksArmor && tower.defenseTier > 0) {
    breakTowerArmor(state, getTowerDefinition(state, tower), tower);
  } else if (!flight.blastRadius) {
    strike(tower, flight.hpShare);
  } else {
    const radius = flight.blastRadius * worldScale;
    for (const target of state.towers) {
      if (target.destroyed) continue;
      const near = 1 - distance2d(tower.wx, tower.wz, target.wx, target.wz) / radius;
      if (near >= 0) strike(target, flight.edgeShare + (flight.hpShare - flight.edgeShare) * near);
    }
  }
}

/** Vuela derecho, sin que nada lo detenga: a la torre más cercana, o a la base si no hay o si no va a torres. */
function updateFlyingMovement(state, enemy, dt) {
  const { flight } = getEnemyDefinition(state, enemy.enemyTypeId);
  const { pathSurfaceY, pathWorld, worldScale } = state.config;
  const base = pathWorld.at(-1);
  const findTarget = flight.target === 'priciest' ? findPriciestStandingTower : findNearestStandingTower;
  const tower = findTarget(state, enemy.position.x, enemy.position.z);
  const goalX = tower ? tower.wx : base.x;
  const goalZ = tower ? tower.wz : base.z;
  const distance = distance2d(enemy.position.x, enemy.position.z, goalX, goalZ);
  if (distance <= FLYING.reach * worldScale) {
    let position = { ...enemy.position };
    if (tower) {
      enemy.alive = false;
      detonateDrone(state, enemy, flight, tower);
      position = { x: tower.wx, y: pathSurfaceY + worldScale * 0.3, z: tower.wz };
    } else {
      leakEnemy(state, enemy);
    }
    queueEffect(state, { type: 'drone-exploded', enemyId: enemy.id, enemyTypeId: enemy.enemyTypeId, position, impactBlast: flight.impactBlast * worldScale });
    return;
  }
  const headingX = (goalX - enemy.position.x) / distance;
  const headingZ = (goalZ - enemy.position.z) / distance;
  enemy.velocity = { x: headingX * enemy.speed, y: 0, z: headingZ * enemy.speed };
  enemy.position.x += enemy.velocity.x * dt;
  enemy.position.z += enemy.velocity.z * dt;
  enemy.position.y = pathSurfaceY + flight.height * worldScale;
  turnEnemyToward(enemy, Math.atan2(headingX, headingZ), dt);
}

function updateEnemyMovement(state, enemy, dt) {
  if (enemy.flying) {
    updateFlyingMovement(state, enemy, dt);
    return;
  }
  if (enemy.offRoad) {
    updateInfantryMovement(state, enemy, dt);
    return;
  }
  const { pathWorld } = state.config;

  if (enemy.pathIndex >= pathWorld.length - 1) {
    return;
  }

  const from = pathWorld[enemy.pathIndex];
  const to = pathWorld[enemy.pathIndex + 1];
  const segmentLength = distance3d(from, to);
  if (enemy.overheatSeconds > 0) {
    enemy.overheatSeconds -= dt;
    // Lo que el napalm le hizo perder: a menor velocidad, avanza en `dt` lo que antes en menos tiempo.
    enemy.fireDelaySeconds = (enemy.fireDelaySeconds ?? 0) + dt * (1 - FIRE.overheatSpeed);
  }
  enemy.progress += (getVehicleSpeed(enemy) * dt) / segmentLength;

  if (enemy.progress >= 1) {
    enemy.progress = 0;
    enemy.pathIndex += 1;

    if (enemy.pathIndex >= pathWorld.length - 1) {
      leakEnemy(state, enemy);
      return;
    }
  }

  const segmentFrom = pathWorld[enemy.pathIndex];
  const segmentTo = pathWorld[enemy.pathIndex + 1];
  enemy.position.x = lerp(segmentFrom.x, segmentTo.x, enemy.progress);
  enemy.position.y = lerp(segmentFrom.y, segmentTo.y, enemy.progress);
  enemy.position.z = lerp(segmentFrom.z, segmentTo.z, enemy.progress);

  const dirX = segmentTo.x - segmentFrom.x;
  const dirZ = segmentTo.z - segmentFrom.z;
  turnEnemyToward(enemy, Math.atan2(dirX, dirZ), dt);
  if (enemy.lane) {
    enemy.position.x += Math.cos(enemy.rotation) * enemy.lane * state.config.worldScale;
    enemy.position.z -= Math.sin(enemy.rotation) * enemy.lane * state.config.worldScale;
  }
}

function refreshGridWithTowerCells(state) {
  state.grid = cloneStateValue(state.config.baseGrid);
  for (const tower of state.towers) {
    if (state.grid[tower.gy]?.[tower.gx] === 0) {
      state.grid[tower.gy][tower.gx] = 2;
    }
  }
}

// Al terminar la oleada, cada torre vuelve entera (así reviven las destruidas), con las
// mejoras que el jugador le compró durante la oleada.
function reviveTowersAfterWave(state) {
  for (const tower of state.towers) {
    tower.hp = tower.maxHp;
    resetTowerCombatFlags(tower);
  }
  markUiDirty(state);
  markWorldDirty(state);
}

function spawnEnemy(state, enemyTypeId) {
  const enemy = createEnemyInstance(state, enemyTypeId);
  if (enemy.flying) {
    // Sale de la niebla, por cualquier punto de ese borde.
    const center = pickFogEdgePoint(state, state.config.mapDefinition.infantrySpawn.allRows);
    const base = state.config.pathWorld.at(-1);
    enemy.position = { x: center.x, y: state.config.pathSurfaceY + getEnemyDefinition(state, enemyTypeId).flight.height * state.config.worldScale, z: center.z };
    enemy.rotation = Math.atan2(base.x - center.x, base.z - center.z);
  }
  state.enemies.push(enemy);
  queueEffect(state, { type: 'enemy-spawned', enemyId: enemy.id, enemyTypeId, veterancy: enemy.veterancy });
  markUiDirty(state);
  markWorldDirty(state);
  return enemy;
}

/** Dónde entra una escuadra: al azar del combate, para que la partida se pueda repetir. */
function pickInfantrySpawn(state) {
  const { earlyRows, allRows, openFromWave } = state.config.mapDefinition.infantrySpawn;
  return pickFogEdgePoint(state, state.wave < openFromWave ? earlyRows : allRows);
}

function pickFogEdgePoint(state, [firstRow, lastRow]) {
  const { halfHeight, halfWidth, mapDefinition, worldScale } = state.config;
  const { column } = mapDefinition.infantrySpawn;
  const row = firstRow + Math.floor(nextCombatRandom(state) * (lastRow - firstRow + 1)) + 0.2 + nextCombatRandom(state) * 0.6;
  return { x: (column + 0.5 - halfWidth) * worldScale, z: (row - halfHeight) * worldScale };
}

function joinTeam(state, enemyTypeIds, placeSoldier, veterancy = 0) {
  const teamId = allocateId('team');
  const slots = createTeamSlots(enemyTypeIds);
  const soldiers = enemyTypeIds.map((enemyTypeId) => createEnemyInstance(state, enemyTypeId, veterancy));
  // Caminan juntos: al paso del más lento, que sigue siendo su paso si mueren los demás.
  const speed = Math.min(...soldiers.map((soldier) => soldier.speed));
  return soldiers.map((soldier, index) => {
    soldier.speed = speed;
    soldier.teamId = teamId;
    soldier.teamSlot = slots[index];
    placeSoldier(soldier, slots[index]);
    state.enemies.push(soldier);
    return soldier;
  });
}

function spawnTeam(state, size) {
  const veterancy = state.activeWaveDefinition?.veterancy
    ?? rollVeterancy(state.wave, nextCombatRandom(state), VETERANCY.squadOdds);
  const { groundTileHeightWorld, pathWorld, worldScale } = state.config;
  const center = pickInfantrySpawn(state);
  const base = pathWorld.at(-1);
  const rotation = Math.atan2(base.x - center.x, base.z - center.z);
  joinTeam(state, squadAtLevel(size, veterancy), (soldier, slot) => {
    const offset = teamSlotOffset(slot, rotation, worldScale);
    soldier.position = { x: center.x + offset.x, y: groundTileHeightWorld, z: center.z + offset.z };
    soldier.rotation = rotation;
    queueEffect(state, { type: 'enemy-spawned', enemyId: soldier.id, enemyTypeId: soldier.enemyTypeId });
  }, veterancy);
  markUiDirty(state);
  markWorldDirty(state);
}

/** Saca de la fila a quienes completan una unidad con el soldado que ya salió. Devuelve cuántos son. */
function takeTeamFromQueue(state) {
  let size = 1;
  while (size < TEAM_SIZE) {
    const index = state.spawnQueue.findIndex((enemyTypeId) => state.config.enemyDefinitions[enemyTypeId]?.armorClass === 'infantry');
    if (index < 0) break;
    state.spawnQueue.splice(index, 1);
    size += 1;
  }
  return size;
}

/** El cohete incendiario vuela a un punto del suelo: donde estará su blanco, con el error de la salva. */
function fireArtilleryRocket(state, tower, definition, stats) {
  const { artillery, projectileSpeed, damageType, impactBlast } = definition.combatModel;
  const { worldScale, pathSurfaceY } = state.config;
  const fireIndex = tower.fireIndex;
  const origin = getMuzzleWorld(getTowerRig(definition, tower), getTowerPose(state, definition, tower), fireIndex);
  const angle = nextCombatRandom(state) * Math.PI * 2;
  const spread = Math.sqrt(nextCombatRandom(state)) * artillery.scatter * worldScale;
  const to = { x: tower.leadPoint.x + Math.cos(angle) * spread, z: tower.leadPoint.z + Math.sin(angle) * spread };
  const distance = distance2d(origin.x, origin.z, to.x, to.z);
  const direction = getBarrelDirection(tower.aimAngle, tower.aimPitch);
  state.projectiles.push({
    id: allocateId('projectile'),
    sourceType: 'tower',
    sourceId: tower.id,
    targetType: 'ground',
    look: 'rocket',
    x: origin.x,
    y: origin.y,
    z: origin.z,
    vx: direction.x,
    vy: direction.y,
    vz: direction.z,
    speed: projectileSpeed * worldScale,
    origin: { ...origin },
    to,
    groundY: pathSurfaceY,
    flightSeconds: distance / (projectileSpeed * worldScale),
    elapsed: 0,
    arcHeight: artillery.arcHeight * worldScale,
    impactRadius: artillery.impactRadius * worldScale,
    damage: stats.damage,
    damageType,
    burnPerSecond: stats.burnPerSecond,
    burnSeconds: stats.burnSeconds,
    burnRadius: stats.burnRadius * worldScale,
    impactBlast: (impactBlast ?? 0) * worldScale,
    alive: true,
  });
  queueEffect(state, { type: 'projectile-fired', towerId: tower.id, towerTypeId: tower.towerTypeId, level: tower.level, launch: true, enemyId: tower.targetEnemyId, fireIndex, position: origin });
  tower.fireIndex += 1;
}

/** Quema una vez a quien esté en el radio: a pie o con ruedas; lo que vuela, no. */
function burnEnemiesAround(state, x, z, radius, amount, damageType, towerId, overheats = false) {
  // Lo que quemó, por tipo de enemigo: el registro de partidas lo suma a la torre (no es un impacto).
  const byEnemy = {};
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.flying) continue;
    if (distance2d(enemy.position.x, enemy.position.z, x, z) > radius) continue;
    const damage = Math.min(enemy.hp, resolveEnemyBurnDamage(amount, damageType, enemy.armorClass ?? 'light', enemy.armor));
    enemy.hp -= damage;
    byEnemy[enemy.enemyTypeId] = (byEnemy[enemy.enemyTypeId] ?? 0) + damage;
    if (enemy.hp <= 0) killEnemy(state, enemy, towerId);
    else if (overheats && !enemy.offRoad) overheatEngine(state, enemy);
  }
  if (Object.keys(byEnemy).length) queueEffect(state, { type: 'burn-damage', towerId, byEnemy });
}

/** Y a la cobertura: la roca no arde, el árbol sí, y el arbusto más. */
function burnCoverAround(state, x, z, radius, amount, damageType) {
  for (const list of ['trees', 'bushes']) {
    for (const cover of [...state[list]]) {
      if (distance2d(cover.wx, cover.wz, x, z) > radius) continue;
      const rules = COVER[cover.kind];
      cover.hp -= resolveBurnDamage(amount, damageType, rules.armorClass, rules.armor);
      if (cover.hp <= 0) removeCover(state, cover, 0);
    }
  }
}

/** Un vehículo que pasa por el fuego recalienta el motor: frena mientras esté ahí y un rato después. */
function overheatEngine(state, enemy) {
  if (!(enemy.overheatSeconds > 0)) queueEffect(state, { type: 'vehicle-overheated', enemyId: enemy.id, enemyTypeId: enemy.enemyTypeId, position: { ...enemy.position } });
  enemy.overheatSeconds = FIRE.overheatSeconds;
}

function landArtilleryRocket(state, projectile) {
  const { x, z } = projectile.to;
  projectile.alive = false;
  queueEffect(state, {
    type: 'incendiary-impact',
    towerId: projectile.sourceId,
    impactBlast: projectile.impactBlast,
    position: { x, y: projectile.groundY, z },
  });
  burnEnemiesAround(state, x, z, projectile.impactRadius, projectile.damage, projectile.damageType, projectile.sourceId);
  burnCoverAround(state, x, z, projectile.impactRadius, projectile.damage, projectile.damageType);
  const merge = FIRE.mergeRadius * state.config.worldScale;
  const near = state.fireZones.find((zone) => distance2d(zone.x, zone.z, x, z) < merge);
  if (near) {
    near.remaining = Math.max(near.remaining, projectile.burnSeconds);
    near.burnPerSecond = Math.max(near.burnPerSecond, projectile.burnPerSecond);
    // Un cohete de más nivel agranda el fuego donde cae (auditoría del 08-11).
    near.radius = Math.max(near.radius, projectile.burnRadius);
    return;
  }
  state.fireZones.push({
    id: allocateId('fire'),
    x,
    z,
    groundY: projectile.groundY,
    radius: projectile.burnRadius,
    remaining: projectile.burnSeconds,
    seconds: projectile.burnSeconds,
    burnPerSecond: projectile.burnPerSecond,
    damageType: projectile.damageType,
    towerId: projectile.sourceId,
  });
}

function getRocketPoint(projectile, progress) {
  return {
    x: lerp(projectile.origin.x, projectile.to.x, progress),
    y: lerp(projectile.origin.y, projectile.groundY, progress) + 4 * projectile.arcHeight * progress * (1 - progress),
    z: lerp(projectile.origin.z, projectile.to.z, progress),
  };
}

function updateArtilleryRocket(state, projectile, dt) {
  const interceptor = projectile.interceptSeconds === undefined && findInterceptor(state, projectile);
  if (interceptor) launchInterceptor(state, projectile, interceptor);
  projectile.elapsed += dt;
  const progress = Math.min(1, projectile.elapsed / projectile.flightSeconds);
  const lastX = projectile.x;
  const lastY = projectile.y;
  const lastZ = projectile.z;
  Object.assign(projectile, getRocketPoint(projectile, progress));
  const moved = Math.max(Math.hypot(projectile.x - lastX, projectile.y - lastY, projectile.z - lastZ), 1e-6);
  projectile.vx = (projectile.x - lastX) / moved;
  projectile.vy = (projectile.y - lastY) / moved;
  projectile.vz = (projectile.z - lastZ) / moved;
  if (projectile.interceptSeconds !== undefined) {
    projectile.interceptSeconds -= dt;
    if (projectile.interceptSeconds <= 0 || progress >= 1) detonateIntercepted(state, projectile);
    return;
  }
  if (progress >= 1) landArtilleryRocket(state, projectile);
}

function updateFireZones(state, dt) {
  for (const zone of state.fireZones) {
    zone.remaining -= dt;
    burnEnemiesAround(state, zone.x, zone.z, zone.radius, zone.burnPerSecond * dt, zone.damageType, zone.towerId, true);
    burnCoverAround(state, zone.x, zone.z, zone.radius, zone.burnPerSecond * dt, zone.damageType);
  }
  state.fireZones = state.fireZones.filter((zone) => zone.remaining > 0);
}

/** Cada tubo está a un costado del centro de la torre: su misil sale desde la boca hacia el punto al que apunta. */
function directionBetween(from, to) {
  const length = Math.max(distance3d(from, to), 1e-6);
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length, z: (to.z - from.z) / length };
}

function fireTowerProjectile(state, tower, enemy) {
  const definition = getTowerDefinition(state, tower);
  const stats = getTowerLevel(definition, tower.level);
  if (definition.combatModel.artillery) {
    fireArtilleryRocket(state, tower, definition, stats);
    return;
  }
  const fireIndex = tower.fireIndex;
  // La bala nace en la boca del cañón y sale en su dirección.
  const muzzleOrigin = getMuzzleWorld(getTowerRig(definition, tower), getTowerPose(state, definition, tower), fireIndex);
  const shotDirection = definition.combatModel.missile
    ? directionBetween(muzzleOrigin, tower.leadPoint)
    : getBarrelDirection(tower.aimAngle, tower.aimPitch);
  const projectile = {
    id: allocateId('projectile'),
    sourceType: 'tower',
    sourceId: tower.id,
    targetType: 'enemy',
    targetId: enemy.id,
    x: muzzleOrigin.x,
    y: muzzleOrigin.y,
    z: muzzleOrigin.z,
    vx: shotDirection.x,
    vy: shotDirection.y,
    vz: shotDirection.z,
    speed: definition.combatModel.projectileSpeed * state.config.worldScale,
    hitThreshold: definition.combatModel.hitThreshold * state.config.worldScale,
    maxDistance: stats.range * 1.5 * state.config.worldScale,
    damage: stats.damage,
    damageType: definition.combatModel.damageType,
    // Misil: vuela derecho y le pega a lo que se cruce (updateMissile).
    missile: Boolean(definition.combatModel.missile),
    origin: { ...muzzleOrigin },
    // Tamaño de la explosión que se dibuja al impactar: no hace daño de área.
    impactBlast: (definition.combatModel.impactBlast ?? 0) * state.config.worldScale,
    // Lo que vuela es difícil de acertar: con esta probabilidad le pega, si no, la bala sigue de largo.
    airHitChance: definition.combatModel.targets?.airHitChance ?? 1,
    smallAirHitChance: definition.combatModel.targets?.smallAirHitChance ?? null,
    flak: definition.combatModel.flak ?? null,
    alive: true,
  };

  state.projectiles.push(projectile);
  queueEffect(state, {
    type: 'projectile-fired',
    towerId: tower.id,
    towerTypeId: tower.towerTypeId,
    level: tower.level,
    launch: Boolean(definition.combatModel.launch),
    enemyId: enemy.id,
    fireIndex,
    position: muzzleOrigin,
  });
  tower.fireIndex += 1;
  // Pegado a la torre, el cañón no baja tanto o la boca ya quedó detrás de él: sin guía no le daría nunca.
  const muzzleReach = distance2d(muzzleOrigin.x, muzzleOrigin.z, tower.wx, tower.wz) + MISSILE_POINT_BLANK * state.config.worldScale;
  if (projectile.missile && distance2d(enemy.position.x, enemy.position.z, tower.wx, tower.wz) <= muzzleReach) {
    projectile.alive = false;
    applyEnemyHit(state, projectile, enemy);
  }
}

function fireEnemyProjectile(state, enemy, targetId) {
  const weapon = enemy.weaponProfile;
  if (!weapon) return;
  // La bala nace en la boca del modelo (girada con la torreta, el cañón y el rumbo) y sale
  // en la dirección del cañón.
  const fireIndex = enemy.fireIndex ?? 0;
  const source = getMuzzleWorld(getEnemyRig(state, enemy), getEnemyPose(state, enemy), fireIndex);
  const direction = getBarrelDirection(enemy.aimAngle, enemy.aimPitch);

  const projectile = {
    id: allocateId('projectile'),
    sourceType: 'enemy',
    sourceId: enemy.id,
    sourceTypeId: enemy.enemyTypeId,
    look: weapon.projectile ?? null,
    targetType: 'tower',
    targetId,
    x: source.x,
    y: source.y,
    z: source.z,
    vx: direction.x,
    vy: direction.y,
    vz: direction.z,
    speed: (weapon.projectileSpeed ?? 10) * state.config.worldScale,
    hitThreshold: (weapon.hitThreshold ?? 0.2) * state.config.worldScale,
    maxDistance: (weapon.range ?? 3) * 1.5 * state.config.worldScale,
    damage: weapon.damage ?? 0,
    armorPierce: weapon.armorPierce ?? 0,
    damageType: weapon.damageType ?? enemy.damageType,
    // `blast` es daño de área (el HE del tanque); `impactBlast`, solo la explosión que se dibuja.
    blastRadius: (weapon.blast?.radius ?? 0) * state.config.worldScale,
    blastFraction: weapon.blast?.fraction ?? 0,
    impactBlast: (weapon.impactBlast ?? 0) * state.config.worldScale,
    alive: true,
  };
  enemy.fireIndex = fireIndex + 1;

  state.projectiles.push(projectile);
  queueEffect(state, {
    type: 'enemy-projectile-fired',
    enemyId: enemy.id,
    enemyTypeId: enemy.enemyTypeId,
    fireIndex,
    projectile: weapon.projectile ?? null,
    sound: weapon.sound ?? null,
    position: source,
  });
}

/** Hacia dónde mira una torre sin blanco: el comienzo del camino, por donde entra el enemigo. */
function getRestAngle(state, wx, wz) {
  const [entrance] = state.config.pathWorld;
  return Math.atan2(entrance.x - wx, entrance.z - wz);
}

function rotateTurretToward(current, target, speed, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxStep = speed * dt;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

function isTargetInFiringArc(enemy, targetX, targetZ, firingArc) {
  if (firingArc >= Math.PI * 2) return true;
  const dx = targetX - enemy.position.x;
  const dz = targetZ - enemy.position.z;
  const angleToTarget = Math.atan2(dx, dz);
  let diff = angleToTarget - enemy.rotation;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= firingArc / 2;
}

function findNearestTowerInRange(state, enemy, rangeWorld) {
  const firingArc = enemy.weaponProfile?.firingArc ?? Math.PI * 2;
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const tower of state.towers) {
    if (tower.destroyed) continue;
    if (tower.hp <= 0) continue;
    const distance = distance2d(enemy.position.x, enemy.position.z, tower.wx, tower.wz);
    if (distance <= rangeWorld && distance < nearestDistance) {
      if (!isTargetInFiringArc(enemy, tower.wx, tower.wz, firingArc)) continue;
      nearestDistance = distance;
      nearest = tower;
    }
  }
  return nearest;
}

// La torreta apunta desde su pivote, no desde la boca. Con el blanco casi encima, la boca lo deja
// a un costado o ya lo pasó y la bala saldría desviada: no dispara.
function isTooCloseToAim(state, enemy, target) {
  const muzzle = getMuzzleWorld(getEnemyRig(state, enemy), getEnemyPose(state, enemy), enemy.fireIndex ?? 0);
  const toTarget = { x: target.x - muzzle.x, y: target.y - muzzle.y, z: target.z - muzzle.z };
  const barrel = getBarrelDirection(enemy.aimAngle, enemy.aimPitch);
  const along = toTarget.x * barrel.x + toTarget.y * barrel.y + toTarget.z * barrel.z;
  return Math.acos(Math.min(1, along / (Math.hypot(toTarget.x, toTarget.y, toTarget.z) || 1))) > SIM.maxMuzzleAimError;
}

/** Un soldado en combate lanza granadas: la primera a los `delay` segundos de encontrar blanco. */
function updateGrenade(state, enemy, tower, dt) {
  if (getEnemyDefinition(state, enemy.enemyTypeId).locomotion !== 'foot') return;
  const grenade = INFANTRY_COMBAT.grenade;
  enemy.grenadeCooldown = tickCooldown(enemy.grenadeCooldown, dt);
  if (!tower) {
    enemy.combatSeconds = 0;
    return;
  }
  enemy.combatSeconds += dt;
  if (enemy.combatSeconds < grenade.delay || enemy.grenadeCooldown > 0) return;
  if (distance2d(enemy.position.x, enemy.position.z, tower.wx, tower.wz) > grenade.range * state.config.worldScale) return;
  enemy.grenadeCooldown = grenade.cooldown;
  throwGrenade(state, enemy, tower);
}

function throwGrenade(state, enemy, tower) {
  const { blast, damage, damageType, hitThreshold, impactBlast, range, speed } = INFANTRY_COMBAT.grenade;
  const { worldScale } = state.config;
  const source = getEnemyAimPoint(state, enemy);
  const target = getTowerAimPoint(state, tower);
  const flight = Math.max(distance3d(source, target), 1e-6);
  state.projectiles.push({
    id: allocateId('projectile'),
    sourceType: 'enemy',
    sourceId: enemy.id,
    sourceTypeId: enemy.enemyTypeId,
    look: 'grenade',
    targetType: 'tower',
    targetId: tower.id,
    ...source,
    origin: { ...source },
    flight,
    vx: (target.x - source.x) / flight,
    vy: (target.y - source.y) / flight,
    vz: (target.z - source.z) / flight,
    speed: speed * worldScale,
    hitThreshold: hitThreshold * worldScale,
    maxDistance: range * 1.5 * worldScale,
    damage,
    armorPierce: 0,
    damageType,
    blastRadius: blast.radius * worldScale,
    blastFraction: blast.fraction,
    impactBlast: impactBlast * worldScale,
    alive: true,
  });
  queueEffect(state, {
    type: 'enemy-projectile-fired',
    enemyId: enemy.id,
    enemyTypeId: enemy.enemyTypeId,
    fireIndex: enemy.fireIndex ?? 0,
    projectile: 'grenade',
    sound: 'grenade',
    position: source,
  });
}

/** El misil solo sale de rodilla: la primera vez que puede disparar se arrodilla, y dispara al terminar. */
function isKneeledToFire(enemy) {
  const { hold, rise } = INFANTRY_COMBAT.kneel;
  if (!(enemy.kneelSeconds > 0)) {
    enemy.kneelSeconds = rise + hold;
    return false;
  }
  return enemy.kneelSeconds <= hold;
}

function updateEnemyWeapons(state, dt) {
  for (const enemy of state.enemies) {
    if (!enemy.alive || !enemy.isArmed || !enemy.weaponProfile) {
      enemy.targetTowerId = null;
      continue;
    }

    const weapon = enemy.weaponProfile;
    enemy.weaponCooldown = tickCooldown(enemy.weaponCooldown, dt);
    const rangeWorld = weapon.range * state.config.worldScale;
    // A la torre que le cierra el paso le dispara hasta destruirla, aunque tenga otra más cerca.
    const blockingTower = enemy.blockedBy && state.towers.find((tower) => tower.id === enemy.blockedBy && !tower.destroyed);
    const targetTower = blockingTower || findNearestTowerInRange(state, enemy, rangeWorld);
    updateGrenade(state, enemy, targetTower, dt);

    const yawSpeed = weapon.yawSpeed ?? Math.PI * 2;
    if (!targetTower) {
      // Sin blanco, la torreta vuelve al frente del vehículo: así, al encontrar uno, gira
      // desde ahí en vez de saltar.
      enemy.targetTowerId = null;
      enemy.aimAngle = rotateTurretToward(enemy.aimAngle, enemy.rotation, yawSpeed, dt);
      enemy.aimPitch = 0;
      continue;
    }

    enemy.targetTowerId = targetTower.id;
    const aimPoint = getTowerAimPoint(state, targetTower);

    // La torreta gira hacia el blanco a yawSpeed (rad/s); el cañón toma la elevación justa,
    // dentro de lo que su montaje permite. Un tanque baja el cañón unos 10°: una torre pegada a
    // su costado queda bajo la boca, en su ángulo muerto, y no le puede disparar.
    const aim = aimAt(getEnemyRig(state, enemy), getEnemyPose(state, enemy), aimPoint);
    const desiredAngle = aim.aimAngle;
    const limits = weapon.elevationLimits ?? SIM.defaultElevationLimits;
    enemy.aimAngle = rotateTurretToward(enemy.aimAngle, desiredAngle, yawSpeed, dt);
    enemy.aimPitch = Math.max(limits.min, Math.min(limits.max, aim.elevation));
    if (aim.elevation < limits.min - 0.02 || aim.elevation > limits.max + 0.02) continue;

    // Solo dispara con la torreta alineada (readyAngle).
    let angleDiff = desiredAngle - enemy.aimAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    if (Math.abs(angleDiff) > (weapon.readyAngle ?? 0.1)) continue;
    if (isTooCloseToAim(state, enemy, aimPoint)) continue;

    if (enemy.weaponCooldown <= 0) {
      if (weapon.kneels && !isKneeledToFire(enemy)) continue;
      const rate = Math.max(0.05, weapon.rate ?? 0.5);
      enemy.weaponCooldown += 1 / rate;
      fireEnemyProjectile(state, enemy, targetTower.id);
    }
  }
}

/** Cuántas torres caben ahora: crece con la oleada en curso o la que se prepara. */
export function getTowerLimit(state) {
  if (state.developerMode.enabled) return Infinity;
  const { base, perWave, max } = SIM.towerLimit;
  const wave = state.waveActive ? state.wave : state.wave + 1;
  return Math.min(max, base + perWave * Math.max(1, wave));
}

export function placeTower(state, placement) {
  const towerTypeId = placement.towerTypeId ?? 'mg7-vulcan';
  const definition = state.config.towerDefinitions[towerTypeId];
  const { gx, gy } = placement;

  if (!definition) {
    return null;
  }

  if (state.grid[gy]?.[gx] !== 0 || state.credits < definition.economy.baseCost || state.towers.length >= getTowerLimit(state)) {
    return null;
  }

  const world = getCellWorldPosition(state.config, gx, gy);
  const defenseLevel = getTowerDefenseLevel(definition, 0);
  const tower = {
    id: allocateId('tower'),
    towerTypeId,
    gx,
    gy,
    wx: world.x,
    wz: world.z,
    level: 0,
    defenseTier: 0,
    hp: defenseLevel.maxHp,
    maxHp: defenseLevel.maxHp,
    armor: defenseLevel.armor,
    armorClass: defenseLevel.armorClass,
    destroyed: false,
    damageFxActive: false,
    cooldown: 0,
    kills: 0,
    invested: definition.economy.baseCost,
    // Lo gastado en ella desde la última oleada: si estuvo mal puesta, se devuelve entero.
    spentSinceLastWave: state.waveActive ? 0 : definition.economy.baseCost,
    fireIndex: 0,
    aimAngle: getRestAngle(state, world.x, world.z),
    aimPitch: SIM.towerRestElevation,
    hasTarget: false,
    targetEnemyId: null,
  };

  const bush = state.bushes.find((item) => item.gx === gx && item.gy === gy);
  if (bush) removeCover(state, bush, 0);
  state.credits -= definition.economy.baseCost;
  state.grid[gy][gx] = 2;
  state.towers.push(tower);
  queueEffect(state, { type: 'tower-placed', towerId: tower.id, gx, gy, cost: definition.economy.baseCost });
  markUiDirty(state);
  markWorldDirty(state);
  return tower;
}

/** La vida de la torre: la de su blindaje, más lo que le suma cada nivel de ataque. */
export function getTowerMaxHp(definition, tower, defenseTier = tower.defenseTier) {
  return Math.round(definition.defenseLevels[defenseTier].maxHp * (1 + tower.level * SIM.towerHpPerLevel));
}

export function getSellRefund(definition, tower) {
  const { destroyedSellRatio, sellRatio } = definition.economy;
  if (tower.destroyed) return Math.floor(tower.invested * destroyedSellRatio);
  const spentSinceLastWave = tower.spentSinceLastWave ?? 0;
  return spentSinceLastWave + Math.floor((tower.invested - spentSinceLastWave) * sellRatio);
}

export function upgradeTower(state, towerId) {
  const tower = state.towers.find((item) => item.id === towerId);
  if (!tower || tower.destroyed) {
    return false;
  }

  const definition = getTowerDefinition(state, tower);
  const level = getTowerLevel(definition, tower.level);
  if (level.upgradeCost == null || tower.level >= definition.levels.length - 1) {
    return false;
  }

  if (state.credits < level.upgradeCost) {
    return false;
  }

  state.credits -= level.upgradeCost;
  tower.invested += level.upgradeCost;
  if (!state.waveActive) tower.spentSinceLastWave += level.upgradeCost;
  tower.level += 1;
  const maxHp = getTowerMaxHp(definition, tower);
  tower.hp += maxHp - tower.maxHp;
  tower.maxHp = maxHp;
  queueEffect(state, { type: 'tower-upgraded', towerId: tower.id, level: tower.level, cost: level.upgradeCost });
  markUiDirty(state);
  markWorldDirty(state);
  return true;
}

export function upgradeTowerDefense(state, towerId) {
  const tower = state.towers.find((item) => item.id === towerId);
  if (!tower || tower.destroyed) {
    return false;
  }
  const definition = getTowerDefinition(state, tower);
  const levels = definition.defenseLevels ?? [];
  if (levels.length <= 1 || tower.defenseTier >= levels.length - 1) {
    return false;
  }
  const currentLevel = levels[tower.defenseTier];
  if (currentLevel.upgradeCost == null || state.credits < currentLevel.upgradeCost) {
    return false;
  }

  state.credits -= currentLevel.upgradeCost;
  tower.invested += currentLevel.upgradeCost;
  if (!state.waveActive) tower.spentSinceLastWave += currentLevel.upgradeCost;
  tower.defenseTier += 1;
  queueEffect(state, { type: 'tower-armored', towerId: tower.id, tier: tower.defenseTier, cost: currentLevel.upgradeCost });
  const nextDefense = levels[tower.defenseTier];
  tower.armorClass = nextDefense.armorClass;
  tower.maxHp = getTowerMaxHp(definition, tower);
  tower.hp = tower.maxHp;
  tower.armor = nextDefense.armor;
  resetTowerCombatFlags(tower);
  markUiDirty(state);
  markWorldDirty(state);
  return true;
}

export function sellTower(state, towerId) {
  const tower = state.towers.find((item) => item.id === towerId);
  if (!tower) {
    return false;
  }

  const definition = getTowerDefinition(state, tower);
  const refund = getSellRefund(definition, tower);
  state.credits += refund;
  queueEffect(state, { type: 'tower-sold', towerId: tower.id, refund });
  state.grid[tower.gy][tower.gx] = 0;
  state.towers = state.towers.filter((item) => item.id !== towerId);
  if (state.selectedTowerId === towerId) {
    state.selectedTowerId = null;
  }
  markUiDirty(state);
  markWorldDirty(state);
  return true;
}

/** Descuenta la espera entre oleadas. Devuelve true cuando se cumple: quien llama lanza la oleada. En modo desarrollo no corre. */
export function tickWaveCountdown(state, dt) {
  if (state.waveActive || state.gameOver || state.waveCountdown == null || state.developerMode.enabled) return false;
  const shown = Math.ceil(state.waveCountdown);
  state.waveCountdown = Math.max(0, state.waveCountdown - dt);
  const seconds = Math.ceil(state.waveCountdown);
  if (seconds !== shown) {
    markUiDirty(state);
    if (seconds > 0 && seconds <= GAMEPLAY_CONFIG.waves.countdown.urgentSeconds) queueEffect(state, { type: 'wave-countdown-beep', seconds });
  }
  return state.waveCountdown === 0;
}

export function startWave(state, options = {}) {
  if (state.waveActive || state.gameOver || state.wave >= state.config.waveSet.waves.length) {
    return false;
  }

  for (const tower of state.towers) {
    tower.hp = tower.maxHp;
    resetTowerCombatFlags(tower);
  }

  const baseWaveDefinition = state.config.waveSet.waves[state.wave];
  const waveDefinition = cloneStateValue(baseWaveDefinition);
  const overrideWaveDefinition = options.overrideWaveDefinition ?? null;
  if (overrideWaveDefinition) {
    if (typeof overrideWaveDefinition.interval === 'number' && overrideWaveDefinition.interval > 0) {
      waveDefinition.interval = overrideWaveDefinition.interval;
    }
    // Una oleada a medida pone a cada soldado por su cuenta, donde empieza el camino, si no pide unidades.
    waveDefinition.infantryTeams = overrideWaveDefinition.infantryTeams ?? false;
    waveDefinition.veterancy = overrideWaveDefinition.veterancy;
    if (Array.isArray(overrideWaveDefinition.spawns)) {
      const validSpawns = overrideWaveDefinition.spawns.filter((enemyTypeId) => state.config.enemyDefinitions[enemyTypeId]);
      if (validSpawns.length > 0) {
        waveDefinition.spawns = validSpawns;
        waveDefinition.count = validSpawns.length;
      }
    }
    waveDefinition.tags = {
      ...(waveDefinition.tags ?? {}),
      debugOverride: true,
    };
  }

  state.waveSnapshot = createWaveSnapshot(state);
  for (const tower of state.towers) tower.spentSinceLastWave = 0;
  state.waveCountdown = null;
  state.activeWaveDefinition = waveDefinition;
  state.wave += 1;
  state.waveActive = true;
  state.spawnQueue = waveDefinition.spawns
    ? [...waveDefinition.spawns]
    : Array.from({ length: waveDefinition.count }, () => waveDefinition.enemyTypeId);
  state.spawnTimer = SIM.initialSpawnDelay;
  state.spawnGaps = {};
  state.spawnedThisWave = 0;
  state.leakedTeams = [];
  queueEffect(state, { type: 'wave-started', wave: state.wave, spawns: [...state.spawnQueue], lives: state.lives, credits: state.credits });
  markUiDirty(state);
  markWorldDirty(state);
  return true;
}

export function selectTargets(state) {
  for (const tower of state.towers) {
    if (tower.destroyed) {
      tower.hasTarget = false;
      tower.targetEnemyId = null;
      tower.aimPitch = SIM.towerRestElevation;
      continue;
    }

    const definition = getTowerDefinition(state, tower);
    const stats = getTowerLevel(definition, tower.level);
    // 'nearest': el más cercano. 'armored': el de blindaje más pesado y, entre iguales, el
    // más cercano; así el lanzamisiles no gasta misiles en una patrulla si hay un tanque. 'infantry':
    // primero los soldados, lentos y agrupados: un cohete en arco no alcanza a una moto.
    const byArmor = definition.targeting?.default === 'armored';
    const byInfantry = definition.targeting?.default === 'infantry';
    let nearest = null;
    let nearestDistance = Infinity;
    let nearestRank = -1;
    let nearestCanHurt = false;

    const combat = definition.combatModel;
    const canHitGround = combat.targets?.ground ?? true;
    const canHitAir = combat.targets?.air ?? false;
    const resolve = combat.artillery ? resolveEnemyBurnDamage : resolveDamage;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      if (enemy.flying ? !canHitAir : !canHitGround) continue;
      const range = stats.range * state.config.worldScale;
      const distance = distance2d(enemy.position.x, enemy.position.z, tower.wx, tower.wz);
      if (distance > range || distance < (stats.minRange ?? 0) * state.config.worldScale) continue;
      const rank = byArmor ? ARMOR_RANK[enemy.armorClass] ?? 0 : byInfantry && enemy.armorClass === 'infantry' ? 1 : 0;
      // Mientras haya un vehículo al que pueda dañar, no gasta balas en uno que no.
      const canHurt = resolve(stats.damage, combat.damageType, enemy.armorClass ?? 'light', enemy.armor) > 0;
      const better = canHurt !== nearestCanHurt
        ? canHurt
        : rank > nearestRank || (rank === nearestRank && distance < nearestDistance);
      if (better || !nearest) {
        nearest = enemy;
        nearestDistance = distance;
        nearestRank = rank;
        nearestCanHurt = canHurt;
      }
    }

    // Aquí solo se elige el blanco; la torreta lo sigue en applyCombatStep (aimTower).
    tower.hasTarget = Boolean(nearest);
    if (nearest) {
      tower.targetEnemyId = nearest.id;
    } else {
      tower.targetEnemyId = null;
      tower.aimPitch = SIM.towerRestElevation;
    }
  }

  return state.towers.map((tower) => ({
    towerId: tower.id,
    targetEnemyId: tower.targetEnemyId ?? null,
  }));
}

function applyTowerHit(state, projectile, tower) {
  damageTower(state, projectile, tower, projectile.damage, false);
  if (!projectile.blastRadius) return;
  // Munición HE: las torres cerca del impacto reciben una fracción, con su blindaje.
  for (const other of state.towers) {
    if (other === tower || other.destroyed) continue;
    if (distance2d(other.wx, other.wz, tower.wx, tower.wz) > projectile.blastRadius) continue;
    damageTower(state, projectile, other, projectile.damage * projectile.blastFraction, true);
  }
}

// `splash`: el daño le llega por la onda de un impacto cercano, no por un acierto directo.
function damageTower(state, projectile, tower, rawDamage, splash) {
  // El blindaje de una torre reduce mucho el daño, pero no la hace inmune. resolveDamage no lleva
  // este mínimo porque también rige para los vehículos, a los que la MG-7 sí puede no hacerles nada.
  const damage = Math.max(
    COMBAT.towerMinDamagePerHit,
    resolveDamage(rawDamage, projectile.damageType, tower.armorClass, Math.max(0, tower.armor - (projectile.armorPierce ?? 0))),
  );
  applyTowerDamage(state, projectile, tower, damage, rawDamage, splash);
}

function applyTowerDamage(state, projectile, tower, damage, rawDamage, splash) {
  queueEffect(state, {
    type: 'tower-hit',
    towerId: tower.id,
    enemyId: projectile.sourceId,
    enemyTypeId: projectile.sourceTypeId,
    // Con qué le pegaron: 'grenade', 'rocket' o nada (bala o cañón).
    weapon: projectile.look ?? null,
    damage,
    rawDamage,
    damageType: projectile.damageType,
    armorClass: tower.armorClass,
    splash,
    blastRadius: splash ? 0 : projectile.blastRadius ?? 0,
    impactBlast: splash ? 0 : projectile.impactBlast ?? 0,
    position: { x: tower.wx, y: state.config.pathSurfaceY + state.config.worldScale * 0.24, z: tower.wz },
    color: 0xffa655,
    count: 3,
  });
  tower.hp = Math.max(0, tower.hp - damage);

  const hpRatio = tower.maxHp > 0 ? tower.hp / tower.maxHp : 0;
  if (!tower.destroyed && hpRatio <= COMBAT.towerDamagedThreshold && hpRatio > 0) {
    if (!tower.damageFxActive) {
      tower.damageFxActive = true;
      queueEffect(state, {
        type: 'tower-damaged-state',
        towerId: tower.id,
        active: true,
      });
    }
  }

  if (tower.hp <= COMBAT.towerDestroyedVfxHpFloor && !tower.destroyed) {
    tower.destroyed = true;
    tower.damageFxActive = false;
    tower.hasTarget = false;
    tower.targetEnemyId = null;
    tower.cooldown = 0;
    queueEffect(state, {
      type: 'tower-destroyed',
      towerId: tower.id,
      position: { x: tower.wx, y: state.config.pathSurfaceY + state.config.worldScale * 0.16, z: tower.wz },
      color: 0xff7733,
      count: 8,
    });
    const killer = state.enemies.find((enemy) => enemy.id === projectile.sourceId);
    if (killer) promoteEnemy(state, killer);
  }

  markUiDirty(state);
  markWorldDirty(state);
}

/**
 * El soldado desvía el disparo según su nivel de cobertura. Tras una roca, un árbol o un arbusto (nivel
 * 2 o más), lo recibe la cobertura según su blindaje; en el pasto (nivel 1) la bala se pierde.
 */
function deflectShot(state, projectile, target, coverLevel) {
  if (target.armorClass !== 'infantry' || coverLevel === 0) return false;
  const cover = target.coverId ? findCoverById(state, target.coverId) : null;
  if (coverLevel >= 2 && cover) {
    const chance = COVER[cover.kind].absorbChance + (coverLevel >= 3 ? INFANTRY_COMBAT.proneDeflectBonus : 0);
    return nextCombatRandom(state) < chance && hitCover(state, projectile, target, cover);
  }
  if (projectile.missile || nextCombatRandom(state) >= INFANTRY_COMBAT.grassDeflect) return false;
  queueEffect(state, { type: 'shot-deflected', towerId: projectile.sourceId, enemyId: target.id, position: { x: projectile.x, y: projectile.y, z: projectile.z } });
  return true;
}

/** La cobertura del soldado recibe el disparo según su blindaje. */
function hitCover(state, projectile, target, cover) {
  const rules = COVER[cover.kind];
  const damage = resolveDamage(projectile.damage, projectile.damageType, rules.armorClass, rules.armor);
  cover.hp -= damage;
  queueEffect(state, {
    type: 'cover-hit',
    projectileId: projectile.id,
    towerId: projectile.sourceId,
    enemyId: target.id,
    coverId: cover.id,
    kind: cover.kind,
    damage,
    rawDamage: projectile.damage,
    damageType: projectile.damageType,
    armorClass: rules.armorClass,
    impactBlast: projectile.impactBlast ?? 0,
    position: { x: projectile.x, y: projectile.y, z: projectile.z },
  });
  if (cover.hp <= 0) removeCover(state, cover, 0);
  markWorldDirty(state);
  return true;
}

/**
 * Cuánto cambia el daño según por dónde le pegan a un vehículo. `vx` y `vz` son hacia dónde viaja el
 * disparo: de frente viene contra su rumbo, y por atrás, a favor. Los costados no cambian.
 */
export function getFacingMultiplier(facing, rotation, vx, vz, damageType) {
  if (!facing) return 1;
  const travel = Math.hypot(vx, vz);
  if (travel === 0) return 1;
  const along = (vx * Math.sin(rotation) + vz * Math.cos(rotation)) / travel;
  if (along <= -COMBAT.facingArc) return facing.frontByMunition?.[damageType] ?? facing.front ?? 1;
  if (along >= COMBAT.facingArc) return facing.rear ?? 1;
  return 1;
}

/**
 * Un nivel por el pasto, otro por la roca, el árbol o el arbusto, y otro por estar cuerpo a tierra (de
 * rodilla no lo está), hasta 3. En la calle no hay pasto: ahí, sin nada más, queda expuesto.
 */
function getCoverLevel(soldier) {
  const prone = soldier.proneSeconds > 0 && !(soldier.kneelSeconds > 0);
  const levels = Number(!soldier.onRoad) + Number(Boolean(soldier.inCover)) + Number(prone);
  return Math.min(INFANTRY_COMBAT.coverDamage.length - 1, levels);
}

/** En la calle o el pasto, un disparo lo mata. Tras una cobertura, no mata de un disparo a quien está entero. */
function getSoldierDamage(soldier, coverLevel, damage) {
  const share = INFANTRY_COMBAT.coverDamage[coverLevel];
  if (share === null) return soldier.hp;
  const reduced = damage * share;
  return soldier.hp >= soldier.maxHp ? Math.min(reduced, soldier.hp - 1) : reduced;
}

/** Desde cierto nivel, el disparo a un soldado tira al suelo a toda su unidad. */
function throwUnitToGround(state, soldier) {
  const { fromLevel, seconds } = INFANTRY_COMBAT.prone;
  if (soldier.armorClass !== 'infantry' || soldier.veterancy < fromLevel) return;
  for (const member of state.enemies) {
    if (member === soldier || (soldier.teamId && member.teamId === soldier.teamId)) member.proneSeconds = seconds;
  }
}

function applyEnemyHit(state, projectile, target) {
  // El disparo se resuelve con la cobertura que tenía al llegar: el suelo protege del siguiente.
  const coverLevel = getCoverLevel(target);
  throwUnitToGround(state, target);
  if (deflectShot(state, projectile, target, coverLevel)) return;
  const { facing } = getEnemyDefinition(state, target.enemyTypeId);
  const resolved = getFacingMultiplier(facing, target.rotation, projectile.vx, projectile.vz, projectile.damageType) * resolveDamage(
    projectile.damage,
    projectile.damageType,
    target.armorClass ?? 'light',
    target.armor,
  );
  const damage = target.armorClass === 'infantry' ? getSoldierDamage(target, coverLevel, resolved) : resolved;
  target.hp -= damage;

  queueEffect(state, {
    type: 'hit',
    projectileId: projectile.id,
    towerId: projectile.sourceId,
    enemyId: target.id,
    enemyTypeId: target.enemyTypeId,
    damage,
    rawDamage: projectile.damage,
    damageType: projectile.damageType,
    armorClass: target.armorClass ?? 'light',
    // Tamaño de la explosión, para dibujarla.
    impactBlast: projectile.impactBlast ?? 0,
    inCover: Boolean(target.inCover),
    exposed: Boolean(target.exposed),
    position: { x: projectile.x, y: projectile.y, z: projectile.z },
    color: FX.hit.color,
    count: FX.hit.count,
  });

  if (target.hp <= 0) killEnemy(state, target, projectile.sourceId);
}

function killEnemy(state, target, towerId) {
  target.alive = false;
  const tower = state.towers.find((item) => item.id === towerId);
  if (tower) {
    tower.kills += 1;
  }
  state.credits += target.reward;
  markUiDirty(state);
  queueEffect(state, {
    type: 'enemy-killed',
    position: { ...target.position },
    color: FX.kill.color,
    count: FX.kill.count,
    enemyId: target.id,
    enemyTypeId: target.enemyTypeId,
    armorClass: target.armorClass ?? 'light',
    flying: target.flying,
    // Su largo en celdas: el render hace la explosión de ese tamaño.
    size: getEnemyDefinition(state, target.enemyTypeId).model.scale,
    // Cuánto lo retrasó el napalm en su vida (s).
    fireDelaySeconds: target.fireDelaySeconds ?? 0,
    reward: target.reward,
    towerId,
  });
  dismountCrew(state, target);
}

function removeCover(state, cover, cost) {
  const list = COVER_LIST_OF[cover.kind];
  state[list] = state[list].filter((item) => item !== cover);
  if (state.grid[cover.gy][cover.gx] === 4) state.grid[cover.gy][cover.gx] = 0;
  const { groundTileHeightWorld, worldScale } = state.config;
  const position = { x: cover.wx, y: groundTileHeightWorld + COVER[cover.kind].effectHeight * worldScale, z: cover.wz };
  queueEffect(state, { type: 'cover-removed', coverId: cover.id, kind: cover.kind, gx: cover.gx, gy: cover.gy, cost, position });
  markUiDirty(state);
  markWorldDirty(state);
}

/** Saca una roca o un árbol pagando: la celda queda libre para construir. También en plena oleada. */
export function clearCover(state, coverId) {
  const cover = findCoverById(state, coverId);
  const clearCost = cover && COVER[cover.kind].clearCost;
  if (!clearCost || state.credits < clearCost) return false;
  state.credits -= clearCost;
  removeCover(state, cover, clearCost);
  return true;
}

/** Quienes iban en un vehículo destruido siguen a pie desde ahí. */
function dismountCrew(state, vehicle) {
  const definition = getEnemyDefinition(state, vehicle.enemyTypeId);
  const veterancy = vehicle.veterancy ?? 0;
  const crew = vehicle.crew ?? definition.dismount ?? [];
  let index = 0;
  for (const team of splitIntoTeams(crew)) {
    joinTeam(state, squadAtLevel(team.length, veterancy), (soldier) => {
      // Bajan a los lados del vehículo, que mira hacia `rotation`, y ahí forman.
      const side = (index - (crew.length - 1) / 2) * SIM.dismountSpacing * state.config.worldScale;
      index += 1;
      soldier.position = {
        x: vehicle.position.x + Math.cos(vehicle.rotation) * side,
        y: vehicle.position.y,
        z: vehicle.position.z - Math.sin(vehicle.rotation) * side,
      };
      soldier.rotation = vehicle.rotation;
      soldier.proneSeconds = INFANTRY_COMBAT.prone.seconds;
      soldier.weaponCooldown = INF.dismountDelay;
      queueEffect(state, { type: 'enemy-dismounted', enemyId: soldier.id, enemyTypeId: soldier.enemyTypeId, fromEnemyId: vehicle.id });
    }, veterancy);
  }
  if (crew.length) markUiDirty(state);
}

export function applyCombatStep(state, dt) {
  for (const tower of state.towers) {
    if (tower.destroyed) continue;

    const definition = getTowerDefinition(state, tower);
    const stats = getTowerLevel(definition, tower.level);
    tower.cooldown = tickCooldown(tower.cooldown, dt);

    if (!tower.targetEnemyId) {
      // Sin blanco, vuelve a mirar por donde entra el enemigo.
      tower.aimAngle = rotateTurretToward(tower.aimAngle, getRestAngle(state, tower.wx, tower.wz), definition.combatModel.yawSpeed ?? Math.PI, dt);
      continue;
    }

    const enemy = state.enemies.find((item) => item.id === tower.targetEnemyId && item.alive);
    if (!enemy) {
      continue;
    }

    const aligned = aimTower(state, definition, tower, enemy, dt);
    if (aligned && tower.cooldown <= 0) {
      fireTowerProjectile(state, tower, enemy);
      if (stats.magazine) {
        // Cargador (LM-2): un tubo tras otro cada salvoInterval; vacío, recarga todos.
        tower.ammo = (tower.ammo ?? stats.magazine) - 1;
        if (tower.ammo > 0) {
          tower.cooldown += stats.salvoInterval;
        } else {
          tower.cooldown += stats.reload;
          tower.ammo = stats.magazine;
        }
      } else {
        tower.cooldown += 1 / stats.rate;
      }
    }
  }

  updateEnemyWeapons(state, dt);
  updateActiveDefenses(state, dt);

  updateFireZones(state, dt);

  for (const projectile of state.projectiles) {
    if (!projectile.alive) continue;
    if (projectile.targetType === 'ground') {
      updateArtilleryRocket(state, projectile, dt);
      continue;
    }
    if (projectile.dodged) {
      advanceProjectile(state, projectile, projectile.speed * dt);
      continue;
    }
    if (projectile.missile) {
      updateMissile(state, projectile, dt);
      continue;
    }

    // Blanco del proyectil: el centro de la altura del vehículo o de la torre, y el radio
    // dentro del cual cuenta como impacto.
    let target = null;
    let center = null;
    let hitDistance = projectile.hitThreshold;
    if (projectile.targetType === 'enemy') {
      target = state.enemies.find((item) => item.id === projectile.targetId && item.alive);
      if (target) {
        center = getEnemyAimPoint(state, target);
        hitDistance = Math.max(projectile.hitThreshold, target.hitRadius ?? 0);
      }
    } else if (projectile.targetType === 'tower') {
      target = state.towers.find((item) => item.id === projectile.targetId && !item.destroyed);
      if (target) center = getTowerAimPoint(state, target);
    }
    if (!target) {
      projectile.alive = false;
      queueProjectileBurst(state, projectile);
      continue;
    }

    const step = projectile.speed * dt;

    // El impacto se mide en todo el tramo que la bala recorre en este paso: medirlo solo en
    // el punto final deja pasar balas rápidas a través del blanco.
    const along = Math.max(0, Math.min(step,
      (center.x - projectile.x) * projectile.vx + (center.y - projectile.y) * projectile.vy + (center.z - projectile.z) * projectile.vz));
    const closest = {
      x: projectile.x + projectile.vx * along,
      y: projectile.y + projectile.vy * along,
      z: projectile.z + projectile.vz * along,
    };
    if (distance3d(closest, center) <= hitDistance) {
      Object.assign(projectile, closest);
      if (projectile.targetType === 'enemy' && target.flying && nextCombatRandom(state) >= getAirHitChance(state, projectile, target)) {
        if (projectile.flak) {
          // La espoleta estalla, pero lejos del blanco.
          burstFlak(state, projectile);
          projectile.alive = false;
        }
        projectile.dodged = true;
        queueEffect(state, { type: 'air-shot-missed', towerId: projectile.sourceId, enemyId: target.id, enemyTypeId: target.enemyTypeId });
        if (projectile.alive) advanceProjectile(state, projectile, step);
        continue;
      }
      if (projectile.flak) splashFlak(state, projectile, target);
      if (projectile.targetType === 'enemy') applyEnemyHit(state, projectile, target);
      else applyTowerHit(state, projectile, target);
      projectile.alive = false;
      continue;
    }

    advanceProjectile(state, projectile, step);
  }

  state.projectiles = state.projectiles.filter((item) => item.alive);
}

/** Lo chico cuesta más de acertar, si el arma tiene una puntería distinta para eso. */
function getAirHitChance(state, projectile, target) {
  const small = getEnemyDefinition(state, target.enemyTypeId).flight?.small;
  return small && projectile.smallAirHitChance !== null ? projectile.smallAirHitChance : projectile.airHitChance;
}

function burstFlak(state, projectile) {
  queueEffect(state, {
    type: 'flak-burst',
    position: { x: projectile.x, y: projectile.y, z: projectile.z },
    impactBlast: projectile.flak.blast * state.config.worldScale,
  });
}

/** La bala antiaérea estalla junto al blanco: también alcanza a los que vuelan cerca. */
function splashFlak(state, projectile, target) {
  const radius = projectile.flak.radius * state.config.worldScale;
  burstFlak(state, projectile);
  const near = state.enemies.filter((enemy) => enemy.alive && enemy.flying && enemy !== target
    && distance3d(enemy.position, projectile) <= radius);
  for (const enemy of near) {
    applyEnemyHit(state, { ...projectile, damage: projectile.damage * projectile.flak.share, impactBlast: 0 }, enemy);
  }
}

// Azar del combate: reproducible, porque vive en el estado (mismo generador que las oleadas).
function nextCombatRandom(state) {
  state.combatRandomSeed = (state.combatRandomSeed + 0x6d2b79f5) >>> 0;
  let t = state.combatRandomSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Al ver llegar el misil, quien puede esquivarlo tira una sola vez. Si lo logra, se hace a un lado
// (lo dibuja el render) y el misil pierde la guía, sigue derecho y estalla al tocar el suelo.
function tryDodgeMissile(state, projectile, enemy, center) {
  if (projectile.dodgeRolledFor === enemy.id) return false;
  const chance = getEnemyDefinition(state, enemy.enemyTypeId).combatModel.missileDodge;
  if (!chance || distance3d(projectile, center) > SIM.missileDodgeReach * state.config.worldScale) return false;
  projectile.dodgeRolledFor = enemy.id;
  if (nextCombatRandom(state) >= chance) return false;
  projectile.dodged = true;
  // Se abre hacia el lado contrario al del misil. Su derecha es la misma de dismountCrew.
  const toRight = (enemy.position.x - projectile.x) * Math.cos(enemy.rotation) - (enemy.position.z - projectile.z) * Math.sin(enemy.rotation);
  queueEffect(state, {
    type: 'enemy-dodged',
    enemyId: enemy.id,
    enemyTypeId: enemy.enemyTypeId,
    towerId: projectile.sourceId,
    side: toRight >= 0 ? 1 : -1,
  });
  return true;
}

// La bala que falla se pierde al pasar su alcance; el misil que falla estalla donde termina
// su vuelo o al tocar el suelo, para que se vea que erró.
/**
 * El misil vuela derecho, sin seguir a nadie. Le pega al primero que se cruce en su tramo: su blanco,
 * o cualquier vehículo. A un soldado que no era su blanco lo pasa de largo, y lo que vuela va más alto.
 * Choca con el cuerpo del vehículo, no con su centro: sin guía, si no, casi no le daría a nadie.
 */
function getMissileHitRadius(state, projectile, enemy) {
  const definition = getEnemyDefinition(state, enemy.enemyTypeId);
  const body = (getEnemyRig(state, enemy).hitRadius ?? 0) * definition.model.scale * state.config.worldScale * MISSILE_BODY_SHARE;
  return Math.max(projectile.hitThreshold, enemy.hitRadius ?? 0, body);
}

/** El vehículo con defensa activa cargada al que amenaza este misil o cohete, si ya está a su alcance. */
function findInterceptor(state, projectile) {
  const reach = VETERANCY.activeDefense.range * state.config.worldScale;
  for (const enemy of state.enemies) {
    if (!enemy.alive || !enemy.defenseCharges) continue;
    const center = getEnemyAimPoint(state, enemy);
    // El cohete cae en un punto: amenaza a quien esté en el radio de ese punto.
    if (projectile.targetType === 'ground') {
      const threatened = distance2d(projectile.to.x, projectile.to.z, enemy.position.x, enemy.position.z) <= projectile.impactRadius;
      if (threatened && distance3d(projectile, center) <= VETERANCY.activeDefense.rocketRange * state.config.worldScale) return { enemy, center };
      continue;
    }
    const along = (center.x - projectile.x) * projectile.vx + (center.y - projectile.y) * projectile.vy + (center.z - projectile.z) * projectile.vz;
    if (along < 0 || along > reach) continue;
    const closest = { x: projectile.x + projectile.vx * along, y: projectile.y + projectile.vy * along, z: projectile.z + projectile.vz * along };
    if (distance3d(closest, center) <= getMissileHitRadius(state, projectile, enemy)) return { enemy, center };
  }
  return null;
}

/** La defensa activa dispara: gasta una carga, y su interceptor alcanza al proyectil un instante después. */
function launchInterceptor(state, projectile, { enemy, center }) {
  const seconds = VETERANCY.activeDefense.interceptSeconds;
  enemy.defenseCharges -= 1;
  if (enemy.defenseReload <= 0) enemy.defenseReload = VETERANCY.activeDefense.cooldownSeconds;
  projectile.interceptSeconds = seconds;
  projectile.interceptedBy = enemy.id;
  const to = projectile.targetType === 'ground'
    ? getRocketPoint(projectile, Math.min(1, (projectile.elapsed + seconds) / projectile.flightSeconds))
    : {
      x: projectile.x + projectile.vx * projectile.speed * seconds,
      y: projectile.y + projectile.vy * projectile.speed * seconds,
      z: projectile.z + projectile.vz * projectile.speed * seconds,
    };
  queueEffect(state, { type: 'defense-fired', enemyId: enemy.id, launcher: enemy.defenseCharges, from: center, to, seconds });
}

/** El interceptor llegó: el proyectil estalla en el aire, sin hacer daño. */
function detonateIntercepted(state, projectile) {
  projectile.alive = false;
  queueEffect(state, {
    type: 'missile-intercepted',
    towerId: projectile.sourceId,
    enemyId: projectile.interceptedBy,
    position: { x: projectile.x, y: projectile.y, z: projectile.z },
  });
}

/** Las cargas vuelven de a una. */
function updateActiveDefenses(state, dt) {
  for (const enemy of state.enemies) {
    if (!enemy.alive || !enemy.activeDefense || enemy.defenseReload <= 0) continue;
    enemy.defenseReload -= dt;
    if (enemy.defenseReload > 0) continue;
    enemy.defenseCharges += 1;
    if (enemy.defenseCharges < enemy.activeDefense.charges) enemy.defenseReload += VETERANCY.activeDefense.cooldownSeconds;
    else enemy.defenseReload = 0;
  }
}

function updateMissile(state, projectile, dt) {
  const step = projectile.speed * dt;
  if (projectile.interceptSeconds === undefined) {
    const interceptor = findInterceptor(state, projectile);
    if (interceptor) launchInterceptor(state, projectile, interceptor);
  }
  if (projectile.interceptSeconds !== undefined) {
    projectile.interceptSeconds -= dt;
    if (projectile.interceptSeconds <= 0) detonateIntercepted(state, projectile);
    else advanceProjectile(state, projectile, step);
    return;
  }
  let first = null;
  let firstAlong = Infinity;
  let firstCenter = null;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.flying) continue;
    if (enemy.offRoad && enemy.id !== projectile.targetId) continue;
    const center = getEnemyAimPoint(state, enemy);
    const along = Math.max(0, Math.min(step,
      (center.x - projectile.x) * projectile.vx + (center.y - projectile.y) * projectile.vy + (center.z - projectile.z) * projectile.vz));
    const closest = {
      x: projectile.x + projectile.vx * along,
      y: projectile.y + projectile.vy * along,
      z: projectile.z + projectile.vz * along,
    };
    if (along < firstAlong && distance3d(closest, center) <= getMissileHitRadius(state, projectile, enemy)) {
      first = enemy;
      firstAlong = along;
      firstCenter = center;
    }
  }
  if (!first || tryDodgeMissile(state, projectile, first, firstCenter)) {
    advanceProjectile(state, projectile, step);
    return;
  }
  projectile.x += projectile.vx * firstAlong;
  projectile.y += projectile.vy * firstAlong;
  projectile.z += projectile.vz * firstAlong;
  projectile.alive = false;
  applyEnemyHit(state, projectile, first);
}

function advanceProjectile(state, projectile, step) {
  projectile.x += projectile.vx * step;
  projectile.y += projectile.vy * step;
  projectile.z += projectile.vz * step;
  projectile.traveled = (projectile.traveled ?? 0) + step;
  const spent = projectile.maxDistance && projectile.traveled > projectile.maxDistance;
  const grounded = projectile.missile && projectile.y <= state.config.pathSurfaceY;
  if (!spent && !grounded) return;
  projectile.alive = false;
  if (projectile.missile) {
    queueEffect(state, {
      type: 'missile-missed',
      towerId: projectile.sourceId,
      enemyId: projectile.targetId,
      position: { x: projectile.x, y: Math.max(projectile.y, state.config.pathSurfaceY), z: projectile.z },
    });
  } else {
    queueProjectileBurst(state, projectile);
  }
}

// Un cohete sin blanco o al final de su vuelo estalla en el aire, en vez de desaparecer.
function queueProjectileBurst(state, projectile) {
  if (!projectile.impactBlast) return;
  queueEffect(state, {
    type: 'projectile-burst',
    impactBlast: projectile.impactBlast,
    position: { x: projectile.x, y: projectile.y, z: projectile.z },
  });
}

export function tickSimulation(state, dt) {
  const clampedDt = Math.min(dt, SIM.maxDeltaTime);

  if (state.gameOver) {
    return {
      uiChanged: state.uiDirty,
      worldChanged: state.worldDirty,
    };
  }

  if (state.spawnQueue.length > 0) {
    state.spawnTimer -= clampedDt;
    for (const enemyTypeId of Object.keys(state.spawnGaps)) state.spawnGaps[enemyTypeId] -= clampedDt;
    // Sale el primero de la fila que ya tenga espacio; si un tanque debe esperar, pasan otros.
    const isVehicle = (enemyTypeId) => {
      const definition = state.config.enemyDefinitions[enemyTypeId];
      return definition?.armorClass !== 'infantry' && !definition?.flight;
    };
    const nextIndex = state.spawnTimer <= 0
      ? state.spawnQueue.findIndex((enemyTypeId) => !(state.spawnGaps[enemyTypeId] > 0) && !(isVehicle(enemyTypeId) && state.spawnGaps.anyVehicle > 0))
      : -1;
    if (nextIndex >= 0) {
      const [enemyTypeId] = state.spawnQueue.splice(nextIndex, 1);
      const { infantryTeams, interval, squad } = state.activeWaveDefinition;
      const spawnedBefore = state.spawnedThisWave;
      const isSoldier = state.config.enemyDefinitions[enemyTypeId]?.armorClass === 'infantry';
      if (infantryTeams && isSoldier) {
        const size = takeTeamFromQueue(state);
        spawnTeam(state, size);
        state.spawnedThisWave += size;
      } else {
        const spawned = spawnEnemy(state, enemyTypeId);
        const gap = state.config.enemyDefinitions[enemyTypeId]?.spawnGapSeconds;
        if (gap) state.spawnGaps[enemyTypeId] = gap;
        if (squad && isVehicle(enemyTypeId)) {
          state.spawnGaps.anyVehicle = squad.vehicleGap;
          spawned.lane = state.nextLane * squad.laneOffset;
          state.nextLane = -state.nextLane;
        }
        state.spawnedThisWave += 1;
      }
      if (state.spawnQueue.length > 0) {
        const spawnedDefinition = state.config.enemyDefinitions[enemyTypeId];
        // Una escuadra puede cruzar el fin de un grupo: sale entera.
        const squadEnded = squad && Math.floor(spawnedBefore / squad.size) !== Math.floor(state.spawnedThisWave / squad.size);
        // El ritmo es por soldado: tras una escuadra de 3, tres veces la espera de uno.
        const spawnedCount = state.spawnedThisWave - spawnedBefore;
        state.spawnTimer = squadEnded ? squad.pause : (spawnedDefinition?.spawnIntervalSeconds ?? interval) * spawnedCount;
      } else {
        state.spawnTimer = SIM.finalEnemySpacing;
      }
    }
  }

  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    updateEnemyMovement(state, enemy, clampedDt);
  }

  state.enemies = state.enemies.filter((item) => item.alive);
  selectTargets(state);
  applyCombatStep(state, clampedDt);

  if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.length === 0) {
    state.waveActive = false;
    state.activeWaveDefinition = null;
    state.fireZones = [];
    state.waveCountdown = GAMEPLAY_CONFIG.waves.countdown.betweenSeconds;
    reviveTowersAfterWave(state);
    queueEffect(state, { type: 'wave-ended', wave: state.wave, lives: state.lives, credits: state.credits });
    markUiDirty(state);

    if (state.wave >= state.config.waveSet.waves.length && state.lives > 0) {
      state.gameOver = true;
      state.victory = true;
      state.overlay = {
        visible: true,
        title: OVR.victory.title,
        text: `Base defendida en las ${state.wave} oleadas, con ${state.lives} vidas y $${state.credits} de sobra.`,
        color: OVR.victory.color,
      };
      queueEffect(state, { type: 'game-ended', victory: true, wave: state.wave, lives: state.lives, credits: state.credits });
      markUiDirty(state);
    }
  }

  return {
    uiChanged: state.uiDirty,
    worldChanged: state.worldDirty,
  };
}
