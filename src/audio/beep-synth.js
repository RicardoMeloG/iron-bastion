// El pitido de la cuenta regresiva antes de una oleada, sintetizado: es un aviso de la interfaz, no
// un sonido del mundo. Usa el AudioContext de SfxPlayer, así que el silencio (M) también lo apaga.
import { AUDIO_CONFIG } from './audio-config.js';

const BEEP = AUDIO_CONFIG.countdownBeep;

export class BeepSynth {
  constructor(sfxPlayer) {
    this.sfxPlayer = sfxPlayer;
  }

  /** Un pitido corto por cada uno de los últimos segundos; el último, más agudo. */
  countdownBeep(secondsLeft) {
    const context = this.sfxPlayer.context;
    if (!context || context.state !== 'running' || this.sfxPlayer.muted) return;
    const now = context.currentTime;
    const beep = context.createOscillator();
    beep.type = 'square';
    beep.frequency.value = secondsLeft === 1 ? BEEP.lastHz : BEEP.hz;
    const gain = context.createGain();
    gain.gain.setValueAtTime(BEEP.level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + BEEP.seconds);
    beep.connect(gain).connect(this.sfxPlayer.output);
    beep.start(now);
    beep.stop(now + BEEP.seconds);
  }
}
