export const SCORE_CONFIG = {
  enemyRewardFactor: 10,                          // multiplicador base del premio por enemigo eliminado
  veterancyMultiplier: [1, 1.5, 2, 3],            // multiplicador por nivel de veterancia 0..3
  wavePoints: 100,                                // puntos fijos por oleada superada (oleada × 100)
  noLossBonus: 0.25,                              // bono del 25 % de los puntos de oleada si no se pierde vida
  earlyCallFactor: 10,                            // adelanto = segundos restantes × oleada × 10
  clearTime: { baseSeconds: 40, perWaveSeconds: 6, factor: 5 }, // referencia = 40 + oleada×6; bonus = max(0, ref−s) × oleada × 5
  towerLostFactor: 2,                             // penalización por torre destruida = −(invertido × 2)
  lifeLost: 500,                                  // penalización por vida perdida (−500 c/u)
  victory: { base: 10000, perLife: 1000 },        // bonus de victoria: 10 000 + vidas × 1 000
};
