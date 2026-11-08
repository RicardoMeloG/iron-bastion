// Sonido del juego (spec 001, T09; spec 002). Reacciona a los mismos eventos del núcleo que dibuja
// render (disparos, impactos, vehículos destruidos) y al estado (motores, drones y fuego mientras
// haya), así render no toca el audio y el audio no depende de cómo se dibuja nada.
import { AUDIO_CONFIG } from '../audio/audio-config.js';
import { AmbienceSynth } from '../audio/ambience-synth.js';
import { BeepSynth } from '../audio/beep-synth.js';

const { shots: SHOTS, shotFiles: SHOT_FILES, loops: LOOPS } = AUDIO_CONFIG;
// La MG-7 de nivel 5 (índice 4) es la gatling.
const GATLING_LEVEL = 4;

// Qué bucle hace sonar cada tipo de enemigo mientras está vivo.
const LOOP_BY_ENEMY = {
  'moto-recon': ['moto-motor'],
  patrulla: ['patrulla-motor'],
  'truck-transport': ['patrulla-motor'],
  'apc-8x8': ['blindado-motor'],
  'tank-heavy': ['blindado-motor', 'orugas'],
  'dron-fpv': ['dron-fpv'],
  'dron-ala': ['dron-ala'],
};

function towerShot({ towerTypeId, level, launch }) {
  if (towerTypeId === 'rk40-brasa') return 'cohete-salva';
  if (launch) return 'misil-lanzamiento';
  if (towerTypeId === 'aa3-halcon') return 'canon-automatico-aa';
  return level >= GATLING_LEVEL ? 'mg7-gatling' : 'mg7-disparo';
}

function enemyShot({ sound, enemyTypeId }) {
  if (sound === 'cannon') return 'tanque-canon';
  if (sound === 'rocket') return 'rpg-disparo';
  return enemyTypeId === 'apc-8x8' ? 'canon-automatico' : 'enemigo-fusil';
}

export function createAudioDirector(sfxPlayer) {
  const beeps = new BeepSynth(sfxPlayer);
  const ambience = new AmbienceSynth(sfxPlayer);
  const activeLoops = new Set();

  const play = (name) => {
    const { volume, cooldownMs, rateJitter, playbackRate } = SHOTS[name];
    sfxPlayer.play(SHOT_FILES[name] ?? name, { volume, cooldownMs, rateJitter, playbackRate });
  };

  return {
    /** Los efectos que el núcleo produjo en este cuadro (consumeEffects). */
    handleEffects(effects) {
      for (const effect of effects) {
        switch (effect.type) {
          case 'wave-countdown-beep':
            beeps.countdownBeep(effect.seconds);
            break;
          case 'projectile-fired':
            play(towerShot(effect));
            break;
          case 'enemy-projectile-fired':
            play(enemyShot(effect));
            break;
          case 'defense-fired':
            play('interceptor');
            break;
          case 'enemy-killed':
            if (effect.armorClass === 'infantry') play('soldado-cae');
            else play(effect.armorClass === 'light' ? 'explosion-media' : 'explosion-grande');
            break;
          case 'drone-exploded':
            play('explosion-media');
            break;
          case 'hit':
            // Un misil que pega estalla; una bala contra un blindado, rebota.
            if (effect.impactBlast > 0) play('explosion-media');
            else if (effect.armorClass === 'medium' || effect.armorClass === 'heavy') play('impacto-blindaje');
            break;
          case 'tower-hit':
            if (effect.impactBlast > 0 || effect.blastRadius > 0) play('explosion-media');
            break;
          case 'missile-missed':
          case 'missile-intercepted':
          case 'projectile-burst':
          case 'cover-removed':
          case 'incendiary-impact':
            play('explosion-chica');
            break;
          default:
            break;
        }
      }
    },

    /** Ambiente del campo y bucles: motores, orugas, drones y fuego, según cuántos haya. */
    update(state, paused = false) {
      ambience.update();
      const counts = {};
      // En pausa los bucles callan: nada se mueve ni arde.
      if (!paused) {
        for (const enemy of state.enemies) {
          if (!enemy.alive) continue;
          for (const loop of LOOP_BY_ENEMY[enemy.enemyTypeId] ?? []) counts[loop] = (counts[loop] ?? 0) + 1;
        }
        if (state.fireZones?.length) counts.fuego = state.fireZones.length;
      }
      for (const [loop, { perUnit, max }] of Object.entries(LOOPS)) {
        if (typeof perUnit !== 'number') continue;
        const count = counts[loop] ?? 0;
        // Con más unidades suena más fuerte, pero cada una suma menos.
        const volume = Math.min(max, perUnit * Math.sqrt(count));
        if (count > 0 && !activeLoops.has(loop)) {
          if (sfxPlayer.playLoop(loop, { volume })) activeLoops.add(loop);
        } else if (count > 0) {
          sfxPlayer.setLoopVolume(loop, volume);
        } else if (activeLoops.has(loop)) {
          sfxPlayer.stopLoop(loop, LOOPS.fadeOutMs);
          activeLoops.delete(loop);
        }
      }
    },
  };
}
