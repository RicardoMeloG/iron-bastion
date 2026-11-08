// Graba el GIF de una partida para el README (spec 001, T14).
//
//   npm run record:gameplay        → docs/media/partida.gif
//
// Abre el juego en Chrome (servidor de desarrollo, sin sonido), arma torres de los cuatro tipos y de
// distintos niveles y juega una oleada con infantería, vehículos, tanques y drones, con la cámara un
// poco más cerca para que se vean las torretas apuntar. Toma los cuadros con el screencast de Chrome
// (CDP) y los arma con ffmpeg, que tiene que estar instalado y en el PATH.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const OUT = 'docs/media/partida.gif';
const TMP = 'walkthrough/video';
const SIZE = { width: 1280, height: 720 };
const RECORD_SECONDS = 16;

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(path.dirname(OUT), { recursive: true });

const server = await createServer({ logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
const frames = [];
try {
  const page = await browser.newPage({ viewport: SIZE });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__game?.state);
  await page.evaluate(() => {
    const { state, core, setMuted, setRecording, closeStartScreen } = window.__game;
    setMuted(true);
    setRecording(false);
    closeStartScreen();
    document.getElementById('dev-controls')?.remove();
    // En modo desarrollo la oleada 1 sale sola: se vuelve al comienzo antes de armar la escena.
    core.resetAll(state);
    state.credits = 1e6;
    // Torres de los cuatro tipos en celdas libres junto al camino, en el centro del mapa, separadas.
    const plan = [['mg7-vulcan', 4], ['lm2-lanza', 2], ['rk40-brasa', 1], ['mg7-vulcan', 2], ['lm2-lanza', 3], ['aa3-halcon', 1], ['mg7-vulcan', 0]];
    const grid = state.grid;
    const width = grid[0].length;
    const free = [];
    for (let gy = 1; gy < grid.length - 1; gy++) {
      for (let gx = Math.floor(width * 0.45); gx < Math.floor(width * 0.9); gx++) {
        const nextToPath = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[gy + dy]?.[gx + dx] === 1);
        if (grid[gy][gx] === 0 && nextToPath) free.push([gx, gy]);
      }
    }
    const chosen = [];
    for (const cell of free) {
      if (chosen.length === plan.length) break;
      if (chosen.every(([x, y]) => Math.abs(x - cell[0]) + Math.abs(y - cell[1]) >= 3)) chosen.push(cell);
    }
    chosen.forEach(([gx, gy], index) => {
      const [towerTypeId, upgrades] = plan[index];
      const tower = core.placeTower(state, { towerTypeId, gx, gy });
      for (let level = 0; tower && level < upgrades; level++) core.upgradeTower(state, tower.id);
    });
    state.credits = 180;
  });
  // Un poco de zoom sobre el centro del mapa.
  await page.mouse.move(SIZE.width / 2, SIZE.height / 2 - 60);
  for (let step = 0; step < 2; step++) await page.mouse.wheel(0, -240);
  await page.waitForTimeout(600);

  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = `${TMP}/cuadro-${String(frames.length).padStart(4, '0')}.jpg`;
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, time: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: SIZE.width, maxHeight: SIZE.height });
  await page.evaluate(() => {
    const spawns = ['infantry-mg', 'moto-recon', 'patrulla', 'infantry-mg', 'truck-transport', 'dron-fpv', 'apc-8x8', 'tank-heavy', 'dron-ala', 'infantry-mg', 'patrulla', 'tank-heavy'];
    if (!window.__game.core.startWave(window.__game.state, { overrideWaveDefinition: { interval: 0.7, spawns, veterancy: 1, infantryTeams: true } })) {
      throw new Error('no se pudo lanzar la oleada de la grabación');
    }
    // Al doble, para que en la grabación lleguen a las torres.
    window.__game.setSpeed(2);
  });
  await page.waitForTimeout(RECORD_SECONDS * 1000);
  await cdp.send('Page.stopScreencast');
} finally {
  await browser.close();
  await server.close();
}

// Cada cuadro dura hasta el siguiente: el screencast no entrega a ritmo fijo.
const lines = frames.slice(0, -1).flatMap((frame, index) => [
  `file '${path.basename(frame.file)}'`,
  `duration ${(frames[index + 1].time - frame.time).toFixed(4)}`,
]);
writeFileSync(`${TMP}/cuadros.txt`, `${lines.join('\n')}\n`);
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${TMP}/cuadros.txt`,
  '-vf', 'fps=12,scale=860:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
  '-loop', '0', OUT,
]);
rmSync(TMP, { recursive: true, force: true });
console.log(`GIF en ${OUT} (${frames.length} cuadros)`);
