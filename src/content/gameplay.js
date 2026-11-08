// Desde la oleada 11 llegan en grupos grandes, con una pausa corta entre ellos.
const LATE_WAVE_SQUADS = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 11, { size: 40, pause: 3 }]));

export const GAMEPLAY_CONFIG = {
  worldScaleDefault: 10,

  simulation: {
    // Paso fijo del bucle (s) y tope de pasos por cuadro: bajo unos 12 fps, la partida va más lenta.
    fixedStep: 1 / 60,
    maxStepsPerFrame: 5,
    maxDeltaTime: 0.05,
    enemyRotationLerp: 8,
    dismountSpacing: 0.26,
    // A qué distancia del misil (celdas) reacciona quien puede esquivarlo.
    missileDodgeReach: 1,
    // Infantería a campo traviesa (celdas): a qué distancia llega a la base, de una torre se
    // detiene (por fuera de la fortificación) y de otro soldado se abre, a qué fracción de su
    // velocidad, y qué tan rápido sube o baja el borde del camino.
    // `dismountDelay`: segundos que tarda en poder disparar quien baja de un vehículo destruido.
    infantry: { baseReach: 0.45, towerContact: 0.62, spacing: 0.24, spreadSpeed: 0.8, groundLerp: 10, dismountDelay: 1.25 },
    // Cada nivel de ataque le suma a la torre esta parte de su vida base.
    towerHpPerLevel: 0.25,
    // Elevación del cañón de la torre sin blanco (positiva hacia arriba) y sus límites.
    towerRestElevation: -0.08,
    defaultElevationLimits: { min: -0.5, max: 0.72 },
    // Máximo entre el cañón de un vehículo y la línea de su boca al blanco para disparar (rad, 8°).
    maxMuzzleAimError: 0.14,
    initialSpawnDelay: 0.4,
    finalEnemySpacing: 0.5,
    // Tope de torres en el mapa (las destruidas cuentan): `base` más `perWave` por cada oleada,
    // contando la que se prepara, hasta `max`. Llenar el mapa de torres básicas no debe ganar, y
    // cada torre cuesta rendimiento en el teléfono. Las partidas de referencia nunca pasan de 16.
    towerLimit: { base: 4, perWave: 1, max: 20 },
  },

  effects: {
    hit: { color: 0xffcc22, count: 3 },
    kill: { color: 0xff4400, count: 6 },
  },

  overlays: {
    gameOver: { title: 'Derrota', color: '#EF4444' },
    victory: { title: '¡Victoria!', color: '#22C55E' },
    defaultColor: '#F8FAFC',
  },

  // Veteranía de los vehículos: cada nivel trae una capacidad nueva, no más vida ni más daño sin motivo
  // (ver cada vehículo en su catálogo). `odds`: desde qué oleada y con qué probabilidad sale cada nivel.
  veterancy: {
    // Los vehículos: el nivel 2 en adelante, recién después de la oleada 13.
    odds: [
      { fromWave: 1, chances: [1, 0, 0, 0] },
      { fromWave: 8, chances: [0.8, 0.2, 0, 0] },
      { fromWave: 11, chances: [0.6, 0.4, 0, 0] },
      { fromWave: 14, chances: [0.35, 0.4, 0.2, 0.05] },
      { fromWave: 16, chances: [0.1, 0.4, 0.35, 0.15] },
      { fromWave: 18, chances: [0, 0.3, 0.4, 0.3] },
    ],
    // Las unidades de soldados: son las primeras veteranas, y el nivel 0 queda para las primeras oleadas.
    squadOdds: [
      { fromWave: 1, chances: [1, 0, 0, 0] },
      { fromWave: 5, chances: [0.75, 0.25, 0, 0] },
      { fromWave: 8, chances: [0.4, 0.5, 0.1, 0] },
      { fromWave: 11, chances: [0, 0.6, 0.35, 0.05] },
      { fromWave: 14, chances: [0, 0.4, 0.4, 0.2] },
      { fromWave: 17, chances: [0, 0.2, 0.4, 0.4] },
    ],
    // La defensa activa del tanque: cuánto tarda en recargar cada carga, a cuántas celdas de su centro
    // lanza el interceptor contra un misil (`range`) o un cohete (`rocketRange`, que baja en picada y más
    // rápido: con menos alcance estallaría en el suelo), y cuántos segundos tarda en alcanzarlo.
    activeDefense: { cooldownSeconds: 6, range: 1.8, rocketRange: 2.4, interceptSeconds: 0.15 },
  },
  waves: {
    seed: 1337,
    interval: { base: 1.4, decayPerWave: 0.1, min: 0.42 },
    // Segundos hasta que la siguiente oleada sale sola: antes de la primera y entre las demás.
    // En los últimos `urgentSeconds`, el contador se pone rojo y suena un aviso por segundo.
    countdown: { firstSeconds: 30, betweenSeconds: 25, urgentSeconds: 5 },
    // Sin esto hay bola de nieve: desde `fromWave` sobra dinero y un disparo sigue matando a un
    // soldado, así que más enemigos no cuestan nada. Desde ahí, en la oleada número n les suma
    // `hpGrowth` por n² de su vida: al principio poco, para dar tiempo a mejorar, y al final mucho, que
    // es cuando sobra dinero. Su recompensa pasa a `rewardScale`.
    late: { fromWave: 11, hpGrowth: 0.003, rewardScale: 1 },
    // Las últimas oleadas llegan en grupos de `size`, con `interval` dentro del grupo y `pause` entre grupos.
    // `vehicleGap`: mínimo entre dos vehículos; van en dos carriles, a `laneOffset` del centro, para no salir uno encima del otro.
    squads: {
      interval: 0.1,
      vehicleGap: 0.5,
      laneOffset: 0.22,
      byWave: { 8: { size: 12, pause: 5, interval: 0.3 }, 9: { size: 21, pause: 5 }, 10: { size: 49, pause: 1 }, ...LATE_WAVE_SQUADS },
    },
    // Qué trae cada oleada, sin contar a quienes bajan de los vehículos. Los soldados se cuentan de a
    // unidades de 3, y su nivel decide quién lleva misil. La masa crece
    // siempre, y con ella el dinero. Cada una suma algo: motos, patrullas, camiones,
    // 8x8 y tanques.
    composition: [
      { 'infantry-mg': 9 },
      { 'infantry-mg': 12 },
      { 'infantry-mg': 9, 'moto-recon': 3 },
      { 'infantry-mg': 15, 'moto-recon': 2, patrulla: 4 },
      { 'infantry-mg': 12, 'moto-recon': 3, patrulla: 6, 'truck-transport': 1 },
      { 'infantry-mg': 12, 'moto-recon': 4, patrulla: 10, 'truck-transport': 1 },
      { 'infantry-mg': 15, 'moto-recon': 4, patrulla: 13, 'truck-transport': 2, 'dron-fpv': 1 },
      { 'infantry-mg': 15, 'moto-recon': 5, patrulla: 13, 'apc-8x8': 3, 'truck-transport': 2, 'dron-fpv': 2 },
      { 'infantry-mg': 12, 'moto-recon': 5, patrulla: 13, 'apc-8x8': 2, 'truck-transport': 3, 'dron-fpv': 2 },
      { 'infantry-mg': 18, 'moto-recon': 6, patrulla: 7, 'apc-8x8': 2, 'truck-transport': 4, 'tank-heavy': 2, 'dron-fpv': 2 },
      // Desde la 11, drones: primero los FPV, que van a las torres, y desde la 14 los de ala delta, a la base.
      { 'infantry-mg': 45, 'moto-recon': 3, patrulla: 7, 'apc-8x8': 1, 'truck-transport': 2, 'tank-heavy': 2, 'dron-fpv': 2 },
      { 'infantry-mg': 39, 'moto-recon': 4, patrulla: 10, 'apc-8x8': 2, 'truck-transport': 2, 'tank-heavy': 2, 'dron-fpv': 3 },
      { 'infantry-mg': 39, 'moto-recon': 4, patrulla: 10, 'apc-8x8': 2, 'truck-transport': 3, 'tank-heavy': 2, 'dron-fpv': 3 },
      { 'infantry-mg': 39, 'moto-recon': 5, patrulla: 11, 'apc-8x8': 2, 'truck-transport': 3, 'tank-heavy': 3, 'dron-fpv': 4, 'dron-ala': 2 },
      { 'infantry-mg': 39, 'moto-recon': 6, patrulla: 13, 'apc-8x8': 3, 'truck-transport': 4, 'tank-heavy': 3, 'dron-fpv': 5, 'dron-ala': 2 },
      { 'infantry-mg': 45, 'moto-recon': 7, patrulla: 14, 'apc-8x8': 3, 'truck-transport': 5, 'tank-heavy': 3, 'dron-fpv': 6, 'dron-ala': 2 },
      { 'infantry-mg': 54, 'moto-recon': 7, patrulla: 15, 'apc-8x8': 3, 'truck-transport': 6, 'tank-heavy': 3, 'dron-fpv': 7, 'dron-ala': 3 },
      { 'infantry-mg': 63, 'moto-recon': 9, patrulla: 16, 'apc-8x8': 4, 'truck-transport': 6, 'tank-heavy': 4, 'dron-fpv': 8, 'dron-ala': 4 },
      // La 19 y la 20 son el cierre: menos infantería a pie y más drones y blindados (Ricardo, 07-11-2026).
      // La 20 trae lo más pesado: con la defensa con la que él ganó, le destruye unas 13 torres.
      { 'infantry-mg': 54, 'moto-recon': 7, patrulla: 15, 'apc-8x8': 5, 'truck-transport': 6, 'tank-heavy': 5, 'dron-fpv': 12, 'dron-ala': 8 },
      { 'infantry-mg': 36, 'moto-recon': 4, patrulla: 10, 'apc-8x8': 10, 'truck-transport': 6, 'tank-heavy': 12, 'dron-fpv': 18, 'dron-ala': 14 },
    ],
  },

  // Lo que arde. Del daño incendiario se salva lo blindado: `armorFalloff` de armadura lo reduce al
  // mínimo, y hasta ahí baja en proporción. A un vehículo siempre le hace `vehicleMinShare`; y su motor
  // se recalienta: va a `overheatSpeed` mientras esté ahí y `overheatSeconds` después. Un impacto cerca
  // de otra zona la prolonga, sin sumar llamas.
  fire: { armorFalloff: 4, vehicleMinShare: 0.08, overheatSpeed: 0.55, overheatSeconds: 1.2, mergeRadius: 0.35 },

  // Lo que vuela: distancia a su objetivo a la que estalla.
  flying: { reach: 0.3 },

  // La infantería anda en escuadras: dos ametralladoras adelante, a `slotSide` del centro, y el RPG
  // `slotBack` más atrás, en triángulo. Quien manda (el primero vivo) elige el camino, y los demás
  // mantienen su puesto, alcanzándolo a `catchUp` de su velocidad. Una escuadra vale una sola vida,
  // aunque lleguen todos; las de los vehículos también.
  infantryTeams: { front: 'infantry-mg', rear: 'infantry-rpg', frontPerTeam: 2, rearPerTeam: 1, slotSide: 0.17, slotBack: 0.3, catchUp: 1.5 },

  // Los soldados en combate, por nivel de cobertura (Ricardo, 08-11-2026):
  //   0, en la calle sin nada: muere de un disparo (escudo rojo roto).
  //   1, en el pasto: esquiva `grassDeflect` de las balas, no los misiles, pero si le pegan muere.
  //   2, tras una roca, un árbol o un arbusto: la cobertura recibe `absorbChance` de los disparos, balas
  //      y misiles, y él no muere de un disparo (escudo azul).
  //   3, cuerpo a tierra tras la cobertura: esquiva además `proneDeflectBonus` (escudo dorado).
  // Cuerpo a tierra suma un nivel donde esté. El napalm ignora la cobertura. `coverDamage`: parte del
  // daño que recibe en cada nivel; `null`, un disparo lo mata.
  infantryCombat: {
    coverDamage: [null, null, 0.6, 0.6],
    grassDeflect: 0.15,
    proneDeflectBonus: 0.2,
    // Cuerpo a tierra: desde `fromLevel`, el disparo a un soldado tira al suelo a toda su unidad por
    // `seconds`, y quien baja de un vehículo empieza así, tenga el nivel que tenga. Dispara igual, y se
    // arrastra a `speed` de su paso. `muzzleDrop` y `muzzleForward`: cuánto más abajo y más adelante (hacia el
    // blanco) sale su disparo, en unidades del modelo; medidos con `npm run check:aim`.
    prone: { fromLevel: 1, seconds: 3.5, speed: 0.45, muzzleDrop: 1.5, muzzleForward: 1.35 },
    // El misil solo se dispara de rodilla: tarda `rise` segundos en arrodillarse y sigue así `hold` más
    // después de empezar a poder disparar, quieto y sin la cobertura del suelo. `muzzleDrop`: como arriba.
    kneel: { rise: 0.35, hold: 0.6, muzzleDrop: 1.2 },
    // Granada: `delay` segundos después de entrar en combate, y luego cada `cooldown`, a una torre a
    // `range` celdas o menos. `blast`: la onda alcanza a las torres cercanas.
    grenade: {
      delay: 2,
      cooldown: 8,
      range: 2.2,
      damage: 20,
      damageType: 'heavy-ballistic',
      speed: 4,
      hitThreshold: 0.25,
      blast: { radius: 0.9, fraction: 0.4 },
      impactBlast: 0.3,
    },
  },

  // Sistema de cobertura de la infantería (distancias en celdas). Cada disparo a quien se cubre,
  // también un misil, tiene `absorbChance` de pegarle a la cobertura y no al soldado. La cobertura
  // recibe ese daño según su blindaje, como un vehículo, y con la vida en cero cae. Rocas y árboles
  // no dejan construir sin sacarlos.
  rocks: {
    maxHp: 300,
    armorClass: 'heavy',
    armor: 12,
    absorbChance: 0.25,
    clearCost: 50,
    coverRadius: 0.62,
    coverSpeed: 0.5,
    climbHeight: 0.28,
    effectHeight: 0.16,
  },

  trees: {
    maxHp: 40,
    armorClass: 'medium',
    armor: 3,
    absorbChance: 0.2,
    clearCost: 30,
    coverRadius: 0.65,
    coverSpeed: 0.8,
    effectHeight: 0.16,
  },

  // El arbusto no ocupa la celda: una torre puesta ahí lo aplasta.
  bushes: {
    maxHp: 15,
    armorClass: 'light',
    armor: 0,
    absorbChance: 0.12,
    coverRadius: 0.5,
    coverSpeed: 0.9,
    effectHeight: 0.08,
  },

  // Mientras avanza, el soldado va a la cobertura que tenga cerca (`radius`) si desviarse le alarga
  // el camino menos de lo que acepta él, un azar entre 0 y `maxDetour`: así no van todos en fila. La
  // da por usada al llegar (`reach`) o tras `patience` segundos, si hay mucha gente.
  coverSeek: { radius: 2, maxDetour: 0.5, reach: 0.3, patience: 3 },

  combat: {
    towerDamagedThreshold: 0.58,
    towerDestroyedVfxHpFloor: 0,
    // Daño mínimo de cada impacto a una torre, por mucho blindaje que tenga.
    towerMinDamagePerHit: 1,
    // Coseno del medio arco de frente y de atrás de un vehículo: 60° a cada lado de su rumbo.
    facingArc: 0.5,
  },

  ui: {
    dragThreshold: 2,
    // Táctil: cuántos píxeles debe recorrer el dedo para que sea arrastre y no toque, y cuánto
    // zoom da cada píxel que se abren o cierran dos dedos (en unidades de la rueda del mouse).
    touchDragThreshold: 10,
    pinchZoomScale: 3,
  },
};
