import { MUNITION_CLASSES } from './vehicle-combat.js';

// Plantel según los roles de blindaje (spec 002): ligeros con ruedas (las patrullas), el
// blindado 8x8 medio y el tanque pesado con orugas. Cada tipo nombra su rig
// (src/content/rigs/), que ya viene orientado y con la torreta en su lugar, y su largo en
// celdas del mapa (el modelo mide 1). Render los usa para dibujar y el núcleo para saber de
// dónde sale cada bala.

function createVehicleDefinition({
  id,
  displayName,
  armorClass,
  locomotion = 'wheels',
  hp,
  armor,
  speed,
  reward,
  threatTier,
  damageType,
  role,
  weaponProfile = null,
  hitRadius = null,
  spawnGapSeconds = 0,
  rig,
  wreck = null,
  scale,
  dismount = [],
  missileDodge = 0,
  flight = null,
  facing = null,
  veteranLevels = [],
}) {
  return {
    id,
    displayName,
    armorClass,
    // Ruedas u orugas: el audio elige con esto el sonido de rodado.
    locomotion,
    // Tiempo mínimo entre dos vehículos de este tipo al entrar: los pesados no van en fila india.
    spawnGapSeconds,
    // Quienes bajan al destruirse, en orden.
    dismount,
    // Si vuela: altura en celdas, a qué va, y lo que hace al llegar.
    flight,
    // Blindaje según por dónde le pegan: multiplica el daño de frente y por atrás.
    facing,
    // Lo que cambia en cada nivel de veteranía, además de su rango: modelo, arma y tripulación.
    veteranLevels,
    // Su tripulación comparte su veteranía: bajan como un pelotón veterano.
    stats: {
      hp,
      armor,
      speed,
      reward,
    },
    tags: {
      threatTier,
      role,
    },
    combatModel: {
      damageType,
      weaponProfile: weaponProfile ? { firingArc: Math.PI * 2, ...weaponProfile } : null,
      isArmed: Boolean(weaponProfile),
      hitRadius,
      // Probabilidad de esquivar cada misil guiado que le llega.
      missileDodge,
    },
    model: {
      rig,
      // Modelo de los restos, si no son el mismo vehículo quemado.
      wreck,
      scale,
    },
  };
}

const MOTO_MISSILE = {
  damage: 26,
  range: 3.2,
  projectile: 'rocket',
  projectileSpeed: 5,
  hitThreshold: 0.2,
  impactBlast: 0.18,
  sound: 'rocket',
  damageType: MUNITION_CLASSES.heavyBallistic,
  yawSpeed: Math.PI * 2,
  armorPierce: 6,
};
const PATROL_MISSILE = {
  damage: 18,
  range: 3.4,
  projectile: 'rocket',
  projectileSpeed: 6,
  hitThreshold: 0.2,
  impactBlast: 0.18,
  sound: 'rocket',
  damageType: MUNITION_CLASSES.heavyBallistic,
  yawSpeed: Math.PI,
};
// Una unidad son 3 soldados. Quiénes llevan misil lo decide su nivel, al bajar.
const SQUAD = Array(3).fill('infantry-mg');
const TRUCK_CREW = [...SQUAD, ...SQUAD];
const TRUCK_SPEED = 1.35;

export const vehicleEnemyDefinitions = {
  // Drones. Salen de la niebla y vuelan derecho: el FPV a la torre más cercana, donde estalla; el
  // el de ala delta a la base. Solo les dispara lo que puede apuntar hacia arriba (`combatModel.targets`).
  'dron-fpv': createVehicleDefinition({
    id: 'dron-fpv',
    displayName: 'Dron FPV',
    armorClass: 'light',
    locomotion: 'air',
    hp: 12,
    armor: 0,
    speed: 2.6,
    reward: 7,
    threatTier: 2,
    damageType: MUNITION_CLASSES.heavyBallistic,
    role: 'ataque a torres',
    rig: 'dron-fpv',
    scale: 0.32,
    // Le rompe un nivel de blindaje a la torre; si ya no tiene, le quita `hpShare` de su vida total.
    // Es chico: una ametralladora normal casi nunca le acierta.
    flight: { height: 0.55, target: 'tower', small: true, breaksArmor: true, hpShare: 0.5, impactBlast: 0.25, lives: 1 },
  }),
  'dron-ala': createVehicleDefinition({
    id: 'dron-ala',
    displayName: 'Dron de ala delta',
    armorClass: 'light',
    locomotion: 'air',
    hp: 75,
    armor: 1,
    speed: 1.3,
    reward: 30,
    threatTier: 3,
    damageType: MUNITION_CLASSES.heavyBallistic,
    role: 'ataque a la torre más cara',
    rig: 'dron-ala',
    scale: 0.7,
    // Busca la torre en la que más se invirtió y estalla sobre ella: `hpShare` de la vida total en
    // el centro, que baja hasta `edgeShare` en el borde de `blastRadius` celdas.
    flight: { height: 0.95, target: 'priciest', hpShare: 0.6, edgeShare: 0.2, blastRadius: 1.8, impactBlast: 1.8, lives: 3 },
  }),
  'moto-recon': createVehicleDefinition({
    id: 'moto-recon',
    displayName: 'Moto de exploración',
    armorClass: 'light',
    hp: 26,
    armor: 1,
    speed: 3.1,
    reward: 6,
    threatTier: 1,
    damageType: MUNITION_CLASSES.lightBallistic,
    role: 'exploradora',
    rig: 'moto-recon',
    wreck: 'moto-recon-destruida',
    scale: 0.62,
    // Una unidad a la que le falta un soldado.
    dismount: SQUAD.slice(1),
    missileDodge: 0.8,
    // El pasajero: dispara con fusil, con un misil y con dos.
    veteranLevels: [
      null,
      {
        rig: 'moto-recon-n1',
        weaponProfile: { damage: 6, rate: 1.6, range: 2.8, projectileSpeed: 14, hitThreshold: 0.18, damageType: MUNITION_CLASSES.lightBallistic, yawSpeed: Math.PI * 3 },
      },
      {
        rig: 'moto-recon-n2',
        weaponProfile: { ...MOTO_MISSILE, rate: 0.3 },
      },
      {
        rig: 'moto-recon-n3',
        weaponProfile: { ...MOTO_MISSILE, rate: 0.6 },
      },
    ],
  }),
  // Infantería (a pie): abre las primeras oleadas y baja de las motos destruidas.
  // Camión de tropas: sin armas ni blindaje, pero al destruirlo baja mucha gente.
  'truck-transport': createVehicleDefinition({
    id: 'truck-transport',
    displayName: 'Camión de tropas',
    armorClass: 'light',
    hp: 130,
    armor: 3,
    speed: TRUCK_SPEED,
    reward: 10,
    threatTier: 2,
    damageType: MUNITION_CLASSES.lightBallistic,
    role: 'transporte',
    rig: 'camion-tropas',
    wreck: 'camion-tropas-destruido',
    scale: 1.12,
    dismount: TRUCK_CREW,
    // Con veteranía va más rápido, y desde el nivel 2 lleva más gente.
    veteranLevels: [
      null,
      { stats: { speed: TRUCK_SPEED * 1.15 } },
      { stats: { speed: TRUCK_SPEED * 1.3 }, dismount: [...TRUCK_CREW, ...SQUAD] },
      { stats: { speed: TRUCK_SPEED * 1.45 }, dismount: [...TRUCK_CREW, ...SQUAD, ...SQUAD] },
    ],
  }),
  'infantry-mg': createVehicleDefinition({
    id: 'infantry-mg',
    displayName: 'Soldado con ametralladora',
    armorClass: 'infantry',
    locomotion: 'foot',
    hp: 14,
    armor: 0,
    speed: 0.75,
    reward: 5,
    threatTier: 1,
    damageType: MUNITION_CLASSES.lightBallistic,
    role: 'infantería',
    rig: 'infanteria-ametralladora',
    scale: 0.119,
    weaponProfile: {
      damage: 5,
      rate: 1.8,
      range: 2.6,
      projectileSpeed: 14,
      hitThreshold: 0.18,
      damageType: MUNITION_CLASSES.lightBallistic,
      yawSpeed: Math.PI * 2,
      // Le dispara a una roca que tiene al lado: el arma baja mucho más que la de un vehículo.
      elevationLimits: { min: -1, max: 0.72 },
    },
  }),
  'infantry-rpg': createVehicleDefinition({
    id: 'infantry-rpg',
    displayName: 'Soldado con RPG',
    armorClass: 'infantry',
    locomotion: 'foot',
    hp: 14,
    armor: 0,
    speed: 0.6,
    reward: 8,
    threatTier: 1,
    damageType: MUNITION_CLASSES.heavyBallistic,
    role: 'infantería antiblindaje',
    rig: 'infanteria-rpg',
    scale: 0.119,
    weaponProfile: {
      damage: 40,
      rate: 0.25,
      range: 3.2,
      // Cohete, lento para que se vea volar. Su explosión es solo visual: daña únicamente a su blanco.
      projectile: 'rocket',
      projectileSpeed: 4.5,
      hitThreshold: 0.2,
      impactBlast: 0.22,
      sound: 'rocket',
      kneels: true,
      damageType: MUNITION_CLASSES.heavyBallistic,
      yawSpeed: Math.PI * 1.5,
      elevationLimits: { min: -1, max: 0.72 },
    },
  }),
  // La patrulla: lo que lleva en el techo es su veteranía. Sin arma, ametralladora, un misil y dos misiles.
  patrulla: createVehicleDefinition({
    id: 'patrulla',
    displayName: 'Patrulla',
    armorClass: 'light',
    locomotion: 'wheels',
    hp: 46,
    armor: 2,
    speed: 1.9,
    reward: 11,
    threatTier: 1,
    damageType: MUNITION_CLASSES.lightBallistic,
    role: 'patrulla',
    rig: 'patrulla',
    scale: 1,
    veteranLevels: [
      null,
      {
        rig: 'patrulla-ametralladora',
        stats: { hp: 58, armor: 3, speed: 1.75, reward: 13 },
        weaponProfile: { damage: 5.2, rate: 1.55, range: 3.2, projectileSpeed: 14, hitThreshold: 0.18, damageType: MUNITION_CLASSES.lightBallistic, yawSpeed: Math.PI * 1.5 },
      },
      {
        rig: 'patrulla-misil',
        stats: { hp: 75, armor: 3, speed: 1.55, reward: 15 },
        weaponProfile: { ...PATROL_MISSILE, rate: 0.5, armorPierce: 6 },
      },
      {
        rig: 'patrulla-misiles',
        stats: { hp: 92, armor: 4, speed: 1.4, reward: 18 },
        weaponProfile: { ...PATROL_MISSILE, rate: 1, armorPierce: 10 },
      },
    ],
  }),
  // Blindado 8x8 (clase media): las ametralladoras de los primeros niveles casi no le hacen nada.
  'apc-8x8': createVehicleDefinition({
    id: 'apc-8x8',
    displayName: 'Blindado 8x8',
    armorClass: 'medium',
    locomotion: 'wheels',
    hp: 300,
    armor: 6,
    speed: 1.0,
    reward: 24,
    threatTier: 2,
    damageType: MUNITION_CLASSES.heavyBallistic,
    role: 'transporte blindado',
    rig: 'apc-8x8',
    scale: 1.2,
    weaponProfile: {
      damage: 10,
      rate: 1.0,
      range: 3.4,
      projectileSpeed: 13,
      hitThreshold: 0.2,
      damageType: MUNITION_CLASSES.heavyBallistic,
      yawSpeed: Math.PI, // 180°/s: torreta de cañón automático
    },
    // Sin veteranía no lleva a nadie. Después es como un camión, con menos gente.
    veteranLevels: [null, { dismount: SQUAD }, { dismount: [...SQUAD, ...SQUAD] }, { dismount: [...SQUAD, ...SQUAD, ...SQUAD] }],
    // Blindaje medio: de frente, las armas ligeras casi no le hacen nada.
    facing: { frontByMunition: { [MUNITION_CLASSES.lightBallistic]: 0.2 } },
  }),
  // Tanque (clase pesada): el más lento, con más vida y blindaje; la MG-7 casi no le hace daño.
  'tank-heavy': createVehicleDefinition({
    id: 'tank-heavy',
    displayName: 'Tanque pesado',
    armorClass: 'heavy',
    locomotion: 'tracks',
    hp: 750,
    armor: 12,
    speed: 0.8,
    reward: 40,
    threatTier: 3,
    damageType: MUNITION_CLASSES.piercing,
    role: 'tanque',
    spawnGapSeconds: 4.5,
    facing: { front: 0.4, rear: 1.5 },
    // Defensa activa: intercepta misiles antes de que lleguen, una carga por misil.
    veteranLevels: [null, { activeDefense: { charges: 1 } }, { activeDefense: { charges: 2 } }, { activeDefense: { charges: 3 } }],
    rig: 'tank-heavy',
    scale: 1.3,
    weaponProfile: {
      damage: 60,
      rate: 0.35,
      range: 4,
      projectileSpeed: 12,
      hitThreshold: 0.24,
      damageType: MUNITION_CLASSES.piercing,
      // Munición HE contra estructuras: la onda alcanza a las torres de alrededor.
      blast: { radius: 1.5, fraction: 0.5 },
      sound: 'cannon',
      yawSpeed: Math.PI * 0.5, // 90°/s: torreta pesada
      // El cañón baja 10° y sube 20°: lo que queda pegado al tanque está en su ángulo muerto.
      elevationLimits: { min: -0.17, max: 0.35 },
    },
  }),
};

