// Registro de partidas para medir el balance con partidas reales (spec 002).
//
// Escucha los eventos del núcleo (los mismos que dibuja render) y los resume por oleada:
// qué vehículos salieron, cuáles se destruyeron o pasaron, el daño efectivo según munición y
// blindaje, los disparos y aciertos de torres y vehículos, la economía y las acciones del
// jugador. Al terminar cada oleada y la partida, lo manda al servidor local, que lo guarda en
// logs/partida-<inicio>.json (tools/match-log/vite-plugin.mjs), cuando el juego se sirve desde este
// computador o la red local. Publicado, solo lo manda a `remoteUrl` (VITE_REGISTRO_URL al construir)
// y solo si el jugador acepta en la pantalla de inicio; sin esa dirección, no manda nada.

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

const KEEPALIVE_LIMIT = 60 * 1024;
const now = () => performance.now() / 1000;
const round = (value) => Math.round(value * 100) / 100;

function emptyWave(effect, towers, startedAt) {
  return {
    oleada: effect.wave,
    inicio: round(startedAt),
    duracion: null,
    vidasInicio: effect.lives,
    creditosInicio: effect.credits,
    vidasFin: null,
    creditosFin: null,
    composicion: effect.spawns,
    torres: towers.map((tower) => ({ id: tower.id, ataque: tower.level + 1, blindaje: tower.defenseTier + 1 })),
    enemigos: {},
    torresStats: {},
    danoPorImpacto: {},
    vehiculos: { disparos: 0, impactos: 0, dano: 0, torresDestruidas: 0 },
    rocas: { impactosEnCobertura: 0, impactosExpuestos: 0 },
    // Las granadas de los soldados: cuántas lanzaron, cuántas torres alcanzaron (la onda alcanza a
    // las vecinas) y cuánto daño hicieron.
    granadas: { lanzadas: 0, torresAlcanzadas: 0, dano: 0 },
    recompensas: 0,
    maximoALaVez: 0,
    // Vehículos de veteranía 1, 2 y 3.
    veteranos: [0, 0, 0],
  };
}

export function createMatchRecorder({ location = window.location, send = null, remoteUrl = import.meta.env?.VITE_REGISTRO_URL ?? null } = {}) {
  const local = LOCAL_HOST.test(location.hostname);
  // Fuera de este computador, solo con dirección remota y con el permiso del jugador (setEnabled).
  const remote = !local && remoteUrl ? remoteUrl : null;
  let enabled = local;
  let match = null;
  let wave = null;
  const enemies = new Map();

  const post = send ?? ((log) => {
    const body = JSON.stringify(log);
    fetch(remote ?? new URL('__registro', document.baseURI), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      // keepalive deja terminar el envío si se cierra la página, pero el navegador rechaza más de 64 KB.
      keepalive: body.length < KEEPALIVE_LIMIT,
    }).catch((error) => console.warn('No se pudo guardar el registro de partida:', error));
  });

  function startMatch() {
    const started = new Date();
    match = {
      formato: 1,
      id: started.toISOString().replace(/[:.]/g, '-').slice(0, 19),
      inicio: started.toISOString(),
      t0: now(),
      oleadas: [],
      acciones: [],
      resultado: null,
    };
    wave = null;
    enemies.clear();
  }

  const elapsed = () => round(now() - match.t0);
  const enemyStats = (type) => (wave.enemigos[type] ??= { salieron: 0, destruidos: 0, pasaron: 0, impactos: 0, dano: 0, disparos: 0, danoATorres: 0, segundosVivo: [] });
  // El tipo sale del estado: una torre que recibe daño antes de su primer disparo (una AA-3 sin drones a
  // la vista) también lo tiene.
  let currentState = null;
  const towerStats = (id) => (wave.torresStats[id] ??= {
    tipo: currentState?.towers.find((tower) => tower.id === id)?.towerTypeId ?? null,
    disparos: 0, impactos: 0, fallados: 0, dano: 0, bajas: 0, danoRecibido: 0, destruida: false,
  });

  // El retraso que el napalm le causó a un vehículo, al terminar su vida (destruido o en la base).
  function addFireDelay({ enemyTypeId, fireDelaySeconds }) {
    if (!(fireDelaySeconds > 0)) return;
    const enemy = enemyStats(enemyTypeId);
    enemy.retrasoFuego = round((enemy.retrasoFuego ?? 0) + fireDelaySeconds);
  }

  function save() {
    if (!enabled || !match || match.oleadas.length === 0) return;
    const { t0, ...log } = match;
    post(log);
  }

  function note(action, details = {}) {
    if (!match) startMatch();
    match.acciones.push({ t: elapsed(), antesDeOleada: (match.oleadas.at(-1)?.oleada ?? 0) + (wave ? 0 : 1), accion: action, ...details });
  }

  return {
    /** Si esta versión puede mandar partidas fuera del computador: entonces se pide permiso. */
    canShareRemotely: Boolean(remote),

    setEnabled(value) {
      enabled = Boolean(value);
    },

    /** Partida nueva: «Jugar de nuevo» o «Reiniciar todo». */
    restart() {
      save();
      startMatch();
    },

    note,

    handleEffects(effects, state) {
      currentState = state;
      if (wave && state.waveActive) wave.maximoALaVez = Math.max(wave.maximoALaVez, state.enemies.length);
      if (!match) startMatch();
      for (const effect of effects) {
        switch (effect.type) {
          case 'wave-started':
            wave = emptyWave(effect, state.towers, now() - match.t0);
            match.oleadas.push(wave);
            break;
          // Los soldados no salen de la cola de la oleada: bajan de una moto destruida.
          case 'enemy-spawned':
          case 'enemy-dismounted':
            if (!wave) break;
            enemyStats(effect.enemyTypeId).salieron += 1;
            if (effect.veterancy) wave.veteranos[effect.veterancy - 1] += 1;
            enemies.set(effect.enemyId, { type: effect.enemyTypeId, born: now() });
            break;
          case 'projectile-fired':
            if (!wave) break;
            towerStats(effect.towerId).tipo = effect.towerTypeId;
            towerStats(effect.towerId).disparos += 1;
            break;
          case 'enemy-dodged':
            if (wave) enemyStats(effect.enemyTypeId).esquivas = (enemyStats(effect.enemyTypeId).esquivas ?? 0) + 1;
            break;
          case 'missile-missed':
            if (wave) towerStats(effect.towerId).fallados += 1;
            break;
          case 'missile-intercepted':
            if (wave) towerStats(effect.towerId).interceptados = (towerStats(effect.towerId).interceptados ?? 0) + 1;
            break;
          case 'burn-damage': {
            // El napalm quema por zona: suma al daño de la torre y del enemigo, sin contar como impacto.
            if (!wave) break;
            for (const [enemyTypeId, damage] of Object.entries(effect.byEnemy)) {
              towerStats(effect.towerId).dano += damage;
              enemyStats(enemyTypeId).dano += damage;
            }
            break;
          }
          case 'hit': {
            if (!wave) break;
            const tower = towerStats(effect.towerId);
            tower.impactos += 1;
            tower.dano += effect.damage;
            const enemy = enemyStats(effect.enemyTypeId);
            enemy.impactos += 1;
            enemy.dano += effect.damage;
            if (effect.inCover) wave.rocas.impactosEnCobertura += 1;
            if (effect.exposed) wave.rocas.impactosExpuestos += 1;
            const key = `${effect.damageType} → ${effect.armorClass}`;
            const cell = (wave.danoPorImpacto[key] ??= { impactos: 0, danoBruto: 0, danoEfectivo: 0, sinDano: 0 });
            cell.impactos += 1;
            cell.danoBruto += effect.rawDamage;
            cell.danoEfectivo += effect.damage;
            if (effect.damage <= 0) cell.sinDano += 1;
            break;
          }
          case 'enemy-killed': {
            if (!wave) break;
            const enemy = enemyStats(effect.enemyTypeId);
            enemy.destruidos += 1;
            addFireDelay(effect);
            wave.recompensas += effect.reward ?? 0;
            if (effect.towerId) towerStats(effect.towerId).bajas += 1;
            const tracked = enemies.get(effect.enemyId);
            if (tracked) enemy.segundosVivo.push(round(now() - tracked.born));
            enemies.delete(effect.enemyId);
            break;
          }
          case 'vehicle-overheated': {
            if (!wave) break;
            const enemy = enemyStats(effect.enemyTypeId);
            enemy.recalentados = (enemy.recalentados ?? 0) + 1;
            break;
          }
          case 'enemy-leaked':
            if (!wave) break;
            enemyStats(effect.enemyTypeId).pasaron += 1;
            addFireDelay(effect);
            enemies.delete(effect.enemyId);
            break;
          case 'enemy-projectile-fired':
            if (!wave) break;
            if (effect.projectile === 'grenade') wave.granadas.lanzadas += 1;
            wave.vehiculos.disparos += 1;
            enemyStats(effect.enemyTypeId).disparos += 1;
            break;
          case 'tower-hit':
            if (!wave) break;
            // La onda del HE suma daño, no aciertos.
            if (!effect.splash) wave.vehiculos.impactos += 1;
            wave.vehiculos.dano += effect.damage;
            enemyStats(effect.enemyTypeId).danoATorres += effect.damage;
            towerStats(effect.towerId).danoRecibido += effect.damage;
            if (effect.weapon === 'grenade') {
              wave.granadas.torresAlcanzadas += 1;
              wave.granadas.dano += effect.damage;
            }
            break;
          case 'tower-destroyed':
            if (!wave) break;
            wave.vehiculos.torresDestruidas += 1;
            towerStats(effect.towerId).destruida = true;
            break;
          case 'air-shot-missed':
            if (wave) towerStats(effect.towerId).fallados += 1;
            break;
          case 'cover-hit':
            if (!wave) break;
            towerStats(effect.towerId).impactos += 1;
            wave.rocas.impactosAbsorbidos = (wave.rocas.impactosAbsorbidos ?? 0) + 1;
            break;
          case 'cover-removed': {
            const name = { rock: 'roca', tree: 'árbol', bush: 'arbusto' }[effect.kind];
            note(effect.cost ? `sacar ${name}` : `cae ${name}`, { celda: [effect.gx, effect.gy], costo: effect.cost });
            break;
          }
          case 'tower-placed':
            note('poner torre', { torre: effect.towerId, celda: [effect.gx, effect.gy], costo: effect.cost });
            break;
          case 'tower-upgraded':
            note('mejorar ataque', { torre: effect.towerId, nivel: effect.level + 1, costo: effect.cost });
            break;
          case 'tower-armored':
            note('mejorar blindaje', { torre: effect.towerId, nivel: effect.tier + 1, costo: effect.cost });
            break;
          case 'tower-sold':
            note('vender torre', { torre: effect.towerId, devolucion: effect.refund });
            break;
          case 'enemy-promoted':
            if (wave) wave.ascensos = (wave.ascensos ?? 0) + 1;
            break;
          case 'tower-armor-lost':
            if (wave) wave.vehiculos.blindajesRotos = (wave.vehiculos.blindajesRotos ?? 0) + 1;
            break;
          case 'wave-ended':
            if (!wave) break;
            wave.duracion = round(now() - match.t0 - wave.inicio);
            wave.vidasFin = effect.lives;
            wave.creditosFin = effect.credits;
            wave = null;
            save();
            break;
          case 'game-ended':
            if (wave) {
              wave.duracion = round(now() - match.t0 - wave.inicio);
              wave.vidasFin = effect.lives;
              wave.creditosFin = effect.credits;
              wave = null;
            }
            match.resultado = { victoria: effect.victory, oleada: effect.wave, vidas: effect.lives, creditos: effect.credits, segundos: elapsed() };
            save();
            break;
          default:
            break;
        }
      }
    },
  };
}
