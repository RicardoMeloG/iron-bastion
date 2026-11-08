// Revisión del build de producción (spec 001, T13, CA-6 y parte de CA-7).
//
//   npm run build && npm run check:dist
//
// Comprueba que dist/ pesa 25 MB o menos y lleva solo el juego (ni documentos, ni scripts,
// ni laboratorios, ni modelos que no se publican), y lo abre con vite preview en el Chrome
// instalado: sin errores en la consola, sin «Modo Desarrollo» ni window.__game, con la
// pantalla de inicio y con los modelos de los vehículos cargados al jugar una oleada. Deja una
// captura en walkthrough/produccion-1366x768.png.
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const DIST = 'dist';
const MAX_MB = 25;
const FORBIDDEN = [/\.md$/i, /^tools\//, /^scripts\//, /^docs\//, /^specs\//, /test-models/, /m163/i, /mg7_lvl\d\.glb$/];

if (!existsSync(DIST)) {
  console.error('No existe dist/: corre npm run build antes.');
  process.exit(1);
}

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push({ file: path.relative(DIST, full).split(path.sep).join('/'), bytes: statSync(full).size });
  }
};
walk(DIST);

const errors = [];
const totalMb = files.reduce((sum, entry) => sum + entry.bytes, 0) / 1024 / 1024;
if (totalMb > MAX_MB) errors.push(`dist/ pesa ${totalMb.toFixed(1)} MB (máximo ${MAX_MB})`);
for (const { file } of files) {
  if (FORBIDDEN.some((pattern) => pattern.test(file))) errors.push(`dist/ no debería llevar ${file}`);
}
console.log(`dist/: ${files.length} archivos, ${totalMb.toFixed(1)} MB`);

// Se sirve bajo una subcarpeta, como GitHub Pages (usuario.github.io/<repositorio>/).
const server = await preview({ logLevel: 'error', base: '/iron-bastion/', preview: { port: 0, strictPort: false } });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', (error) => errors.push(`error en la página: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`error en la consola: ${message.text()}`);
  });
  const models = new Set();
  page.on('response', (response) => {
    if (response.url().endsWith('.glb') && response.ok()) models.add(response.url().split('/').pop());
  });

  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('#start-screen.show');
  const page1 = await page.evaluate(() => ({
    devControls: Boolean(document.getElementById('dev-controls')),
    hook: 'window.__game' in window || Boolean(window.__game),
  }));
  if (page1.devControls) errors.push('«Modo Desarrollo» aparece en producción');
  if (page1.hook) errors.push('window.__game existe en producción');

  await page.click('#start-btn');
  await page.click('#wave-btn');
  await page.waitForTimeout(6000);
  if (models.size === 0) errors.push('no se cargó ningún modelo de vehículo');
  mkdirSync('walkthrough', { recursive: true });
  await page.screenshot({ path: 'walkthrough/produccion-1366x768.png' });
  console.log(`producción: inicio y oleada 1 sin «Modo Desarrollo» ni __game; modelos cargados: ${[...models].join(', ') || 'ninguno'}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

for (const error of errors) console.log(`✗ ${error}`);
if (errors.length) process.exit(1);
console.log('✓ El build de producción está limpio.');
