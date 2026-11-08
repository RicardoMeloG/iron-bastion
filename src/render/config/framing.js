export const FRAMING_CONFIG = {
  initialSize: 8.6,
  initialAngle: Math.PI / 2,
  elevation: 0.8,
  distance: 40,
  farPlane: 200,
  lookAtXOffset: 0,
  lookAtZOffset: 0,
  maxPixelRatio: 2,
  // Pantallas táctiles (teléfonos y tabletas): con su densidad de píxeles, sombras suaves y
  // antialias la gráfica dibuja hasta 9 veces más píxeles que en un monitor y se arrastra.
  touchDevice: {
    maxPixelRatio: 1.25,
    antialias: false,
    softShadows: false,
    shadowMapSize: 512,
  },
  fitPadding: 1.02,
  fitPlayablePadding: 0.7,
  initialZoomRatio: 0,

  rotation: {
    sensitivity: 0.006,
  },

  zoom: {
    minRatio: 0.35,
    maxRatio: 1,
    defaultRatio: 1,
    sensitivity: 0.0007,
  },

  centering: {
    screenXRatio: 0.5,
    screenYRatio: 0.5,
    tolerancePx: 0.5,
  },

  lighting: {
    ambient: { color: 0xc4cfd8, intensity: 1.05 },
    sun: {
      color: 0xfff0d0,
      intensity: 1.7,
      position: [10, 18, 8],
      shadowBounds: 14,
      shadowMapSize: 1024,
    },
    fill: {
      color: 0xaaccff,
      intensity: 0.4,
      position: [-8, 10, -6],
    },
  },
};
