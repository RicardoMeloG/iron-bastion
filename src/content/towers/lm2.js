import { MUNITION_CLASSES } from '../enemies/vehicle-combat.js';

// LM-2 LANZA: lanzamisiles anti-blindaje (spec 002, D-1). Diseño ficticio. Cada nivel le suma un
// tubo (de 2 a 6): dispara los tubos uno tras otro y, vacío el cargador, recarga todos antes de
// repetir. El misil vuela en línea recta y solo le dispara a lo que va por tierra. La carga hueca
// castiga al blindaje pesado y le hace poco a los ligeros (DAMAGE_MATRIX), y la torre prioriza al
// blanco más blindado. Pega fuerte, pero es frágil: tiene menos vida que la MG-7.

/** Un nivel de ataque. `rate` es la cadencia media del ciclo, la que muestra el panel. */
function level({ label, magazine, damage, salvoInterval, reload, range, scale, upgradeCost }) {
  const cycle = (magazine - 1) * salvoInterval + reload;
  return { label, magazine, damage, salvoInterval, reload, range, scale, upgradeCost, rate: Math.round((magazine / cycle) * 100) / 100 };
}

export const lm2TowerDefinition = {
  id: 'lm2-lanza',
  displayName: 'LM-2 LANZA',
  shortName: 'LM-2',
  targeting: {
    default: 'armored',
  },
  economy: {
    baseCost: 150,
    sellRatio: 0.6,
    // Vender una torre destruida no puede ser una reparación barata.
    destroyedSellRatio: 0.25,
  },
  combatModel: {
    damageType: MUNITION_CLASSES.shapedCharge,
    // Se ve volar, pero no tan lento: va derecho, y un vehículo tiene tiempo de doblar.
    projectileSpeed: 5,
    hitThreshold: 0.1,
    // Sin guía: sale hacia donde va a estar su blanco y sigue derecho. Si el blanco cae o dobla, sigue
    // igual: le pega al vehículo que se cruce en su línea o se pierde.
    missile: true,
    launch: true,
    // Explosión que se dibuja al impactar (celdas). Es solo visual: el misil daña únicamente a su blanco.
    impactBlast: 0.22,
    // Montaje pesado: gira más lento que la MG-7 y dispara solo bien alineado.
    yawSpeed: Math.PI * 0.5,
    readyAngle: 0.04,
    elevationLimits: {
      min: -0.7,
      max: 0.5,
    },
  },
  // Un rig por nivel, con una boca por tubo, y sus restos. Mide `scale` celdas de largo en el nivel 1.
  model: {
    rigs: ['lm2-lanza-n1', 'lm2-lanza-n2', 'lm2-lanza-n3', 'lm2-lanza-n4', 'lm2-lanza-n5'],
    wreck: 'lm2-lanza-destruida',
    scale: 0.85,
  },
  panelModel: {
    className: 'Anti-tanque',
    description: 'Misiles de carga hueca que vuelan en línea recta: castigan a los blindados, pero pueden errar, rinden poco contra ligeros y no alcanzan lo que vuela. Torre frágil y de recarga lenta.',
    idealTarget: 'tanques y blindados 8x8.',
    maxStats: {
      damage: 150,
      rate: 1.48,
      range: 5,
      scale: 1.16,
      armor: 12,
      hp: 250,
    },
  },
  defenseLevels: [
    {
      label: 'Blindaje ligero',
      armorClass: 'light',
      maxHp: 120,
      armor: 3,
      upgradeCost: 140,
    },
    {
      label: 'Blindaje medio',
      armorClass: 'medium',
      maxHp: 175,
      armor: 7,
      upgradeCost: 220,
    },
    {
      label: 'Blindaje pesado',
      armorClass: 'heavy',
      maxHp: 250,
      armor: 12,
      upgradeCost: null,
    },
  ],
  levels: [
    // Cada nivel rinde más por crédito que poner torres básicas (tools/balance/level-value.mjs).
    // La recarga es larga a propósito: de frente, un tanque veterano aguanta a una sola LM-2 hasta el nivel 5
    // (Ricardo, 07-11-2026). Con la mitad, una de nivel 3 lo destruía en 10 s.
    level({ label: 'Lanzador doble', magazine: 2, damage: 55, salvoInterval: 0.45, reload: 9, range: 4.2, scale: 1, upgradeCost: 130 }),
    level({ label: 'Lanzador triple', magazine: 3, damage: 75, salvoInterval: 0.42, reload: 6.6, range: 4.4, scale: 1.04, upgradeCost: 200 }),
    level({ label: 'Lanzador cuádruple', magazine: 4, damage: 92, salvoInterval: 0.4, reload: 6, range: 4.6, scale: 1.08, upgradeCost: 300 }),
    level({ label: 'Lanzador quíntuple', magazine: 5, damage: 118, salvoInterval: 0.38, reload: 5.2, range: 4.8, scale: 1.12, upgradeCost: 440 }),
    level({ label: 'Lanzador séxtuple', magazine: 6, damage: 150, salvoInterval: 0.35, reload: 4.6, range: 5, scale: 1.16, upgradeCost: null }),
  ],
};
