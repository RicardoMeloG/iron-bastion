import { SCORE_CONFIG } from '../content/score.js';

export const SCORE_CATEGORIES = [
  'enemigos',
  'oleadas',
  'sinPerdidas',
  'adelanto',
  'rapidez',
  'torresPerdidas',
  'vidasPerdidas',
  'victoria',
];

export function createScore() {
  const byCategory = {};
  for (const cat of SCORE_CATEGORIES) {
    byCategory[cat] = 0;
  }
  return { total: 0, byCategory, waveLivesLost: 0 };
}

export function scoreEffects(score, effects, config = SCORE_CONFIG) {
  const pops = [];

  function add(category, rawPoints) {
    const points = Math.round(rawPoints);
    if (points === 0) return;
    score.byCategory[category] += points;
    score.total += points;
    pops.push({ category, points });
  }

  for (const effect of effects) {
    switch (effect.type) {
      case 'enemy-killed': {
        const idx = effect.veterancy ?? 0;
        const mult =
          idx >= 0 && idx < config.veterancyMultiplier.length
            ? config.veterancyMultiplier[idx]
            : 1;
        add('enemigos', effect.reward * config.enemyRewardFactor * mult);
        break;
      }

      case 'enemy-leaked': {
        const livesLost = effect.livesLost;
        if (livesLost > 0) {
          add('vidasPerdidas', -livesLost * config.lifeLost);
          score.waveLivesLost += livesLost;
        }
        break;
      }

      case 'tower-destroyed': {
        add('torresPerdidas', -effect.invested * config.towerLostFactor);
        break;
      }

      case 'wave-started': {
        score.waveLivesLost = 0;
        if (effect.countdownLeft > 0) {
          add('adelanto', Math.floor(effect.countdownLeft) * effect.wave * config.earlyCallFactor);
        }
        break;
      }

      case 'wave-ended': {
        add('oleadas', effect.wave * config.wavePoints);
        if (score.waveLivesLost === 0) {
          add('sinPerdidas', effect.wave * config.wavePoints * config.noLossBonus);
        }
        if (Number.isFinite(effect.seconds)) {
          const reference = config.clearTime.baseSeconds + effect.wave * config.clearTime.perWaveSeconds;
          add('rapidez', Math.max(0, reference - effect.seconds) * effect.wave * config.clearTime.factor);
        }
        break;
      }

      case 'game-ended': {
        if (effect.victory) {
          add('victoria', config.victory.base + effect.lives * config.victory.perLife);
        }
        break;
      }

      default:
        break;
    }
  }

  return pops;
}
