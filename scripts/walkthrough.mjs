// Recorrido visual (definición de terminado en AGENTS.md; spec 001, CA-5 y CA-7).
//
//   npm run walkthrough
//   npm run walkthrough -- --viewport=1366x768
//
// Levanta el servidor de desarrollo y abre el juego en el Chrome instalado (sin sonido). En
// cada tamaño de pantalla: fotografía la pantalla de inicio, entra con «Jugar», pone torres,
// juega hasta la oleada 3 mejorándolas entre oleadas, y después fuerza una victoria (la
// última oleada con un solo vehículo) y una derrota (una vida y ninguna torre), siempre con
// la lógica del núcleo. Falla si la página registra errores. Las capturas quedan en
// walkthrough/ (fuera de git) para que alguien las mire antes de cerrar una tarea: que el
// script pase no prueba que el juego se vea bien.
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const OUT = 'walkthrough';
const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]?.split(',') ?? fallback;
const viewports = option('viewport', ['1440x900', '1366x768']);
const SPEED = 4; // pasos de simulación por cuadro mientras se juegan las oleadas
const WAVE_TIMEOUT_MS = 90_000;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = await createServer({ logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
const problems = [];

// Pone torres junto al camino hasta `count`, y con lo que sobra mejora la más débil.
const buildAndUpgrade = (count) => {
  const { state, core } = window.__game;
  const grid = state.grid;
  // Con dinero de sobra y en el centro del mapa, por donde cruza la infantería: acá se mira cómo
  // se ve el combate, no se juega la economía.
  state.credits = Math.max(state.credits, 2000);
  for (let y = 3; y < 9 && state.towers.length < count; y++) {
    for (let x = 0; x < grid[0].length && state.towers.length < count; x++) {
      if (grid[y][x] !== 0) continue;
      const nextToPath = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy]?.[x + dx] === 1);
      if (nextToPath && (x + y) % 3 === 0) core.placeTower(state, { gx: x, gy: y });
    }
  }
  for (;;) {
    const weakest = [...state.towers].sort((a, b) => a.level - b.level)[0];
    if (!weakest || !core.upgradeTower(state, weakest.id)) break;
  }
  return state.towers.length;
};

try {
  for (const viewport of viewports) {
    const [width, height] = viewport.split('x').map(Number);
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (error) => problems.push(`${viewport}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`${viewport}: ${message.text()}`);
    });
    const shot = (name) => page.screenshot({ path: `${OUT}/${viewport}-${name}.png` });
    const waitWaveEnd = () => page.waitForFunction(() => !window.__game.state.waveActive || window.__game.state.gameOver, null, { timeout: WAVE_TIMEOUT_MS });

    await page.goto(base);
    await page.waitForFunction(() => window.__game?.state);
    await page.evaluate(() => {
      window.__game.setMuted(true);
      window.__game.setRecording(false);
    });
    await page.waitForTimeout(1200);
    await shot('1-inicio');

    await page.click('#start-btn');
    await page.waitForTimeout(300);
    await shot('2-mapa');

    // Cada tarjeta elige su torre y queda marcada.
    for (const card of await page.$$('.tower-card')) {
      await card.click();
      const { active, chosen, id } = await card.evaluate((element) => ({
        id: element.dataset.towerTypeId,
        active: element.classList.contains('active'),
        chosen: window.__game.state.buildTowerTypeId,
      }));
      if (!active || chosen !== id) problems.push(`${viewport}: la tarjeta ${id} no quedó elegida (elegida: ${chosen})`);
    }
    await page.click('.tower-card');

    // Oleadas 1 a 3, mejorando las torres entre oleadas.
    const waves = [];
    for (let wave = 1; wave <= 3; wave++) {
      const towers = await page.evaluate(buildAndUpgrade, 5);
      await page.evaluate((speed) => {
        window.__game.setSpeed(speed);
        window.startWave();
      }, SPEED);
      if (wave === 1) {
        await page.waitForTimeout(2500);
        await shot('3-combate');
      }
      await waitWaveEnd();
      const status = await page.evaluate(() => {
        const { state } = window.__game;
        return { lives: state.lives, credits: state.credits, gameOver: state.gameOver };
      });
      waves.push({ wave, towers, ...status });
      if (status.gameOver) break;
    }
    await page.evaluate(() => window.__game.setSpeed(1));
    await page.waitForTimeout(400);
    await shot('4-oleada-3');

    // Victoria: la última oleada, con un solo vehículo.
    await page.evaluate(() => window.resetAll());
    await page.evaluate(() => {
      const { state, setSpeed } = window.__game;
      state.wave = state.config.waveSet.waves.length - 1;
      setSpeed(4);
    });
    await page.evaluate(buildAndUpgrade, 4);
    await page.evaluate(() => window.__game.core.startWave(window.__game.state, { overrideWaveDefinition: { spawns: ['patrulla'] } }));
    await page.waitForFunction(() => window.__game.state.victory, null, { timeout: WAVE_TIMEOUT_MS });
    await page.waitForTimeout(400);
    await shot('5-victoria');

    // Derrota: «Jugar de nuevo» desde el aviso, una vida y ninguna torre.
    await page.click('#overlay button:last-of-type');
    await page.evaluate(() => {
      window.__game.state.lives = 1;
      window.startWave();
    });
    await page.waitForFunction(() => window.__game.state.gameOver && !window.__game.state.victory, null, { timeout: WAVE_TIMEOUT_MS });
    await page.waitForTimeout(400);
    await shot('6-derrota');

    console.log(`${viewport}: ${waves.map((w) => `oleada ${w.wave} con ${w.towers} torres → ${w.lives} vidas, $${w.credits}`).join(' · ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (problems.length) {
  console.error('\nErrores en la página:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`\nCapturas en ${OUT}/. Míralas antes de cerrar la tarea.`);
