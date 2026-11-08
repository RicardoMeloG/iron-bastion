// Genera public/vehicles/<id>.webp desde los modelos del juego. Correr al cambiar un vehículo:
//
//   node scripts/render-vehicle-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle'] });
const page = await browser.newPage();
await page.goto(`${server.resolvedUrls.local[0]}favicon.svg`);
const icons = await page.evaluate(async () => {
  const { renderVehicleIcons } = await import('/tools/labs/vehicle-icons.js');
  return renderVehicleIcons();
});
mkdirSync('public/vehicles', { recursive: true });
for (const [id, dataUrl] of Object.entries(icons)) {
  writeFileSync(`public/vehicles/${id}.webp`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`public/vehicles/${id}.webp`);
}
await browser.close();
await server.close();
