// Paleta de los vehículos (spec 001, D-6). Es la fuente única de sus colores: el paso de
// estilo del normalizador (tools/asset-pipeline/style.mjs) pinta cada triángulo con el
// color de esta lista más cercano al original. Los tonos de metal, neumático y luces son
// los mismos que ya usan la MG-7 y los efectos (materials.js, rendering.js).
export const VEHICLE_PALETTE = {
  arena: 0xa59172,
  arenaOscura: 0x7d6b50,
  oliva: 0x6b6e45,
  metal: 0x5f666f,
  metalOscuro: 0x2e3238,
  neumatico: 0x222222,
  vidrio: 0x3b4d58,
  luzRoja: 0xaa3333,
  luzAmbar: 0xe3a34a,
  luzBlanca: 0xdfe4e8,
};

// Los modelos por código (ADR 003) eligen sus colores a mano, así que pueden llevar tonos que el
// paso de estilo no debe ofrecerle a una textura de TRELLIS.
export const CODE_MODEL_PALETTE = {
  ...VEHICLE_PALETTE,
  arenaClara: 0xb9a582,
  ojiva: 0xc4322a,
  piel: 0xc29a78,
};
