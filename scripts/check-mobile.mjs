// Abre el juego como en un teléfono (táctil, densidad de píxeles alta) y lo fotografía. En
// horizontal: inicio, partida con un toque para poner una torre, y una oleada en curso; en
// vertical, el aviso que pide girar el teléfono debe tapar todo. Mide
// los cuadros por segundo que da el navegador y falla si hay errores en la consola o si el toque
// no puso la torre. Deja las capturas en `walkthrough/movil-*.png`.
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const OUT = 'walkthrough';
const PHONES = [
  { name: 'horizontal', width: 915, height: 412 },
  // Pantalla completa de un Android angosto (la del dueño, 08-11): cuatro torres sin desplazarse.
  { name: 'horizontal-bajo', width: 800, height: 360 },
  { name: 'vertical', width: 412, height: 915 },
];

mkdirSync(OUT, { recursive: true });
const server = await createServer({ logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
const problems = [];

// Cuadros por segundo del navegador durante `ms` milisegundos.
const measureFps = (ms) =>
  new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - start < ms) requestAnimationFrame(tick);
      else resolve(Math.round((frames * 1000) / (performance.now() - start)));
    };
    requestAnimationFrame(tick);
  });

try {
  for (const phone of PHONES) {
    const context = await browser.newContext({
      viewport: { width: phone.width, height: phone.height },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => problems.push(`${phone.name}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`${phone.name}: ${message.text()}`);
    });

    await page.goto(base);
    await page.waitForFunction(() => window.__game, null, { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/movil-${phone.name}-inicio.png` });

    const rotateNotice = await page.locator('#rotate-notice').isVisible();
    if (phone.name === 'vertical') {
      if (!rotateNotice) problems.push('vertical: no aparece el aviso para girar el teléfono');
      console.log(`vertical ${phone.width}×${phone.height}: aviso para girar ${rotateNotice ? 'visible' : 'AUSENTE'}`);
      await context.close();
      continue;
    }
    if (rotateNotice) problems.push(`${phone.name}: el aviso para girar tapa el juego`);

    // Fuera de pantalla completa aparece el botón ⛶: con él, los botones del HUD deben caber, y en
    // su peor caso, en pausa, cuando «Pausa» pasa a decir «Continuar».
    await page.evaluate(() => window.__game.setPaused(true));
    const hudOverflow = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('#hud .hud-btn')]
      .filter((button) => !button.hidden)
      .map((button) => Math.ceil(button.getBoundingClientRect().right - window.innerWidth))));
    await page.evaluate(() => window.__game.setPaused(false));
    if (phone.name !== 'vertical' && hudOverflow > 0) problems.push(`${phone.name}: los botones del HUD se salen ${hudOverflow} px por la derecha`);
    // Entrar con «Jugar» como un jugador: en un teléfono, ese toque pide la pantalla completa.
    await page.evaluate(() => window.__game.setMuted(true));
    await page.getByText('Jugar', { exact: true }).tap();
    await page.waitForTimeout(800);
    const fullscreen = await page.evaluate(() => Boolean(document.fullscreenElement));
    console.log(`${phone.name}: pantalla completa al tocar «Jugar»: ${fullscreen ? 'sí' : 'no (Chrome sin pantalla puede negarla)'}`);

    const pixelRatio = await page.evaluate(() => window.__game.renderers && document.querySelector('#viewport canvas').width / document.querySelector('#viewport canvas').clientWidth);

    // Un toque en una celda libre junto al camino debe poner la torre elegida.
    const target = await page.evaluate(() => {
      const { state, camera } = window.__game;
      const canvas = document.querySelector('#viewport canvas');
      const rect = canvas.getBoundingClientRect();
      const { grid } = state;
      for (let y = 2; y < grid.length - 2; y++) {
        for (let x = 2; x < grid[0].length - 2; x++) {
          if (grid[y][x] !== 0) continue;
          if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy]?.[x + dx] === 1)) continue;
          const { halfWidth, halfHeight, worldScale } = state.config;
          const world = { x: (x - halfWidth + 0.5) * worldScale, z: (y - halfHeight + 0.5) * worldScale };
          const point = camera.position.clone();
          point.set(world.x, 0, world.z).project(camera);
          const px = rect.left + ((point.x + 1) / 2) * rect.width;
          const py = rect.top + ((1 - point.y) / 2) * rect.height;
          if (px > rect.left + 20 && px < rect.right - 20 && py > rect.top + 20 && py < rect.bottom - 20) return { x: px, y: py, gx: x, gy: y };
        }
      }
      return null;
    });
    // El contador más ancho posible («20/20») debe caber junto a «CONSTRUIR».
    const limitOverflow = await page.evaluate(() => {
      const count = document.getElementById('tower-count');
      const limit = document.getElementById('tower-limit');
      const saved = [count.textContent, limit.textContent];
      count.textContent = '20';
      limit.textContent = '20';
      const title = document.getElementById('tower-count-stat').parentElement;
      const overflow = title.scrollWidth - title.clientWidth;
      [count.textContent, limit.textContent] = saved;
      return overflow;
    });
    if (limitOverflow > 0) problems.push(`${phone.name}: «CONSTRUIR 20/20» se sale ${limitOverflow} px de su columna`);
    // El botón de la oleada va en una línea: con dos cifras («▶ Oleada 19 ahora») debe caber.
    const waveButtonOverflow = await page.evaluate(() => {
      const { state } = window.__game;
      const saved = state.wave;
      state.wave = 18;
      state.uiDirty = true;
      return new Promise((resolve) => setTimeout(() => {
        const button = document.getElementById('wave-btn');
        const overflow = button.scrollWidth - button.clientWidth;
        state.wave = saved;
        state.uiDirty = true;
        resolve(overflow);
      }, 300));
    });
    if (waveButtonOverflow > 0) problems.push(`${phone.name}: «Oleada 19 ahora» se sale ${waveButtonOverflow} px de su botón`);
    // Las cuatro tarjetas de torre deben verse enteras: si no, en el teléfono no hay cómo elegirlas.
    const hiddenCards = await page.evaluate(() => [...document.querySelectorAll('.tower-card')].filter((card) => {
      const rect = card.getBoundingClientRect();
      const box = card.parentElement.getBoundingClientRect();
      return rect.bottom > Math.min(box.bottom, window.innerHeight) + 1 || rect.height === 0;
    }).map((card) => card.dataset.towerTypeId));
    if (hiddenCards.length) problems.push(`${phone.name}: tarjetas cortadas: ${hiddenCards.join(', ')}`);
    if (!target) problems.push(`${phone.name}: no hay una celda libre visible para tocar`);
    else {
      await page.touchscreen.tap(target.x, target.y);
      await page.waitForTimeout(300);
      const placed = await page.evaluate(({ gx, gy }) => window.__game.state.towers.some((t) => t.gx === gx && t.gy === gy), target);
      if (!placed) problems.push(`${phone.name}: tocar la celda (${target.gx}, ${target.gy}) no puso la torre`);
    }
    await page.screenshot({ path: `${OUT}/movil-${phone.name}-toque.png` });

    await page.evaluate(() => window.__game.core.startWave(window.__game.state));
    await page.waitForTimeout(4000);
    const fps = await page.evaluate(measureFps, 3000);
    const { calls } = await page.evaluate(() => window.__game.renderInfo());
    await page.screenshot({ path: `${OUT}/movil-${phone.name}-oleada.png` });
    console.log(`${phone.name} ${phone.width}×${phone.height}: densidad del lienzo ${pixelRatio?.toFixed(2)}, ${fps} fps y ${calls} llamadas de dibujo en la oleada 1 (Chrome sin pantalla, no un teléfono real)`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (problems.length) {
  console.error(`\nProblemas:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Capturas en ${OUT}/movil-*.png`);
