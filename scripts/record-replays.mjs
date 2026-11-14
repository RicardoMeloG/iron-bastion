// Graba partidas reales en Chrome para probar la repetición sin pantalla (spec 003, corte 4; T05).
//
//   node scripts/record-replays.mjs [--partidas=5] [--segundos=150]
//   npm run simulate -- --repetir logs/partida-*.json
//
// Levanta el servidor de desarrollo (puerto libre al azar) y juega cada partida en una pestaña
// nueva, por la misma vía que el jugador (`window.__game.order`, que aplica la orden con
// applyOrder y la deja en el registro con su paso). Cada partida tiene su propio estilo, velocidad
// (x1, x2 o x3) y ritmo de órdenes en tiempo real, así que los pasos de las órdenes dependen de los
// cuadros del navegador, como con una persona. El registro llega a logs/ al terminar cada oleada.
// Imprime los archivos grabados.
import { readdirSync, statSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const option = (name, fallback) => Number(process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const MATCHES = option('partidas', 5);
const SECONDS = option('segundos', 150);

// Estilos de partida: velocidad, pausa entre órdenes (ms) y qué prefiere.
const STYLES = [
  { speed: 1, pauseMs: 700, early: 0.3, upgrade: 0.5, armor: 0.1, sell: 0.02, clear: 0.05, types: ['mg7-vulcan'] },
  { speed: 2, pauseMs: 400, early: 0.6, upgrade: 0.3, armor: 0.2, sell: 0.05, clear: 0.02, retry: true, types: ['mg7-vulcan', 'lm2-lanza'] },
  { speed: 3, pauseMs: 250, early: 0.8, upgrade: 0.6, armor: 0.1, sell: 0.03, clear: 0.0, types: ['mg7-vulcan', 'rk40-brasa', 'lm2-lanza'] },
  { speed: 2, pauseMs: 900, early: 0.1, upgrade: 0.2, armor: 0.3, sell: 0.0, clear: 0.1, types: ['mg7-vulcan', 'aa3-halcon', 'lm2-lanza'] },
  { speed: 3, pauseMs: 150, early: 0.9, upgrade: 0.7, armor: 0.0, sell: 0.1, clear: 0.05, retry: true, types: ['lm2-lanza', 'mg7-vulcan'] },
];

// Una orden al azar (con la semilla de la partida) según el estilo; corre en la página.
function act({ style, roll }) {
  const { state, order } = window.__game;
  const [r1, r2, r3, r4] = roll;
  const grid = state.grid;
  if (state.gameOver) return 'fin';
  const towers = state.towers;
  // Un reintento de oleada por partida, en los estilos que lo piden: prueba que resetWave también se repite igual.
  if (style.retry && state.waveActive && state.lives < 12 && !window.__retried) {
    window.__retried = true;
    return order({ tipo: 'reintentar' }) ? 'reintentar' : 'nada';
  }
  // Sin torres no tiene sentido adelantar la oleada: primero construye.
  if (towers.length >= 2 && !state.waveActive && r1 < style.early) return order({ tipo: 'oleada' }) ? 'oleada' : 'nada';
  if (towers.length >= 3 && r2 < style.sell) {
    const t = towers[Math.floor(r3 * towers.length)];
    return order({ tipo: 'vender', celda: [t.gx, t.gy] }) ? 'vender' : 'nada';
  }
  if (towers.length && r2 < style.sell + style.upgrade) {
    // Mejora la que pueda pagar, empezando por una al azar.
    const tipo = r4 < style.armor ? 'blindaje' : 'ataque';
    const start = Math.floor(r3 * towers.length);
    for (let i = 0; i < towers.length; i++) {
      const t = towers[(start + i) % towers.length];
      if (order({ tipo, celda: [t.gx, t.gy] })) return tipo;
    }
  }
  const covers = [...state.rocks, ...state.trees];
  if (r2 > 1 - style.clear && covers.length) {
    const c = covers[Math.floor(r3 * covers.length)];
    return order({ tipo: 'despejar', celda: [c.gx, c.gy] }) ? 'despejar' : 'nada';
  }
  // Celdas libres que cubren más camino (como haría una persona), y entre las diez mejores una al azar.
  const cells = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (grid[y][x] !== 0) continue;
      let coverage = 0;
      for (let py = Math.max(0, y - 3); py <= Math.min(grid.length - 1, y + 3); py++) {
        for (let px = Math.max(0, x - 3); px <= Math.min(grid[0].length - 1, x + 3); px++) {
          if (grid[py][px] === 1 && Math.hypot(px - x, py - y) <= 3.2) coverage++;
        }
      }
      cells.push({ cell: [x, y], coverage });
    }
  }
  cells.sort((a, b) => b.coverage - a.coverage);
  cells.length = Math.min(cells.length, 10);
  if (!cells.length) return 'nada';
  const torre = style.types[Math.floor(r4 * style.types.length)];
  return order({ tipo: 'torre', torre, celda: cells[Math.floor(r3 * cells.length)].cell }) ? 'torre' : 'nada';
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const logsBefore = new Set((() => { try { return readdirSync('logs'); } catch { return []; } })());
const server = await createServer({ logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
const problems = [];

try {
  for (let index = 0; index < MATCHES; index++) {
    const style = STYLES[index % STYLES.length];
    const random = seeded(1000 + index);
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.on('pageerror', (error) => problems.push(`partida ${index + 1}: ${error.message}`));
    await page.goto(base);
    await page.waitForFunction(() => window.__game?.order);
    await page.evaluate((speed) => {
      window.__game.setMuted(true);
      window.__game.closeStartScreen();
      window.__game.setSpeed(speed);
    }, style.speed);
    const counts = {};
    const started = Date.now();
    while (Date.now() - started < SECONDS * 1000) {
      const result = await page.evaluate(act, { style, roll: [random(), random(), random(), random()] });
      if (result === 'fin') break;
      counts[result] = (counts[result] ?? 0) + 1;
      await page.waitForTimeout(style.pauseMs * (0.5 + random()));
    }
    const summary = await page.evaluate(() => ({ wave: window.__game.state.wave, lives: window.__game.state.lives, over: window.__game.state.gameOver }));
    console.log(`partida ${index + 1}: x${style.speed}, oleada ${summary.wave}, ${summary.lives} vidas${summary.over ? ' (terminó)' : ''} · ${JSON.stringify(counts)}`);
    // Deja llegar el último envío al servidor.
    await page.waitForTimeout(500);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const recorded = (() => { try { return readdirSync('logs'); } catch { return []; } })().filter((name) => !logsBefore.has(name)).sort((a, b) => statSync(`logs/${a}`).mtimeMs - statSync(`logs/${b}`).mtimeMs);
console.log(`\nGrabadas: ${recorded.map((name) => `logs/${name}`).join(' ')}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
}
