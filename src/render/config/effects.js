export const EFFECTS_CONFIG = {
  projectile: {
    sphere: { radius: 0.024, segments: 6, color: 0xffee44 },
    trail: {
      topRadius: 0.008,
      bottomRadius: 0.003,
      height: 0.08,
      color: 0xffaa22,
      opacity: 0.5,
      zOffset: -0.04,
    },
  },
  // Trazadora enemiga: más grande y con estela larga, para que se vea de dónde viene el fuego.
  enemyProjectile: {
    sphereColor: 0xff5a2a,
    sphereRadius: 0.04,
    trailColor: 0xff2a10,
    trailTopRadius: 0.018,
    trailBottomRadius: 0.004,
    trailHeight: 0.34,
    trailOpacity: 0.8,
  },

  // Misil guiado de la LM-2 (spec 002): cuerpo oliva, motor encendido y estela de humo.
  missile: {
    bodyLength: 0.1,
    bodyRadius: 0.014,
    bodyColor: 0x5d6236,
    noseColor: 0x2e3238,
    flameRadius: 0.018,
    flameColor: 0xffc266,
    trailSpacing: 0.045,
    trailPuff: { radius: 0.022, segments: 6, color: 0xd9d4c8, opacity: 0.55, lifetime: 0.9, upwardSpeed: 0.04, growthRate: 1.6 },
  },
  missileLaunch: {
    flashRadius: 0.05,
    flashColor: 0xffd28a,
    flashLifetime: 0.09,
    backBlastPuffs: 4,
    backBlastSpeed: 0.5,
    puff: { radius: 0.04, segments: 7, color: 0xcfc8b8, opacity: 0.6, lifetime: 0.8, upwardSpeed: 0.05, growthRate: 1.8 },
  },
  // Cohete del soldado con RPG: tubo oscuro, ojiva arena en rombo y estela de humo.
  rocket: {
    bodyLength: 0.1,
    bodyRadius: 0.012,
    bodyColor: 0x2e3238,
    noseRadius: 0.026,
    noseLength: 0.05,
    noseBackLength: 0.035,
    noseColor: 0xa59172,
    flameRadius: 0.02,
    flameColor: 0xffb04d,
    trailSpacing: 0.05,
    trailPuff: { radius: 0.02, segments: 6, color: 0xd9d4c8, opacity: 0.6, lifetime: 0.7, upwardSpeed: 0.04, growthRate: 1.6 },
  },
  // El chorro de humo sale por detrás del lanzador, a `backOffset` celdas de la boca.
  rocketLaunch: {
    flashRadius: 0.035,
    flashColor: 0xffd28a,
    flashLifetime: 0.08,
    backOffset: 0.26,
    backBlastPuffs: 3,
    backBlastSpeed: 0.35,
    puff: { radius: 0.024, segments: 6, color: 0xcfc8b8, opacity: 0.6, lifetime: 0.6, upwardSpeed: 0.05, growthRate: 1.8 },
  },
  // Explosión del misil: bola de fuego opaca, que se ve sobre cualquier fondo, más humo y
  // tierra. Cada arma dice su tamaño; `sizePerRadius` es el de la imagen animada respecto de él.
  missileBlast: {
    sizePerRadius: 2.2,
    fireball: { startRadius: 0.5, color: 0xff7a1e, opacity: 0.95, lifetime: 0.42, growthRate: 2.4 },
    core: { startRadius: 0.28, color: 0xfff0b0, opacity: 1, lifetime: 0.26, growthRate: 3 },
    dirtColor: 0x4a4238,
    dirtCount: 10,
  },
  // Impacto de un misil o de un cohete: explosión chica, porque no hace daño de área. Estalla
  // dentro del blanco, así que se dibuja encima (`overlay`): si no, el modelo la tapa.
  impactBlast: {
    overlay: true,
    dirtColor: 0x4a4238,
    dirtCount: 4,
    smokeRadius: 0.06,
  },
  // Al sacar una roca: polvo y pedazos.
  rockBurst: {
    color: 0x777766,
    count: 14,
    pieceScale: 2.6,
    dust: { radius: 0.16, segments: 8, color: 0xa59c8a, opacity: 0.6, lifetime: 0.9, upwardSpeed: 0.18, growthRate: 2 },
  },
  // Al caer un árbol: polvo y hojas.
  treeBurst: {
    color: 0x2f7a36,
    count: 16,
    pieceScale: 2.2,
    dust: { radius: 0.16, segments: 8, color: 0x8d8a5e, opacity: 0.5, lifetime: 0.9, upwardSpeed: 0.18, growthRate: 2 },
  },
  bushBurst: {
    color: 0x618f35,
    count: 10,
    pieceScale: 1.6,
    dust: { radius: 0.1, segments: 8, color: 0x8d8a5e, opacity: 0.35, lifetime: 0.6, upwardSpeed: 0.14, growthRate: 2 },
  },
  // Un disparo que le pega a la cobertura: unos pedazos del color de cada una.
  coverHit: { count: 2, pieceScale: 1 },
  // Motor recalentado al pasar por el fuego.
  engineOverheat: { radius: 0.16, segments: 8, color: 0xe8e4dc, opacity: 0.55, lifetime: 0.9, upwardSpeed: 0.3, growthRate: 2 },
  // Cañonazo HE del tanque en una torre.
  tankShellBlast: {
    sizeRatio: 0.6,
    dirtColor: 0x4a4238,
    dirtCount: 8,
  },
  // Misil que no le dio a nada: estalla donde termina su vuelo, más chico que un impacto.
  missileMiss: {
    radius: 0.16,
    dirtColor: 0x8a7a5c,
    dirtCount: 3,
    smokeRadius: 0.05,
  },

  muzzleFlash: {
    forwardOffset: 0.018,
    radius: 0.02,
    segments: 4,
    color: 0xffffaa,
    lifetime: 0.035,
  },
  enemyMuzzleFlash: {
    forwardOffset: 0.028,
    radius: 0.048,
    segments: 8,
    color: 0xff6c4d,
    lifetime: 0.085,
  },

  hitSpark: {
    radius: 0.028,
    segments: 6,
    color: 0xffdd77,
    opacity: 0.82,
    lifetime: 0.08,
    growthRate: 18,
  },
  towerHitSpark: {
    radius: 0.03,
    segments: 8,
    color: 0xffa35c,
    opacity: 0.86,
    lifetime: 0.1,
    growthRate: 14,
  },

  explosionFlipbook: {
    atlasUrl: null,
    tilesX: 4,
    tilesY: 4,
    frameCount: 16,
    fps: 26,
    size: 0.52,
    opacity: 0.95,
    yOffset: 0.11,
    lifetime: 0.62,
    blending: 'additive',
  },

  fireFlipbook: {
    atlasUrl: null,
    tilesX: 4,
    tilesY: 4,
    frameCount: 16,
    fps: 18,
    size: 0.34,
    opacity: 0.72,
    yOffset: 0.09,
    lifetime: 1.05,
    blending: 'normal',
  },

  smokeBurst: {
    radius: 0.14,
    segments: 8,
    color: 0x59616d,
    opacity: 0.58,
    lifetime: 0.72,
    growthRate: 2.2,
    opacityMultiplier: 0.62,
    upwardSpeed: 0.24,
    yOffset: 0.12,
  },

  smokeTrail: {
    puffCount: 3,
    radius: 0.09,
    segments: 8,
    color: 0x3f464f,
    opacity: 0.42,
    lifetimeMin: 0.65,
    lifetimeRange: 0.35,
    riseSpeed: 0.3,
    driftSpeed: 0.08,
    growthRate: 1.7,
    spread: 0.12,
  },

  // La granada de un soldado: su tamaño, su color y cuánto sube en el arco (celdas).
  grenade: { radius: 0.035, color: 0x2f3a28, arc: 0.55 },
  // La defensa activa del tanque: el interceptor con su estela, que se apaga en `trailFade` segundos, y
  // el estallido en el aire. Tamaños en celdas.
  interception: {
    dart: { length: 0.16, width: 0.05, color: 0xfff6c8 },
    trail: { radius: 0.022, color: 0xfff2b0, fade: 0.3 },
    launchSmoke: { radius: 0.09, lifetime: 0.35 },
    flash: { radius: 0.2, color: 0xffffff, lifetime: 0.14, growthRate: 9 },
    blastRadius: 0.32,
  },
  rewardFloatText: {
    // Los soldados son muchos y chicos: su texto va más chico.
    soldierShare: 0.85,
    durationMin: 1.2,
    durationRange: 0.6,
    riseSpeed: 0.34,
    driftSpeed: 0.1,
    startYOffset: 0.28,
    fontSize: 80,
    width: 512,
    height: 256,
    scale: 0.42,
    scalePulse: 0.12,
    opacity: 0.98,
    fillStyle: '#7DFF4F',
    glowStyle: '#39FF14',
    strokeStyle: '#103a0c',
    strokeWidth: 12,
    fontFamily: "'Segoe UI', sans-serif",
  },

  towerDestroyedBurst: {
    radius: 0.16,
    segments: 12,
    color: 0xff7b39,
    opacity: 0.9,
    yOffset: 0.12,
    lifetime: 0.22,
    growthRate: 8.5,
  },

  // Un vehículo o un dron destruido: explosión del tamaño del vehículo (largo en celdas, con un mínimo
  // para que la moto y los drones se vean), humo y esquirlas de metal que giran y caen.
  vehicleDeath: {
    minSize: 0.8,
    blastPerSize: 0.55,
    smokeRadiusPerSize: 0.13,
    // Los restos en llamas quedan a esta altura (parte del largo) sobre el suelo.
    lift: 0.15,
    debris: {
      colors: [0x2e3238, 0x5f666f, 0x7d6b50],
      perSize: 9,
      sizeMin: 0.035,
      sizeRange: 0.05,
      lifetimeMin: 0.8,
      lifetimeRange: 0.5,
      horizontal: 2.4,
      verticalMin: 2,
      verticalRange: 3,
      spin: 9,
    },
  },
  debris: {
    sizeMin: 0.015,
    sizeRange: 0.02,
    lifetimeMin: 0.25,
    lifetimeRange: 0.15,
    velocity: { horizontal: 3, verticalMin: 1.5, verticalRange: 3 },
    gravity: 12,
    opacityLifetime: 0.35,
  },
};
