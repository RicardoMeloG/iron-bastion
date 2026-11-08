export const ARMOR_CLASSES = {
  light: {
    id: 'light',
    label: 'Ligera',
    speedModifier: 1,
  },
  medium: {
    id: 'medium',
    label: 'Media',
    speedModifier: 0.84,
  },
  heavy: {
    id: 'heavy',
    label: 'Pesada',
    speedModifier: 0.64,
  },
  // Soldados a pie: sin blindaje. Una bala les basta, y un misil es un gasto.
  infantry: {
    id: 'infantry',
    label: 'Infantería',
    speedModifier: 1,
  },
};

export const MUNITION_CLASSES = {
  lightBallistic: 'light-ballistic',
  areaIncendiary: 'area-incendiary',
  heavyBallistic: 'heavy-ballistic',
  piercing: 'piercing',
  shapedCharge: 'shaped-charge',
};

export const DAMAGE_MATRIX = {
  [MUNITION_CLASSES.lightBallistic]: { light: 1, medium: 0.75, heavy: 0.5, infantry: 1 },
  [MUNITION_CLASSES.areaIncendiary]: { light: 1, medium: 0.75, heavy: 0, infantry: 1 },
  [MUNITION_CLASSES.heavyBallistic]: { light: 1, medium: 1, heavy: 1, infantry: 1 },
  [MUNITION_CLASSES.piercing]: { light: 1, medium: 1.25, heavy: 1.5, infantry: 0.5 },
  // Carga hueca (LM-2, spec 002): castiga al blindaje pesado. Gastar un misil en un ligero o
  // en un soldado es un mal negocio.
  [MUNITION_CLASSES.shapedCharge]: { light: 0.3, medium: 1, heavy: 1.5, infantry: 0.5 },
};
