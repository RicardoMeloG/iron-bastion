export const RENDERING_CONFIG = {
  map: {
    ground: { padding: 3.2, height: 0.12, yOffset: -0.06 },
    subGround: { padding: 4.4, height: 0.3, yOffset: -0.25, color: 0x3d6630 },
    tile: { size: 0.96, grassVarianceMin: 0.9, grassVarianceRange: 0.2 },
    // Cuánto sobresale de la baldosa la marca de la celda bajo el cursor (celdas).
    hoverMarker: { lift: 0.008 },
    // Niebla sobre el territorio enemigo: opaca lejos y se abre justo antes del tablero, en
    // `fadeColumns` celdas. Es larga para que siga cubriendo al girar la vista.
    edgeFog: { fadeColumns: 2.2, endColumn: 7, lengthColumns: 40, depthColumns: 60, y: 0.6, renderOrder: 20 },
    curb: { thickness: 0.06, height: 0.1, offset: 0.48, yOffset: 0.06 },
    roadDash: { length: 0.3, width: 0.06, height: 0.01, yOffset: 0.085 },
    // Roca: bloque aplastado con un par de piedras al pie.
    rock: {
      sizeMin: 0.26,
      sizeRange: 0.08,
      squash: 0.8,
      pebbles: 2,
      pebbleSize: 0.08,
      pebbleSpread: 0.3,
      hpBar: { y: 0.5, width: 0.5, height: 0.075, fillWidth: 0.46, fillHeight: 0.05, opacity: 0.85, renderOrder: 1390 },
    },
    // Zona incendiaria: llamas chicas sobre el suelo.
    fireZone: { flames: 7, flameSize: 0.2, spread: 0.85, lift: 1.5, fadeSeconds: 0.8, glowScale: 1.25, glowHeight: 0.012 },
    // Arbusto: tres bultos bajos que se van perdiendo con el daño.
    bush: {
      pieces: 3,
      radius: 0.13,
      spread: 0.13,
      height: 0.09,
    },
    // Árbol: tronco y copa de piezas que se van perdiendo con el daño. Cae antes de desaparecer.
    tree: {
      trunk: { radius: 0.05, height: 0.3 },
      round: { radius: 0.2, spread: 0.15, baseY: 0.34, stepY: 0.16 },
      pine: { radius: 0.27, height: 0.32, baseY: 0.2, stepY: 0.17, shrink: 0.76 },
      sizeMin: 0.9,
      sizeRange: 0.25,
      pieces: 3,
      shake: { seconds: 0.25, angle: 0.06, frequency: 40 },
      fall: { seconds: 0.7, lying: 0.8, shrinking: 0.4, angle: 1.45 },
      hpBar: { y: 0.72, width: 0.5, height: 0.075, fillWidth: 0.46, fillHeight: 0.05, opacity: 0.85, renderOrder: 1390 },
    },
    markers: {
      spawn: {
        color: 0xaa3333,
        topRadius: 0.3,
        bottomRadius: 0.35,
        height: 0.12,
        segments: 8,
        yOffset: 0.06,
        rotationSpeed: 1.5,
      },
      base: {
        color: 0x2a7a2a,
        topRadius: 0.3,
        bottomRadius: 0.35,
        height: 0.12,
        segments: 8,
        yOffset: 0.06,
        rotationSpeed: -1.5,
      },
      baseBuilding: { size: 0.3, height: 0.25, color: 0x556655, yOffset: 0.125 },
    },
    rangeIndicator: { segments: 48, color: 0x66ff66, opacity: 0.1, yOffset: 0.05 },
    selection: { innerRadius: 0.42, outerRadius: 0.5, segments: 40, color: 0x4fd8ff, opacity: 0.95, rangeColor: 0x4fd8ff, rangeOpacity: 0.09, yOffset: 0.055 },
  },

  enemy: {
    // Galones de veteranía, a un costado de la barra de vida. `gapFromBar`: distancia, en tamaños del galón.
    veterancyEmblem: { size: 0.19, soldierSize: 0.13, gapFromBar: 0.65, renderOrder: 30 },
    bobbing: { amplitude: 0.003, frequency: 12, pathIndexMultiplier: 2 },
    hpBar: {
      // Con toda la vida no se muestra, para no tapar el modelo.
      visibilityMode: 'damaged',
      minYOffset: 0.48,
      yOffsetHeightFactor: 0.64,
      minScale: 1.6,
      scaleByWidthFactor: 0.22,
      background: { width: 0.54, height: 0.08, color: 0x000000, opacity: 0.85 },
      fill: { width: 0.5, height: 0.056, halfWidth: 0.25 },
      renderOrder: 1400,
    },
    targetMarker: {
      yOffset: 0.46,
      yOffsetHeightFactor: 0.58,
      minScale: 1.4,
      scaleByWidthFactor: 0.22,
      ring: { radius: 0.12, tube: 0.01, radialSegments: 8, tubularSegments: 24, color: 0xffcc55, opacity: 0.9 },
      chevron: { radius: 0.035, height: 0.08, segments: 3, color: 0xffdd88, opacity: 0.95 },
      bob: { base: 0.45, amplitude: 0.012, frequency: 6 },
      opacityPulse: { base: 0.65, amplitude: 0.18, frequency: 8 },
    },
    // Infantería: paso de las piernas al caminar, retroceso del torso al disparar (ángulo y
    // cuánto del golpe se pierde por segundo) y caída al morir.
    walk: { frequency: 8, swing: 0.55, stopRate: 10, hpBarScale: 0.55 },
    recoil: { lean: 0.32, recovery: 7 },
    // Cuerpo a tierra: inclinación (rad), rapidez del gesto y, en partes de su altura, cuánto se levanta
    // del suelo y cuánto se corre atrás para quedar donde estaba. Se arrastra con menos pierna y meciéndose.
    prone: { pitch: 1.42, rate: 9, lift: 0.1, shift: 0.5, legShare: 0.45, sway: 0.16, crawlFrequency: 5 },
    // De rodilla, para disparar un misil: rapidez del gesto, cuánto baja (parte de su altura) y cómo
    // quedan las piernas (rad): la de adelante flexionada, la de atrás apoyada.
    kneel: { rate: 12, drop: 0.3, frontLeg: -0.8, backLeg: 0.55 },
    // Sistema de cobertura: el ícono sobre la cabeza del soldado (celdas). Azul en una roca; roto y
    // rojo sin ninguna cobertura.
    coverIcon: { size: 0.25, gapAboveBar: 0.2, renderOrder: 1500, shielded: '#66c8ff', exposed: '#ff5a4d', prone: '#f5c542' },
    // Esquivar un misil: cuánto dura (s), cuánto se abre (celdas) y cuánto se inclina (rad).
    dodge: { seconds: 0.6, offset: 0.3, lean: 0.5 },
    fallenSoldier: { fallSeconds: 0.35, roll: 0.3, lieSeconds: 2.2, sinkSeconds: 0.8 },
    // Destrucción (spec 002): bola de fuego, la torreta sale volando, el casco se quema y se
    // hunde. Distancias en celdas y tiempos en segundos.
    wreck: {
      fireballRadius: 0.28,
      fireballSeconds: 0.42,
      fireballColor: 0xff7a1e,
      hop: 0.05,
      hopSeconds: 0.3,
      tilt: 0.14,
      charColor: 0x1d1b19,
      charSeconds: 0.5,
      turretLaunchSpeed: 2.4,
      turretLaunchSpeedHeavy: 3.2,
      turretDrift: 0.5,
      turretSpin: 7,
      gravity: 8,
      burnSeconds: 2.8,
      flameSize: 0.15,
      flameCount: 7,
      flameSpread: 0.2,
      flameLift: 3,
      smokeEvery: 0.14,
      smoke: { radius: 0.05, segments: 7, color: 0x3a3836, opacity: 0.5, lifetime: 1.6, upwardSpeed: 0.35, growthRate: 0.9 },
      sinkSeconds: 1,
    },
    turretAnimation: {
      yawAmplitude: 0.28,
      yawFrequency: 0.65,
      elevationBase: 0.10,
      pitchAmplitude: 0.08,
      pitchFrequency: 1.2,
    },
  },

  tower: {
    // Cañones que giran: aceleración al apuntar y al soltar el blanco, en radianes por segundo².
    rotor: { spinUp: 30, spinDown: 9 },
    // Fortificación de cada nivel de blindaje. `fit`: diámetro del anillo respecto del largo de la torre.
    armorRings: [{ model: 'blindaje-n1', fit: 1.22 }, { model: 'blindaje-n2', fit: 1.22 }],
    // Las luces de nivel, en unidades del modelo: un color por nivel y las medidas sobre la base común.
    // El anillo rodea el cuello. Hay una ranura por mejora, en la cubierta, y `angles` esquiva los sacos
    // que hay al frente; se encienden en ese orden, desde el lado que los cañones tapan menos. `tilt` sigue el talud.
    levelLights: {
      colors: [null, 0x3dff6e, 0x38b6ff, 0xc05cff, 0xffc62e],
      offColor: 0x1c2024,
      ring: { radius: 0.205, tube: 0.016, y: 0.262 },
      slots: { angles: [1.25, 0.72, -0.72, -1.25], radius: 0.31, y: 0.236, width: 0.095, height: 0.012, depth: 0.046, tilt: 0.166 },
    },
    levelColors: [0x44ff44, 0x66ff44, 0xffff44, 0xffaa22, 0xff4444],
    indicator: {
      top: {
        size: 0.022,
        height: 0.015,
        color: 0x9be56f,
        emissive: 0x63d144,
        emissiveIntensity: 0.7,
        metalness: 0.4,
        roughness: 0.35,
        position: { x: 0.02, y: 0.27, z: 0.02 },
      },
      side: {
        size: 0.018,
        color: 0x8ce96a,
        emissive: 0x59ce43,
        emissiveIntensity: 0.6,
        metalness: 0.35,
        roughness: 0.32,
        position: { x: 0.095, y: 0.03, z: 0.12 },
      },
      levelDot: {
        radius: 0.005,
        segments: 4,
        spacing: 0.026,
        emissiveIntensity: 0.5,
        position: { x: -0.14, y: 0.03, z: 0.095 },
      },
    },
    muzzleFlash: {
      radius: 0.028,
      segments: 10,
      color: 0xffd37a,
      scale: { x: 0.55, y: 0.55, z: 1.15 },
    },
    damageState: {
      threshold: 0.58,
      flameSize: 0.12,
      flameSizeDestroyed: 0.16,
      flameStrength: 0.85,
      flameCount: 7,
      flameCountDamaged: 3,
      flameSpread: 0.17,
      flameSpreadDamaged: 0.07,
      flameLift: 8,
      smokeColor: 0x3f4650,
      fireBaseHeight: 0.46,
      smokeBaseHeight: 0.58,
    },
    blast: {
      fireballRadius: 0.55,
      fireballHeight: 0.4,
      fireballSeconds: 0.5,
      fireballColor: 0xff7a1e,
      launchSpeed: 3.2,
      drift: 0.9,
      gravity: 8,
      spin: 7,
    },
    hpBar: {
      // Con toda la vida no se muestra, para no tapar el modelo.
      visibilityMode: 'damaged-or-targeted',
      yMargin: 0.2,
      widthBase: 0.62,
      heightBase: 0.095,
      fillWidthBase: 0.58,
      fillHeightBase: 0.067,
      backgroundColor: 0x000000,
      backgroundOpacity: 0.85,
      renderOrder: 1420,
    },
  },
};

// Mismos colores para unidades y torres: naranja desde la mitad de la vida y rojo desde un cuarto.
export const HP_BAR_COLORS = { healthy: 0x35e85a, low: 0xff9a1f, critical: 0xff2f2f };

export function hpBarColor(hpRatio) {
  if (hpRatio <= 0.25) return HP_BAR_COLORS.critical;
  return hpRatio <= 0.5 ? HP_BAR_COLORS.low : HP_BAR_COLORS.healthy;
}
