// Sonda de puntería (spec 001, T10, CA-2).
//
//   npm run check:aim
//
// Levanta el juego en el Chrome instalado (sin sonido), pone torres y juega una oleada con
// todos los tipos de enemigo armados usando window.__game. En cada disparo mide, sobre lo
// que se dibuja en ese cuadro:
//   - la distancia entre donde nace la bala (núcleo) y la boca del cañón dibujado;
//   - el ángulo entre el cañón dibujado de un vehículo y la torre a la que dispara (su eje, a
//     media altura).
// Pasa si cada tipo armado dispara, el 95 % de sus disparos tiene el cañón a 10° o menos de
// la torre y ninguna bala nace a más de 0,05 unidades de la boca (también las de la MG-7 y
// los misiles de la LM-2).
// Es la medición del 2026-11-02 (cañones que no apuntaban, balas que no salían del cañón)
// convertida en chequeo.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { enemyDefinitions } from '../src/content/enemies/index.js';

const MAX_ANGLE_DEG = 10;
const MIN_SOLDIER_DISTANCE = 2;
const MIN_SHARE = 0.95;
const MAX_MUZZLE_GAP = 0.05;
// Tirado o de rodilla, la simulación da una altura aproximada: hasta 0,15 celdas.
const MAX_PRONE_GAP = 1.5;
const MIN_SHOTS = 5;
// El RPG dispara cada 4 s y un soldado cruza el alcance una sola vez: alcanza para pocos tiros.
const MIN_SHOTS_BY_TYPE = { 'infantry-rpg': 3 };
const PLAY_SECONDS = 60;

const armedTypes = Object.values(enemyDefinitions).filter((definition) => definition.combatModel.isArmed).map((definition) => definition.id);

const server = await createServer({ logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
const problems = [];
let samples = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__game?.state);

  await page.evaluate(({ spawns, playSeconds }) => {
    const { state, core, renderers, setMuted, setRecording, closeStartScreen } = window.__game;
    setMuted(true);
    setRecording(false);
    closeStartScreen(); // la pantalla de inicio pausa la simulación
    state.credits = 99999;
    // Cuatro torres junto al camino, que aguanten toda la oleada.
    const grid = state.grid;
    let count = 0;
    for (let y = 0; y < grid.length && count < 4; y++) {
      for (let x = 0; x < grid[0].length && count < 4; x++) {
        if (grid[y][x] !== 0) continue;
        const nextToPath = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy]?.[x + dx] === 1);
        if (nextToPath && (x + y) % 3 === 0 && core.placeTower(state, { gx: x, gy: y })) count++;
      }
    }
    // Y dos junto a la línea recta de la entrada a la base, por donde cruza la infantería.
    core.placeTower(state, { gx: 11, gy: 4 });
    core.placeTower(state, { gx: 16, gy: 7 });
    // Y dos LM-2, para medir también de dónde sale el misil.
    let launchers = 0;
    for (let y = 0; y < grid.length && launchers < 2; y++) {
      for (let x = 0; x < grid[0].length && launchers < 2; x++) {
        if (grid[y][x] !== 0) continue;
        const nextToPath = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy]?.[x + dx] === 1);
        if (nextToPath && (x + y) % 3 === 1 && core.placeTower(state, { towerTypeId: 'lm2-lanza', gx: x, gy: y })) launchers++;
      }
    }
    for (const tower of state.towers) tower.hp = tower.maxHp = 1e9;

    // Cada disparo se mide en el cuadro en que ocurre, ya con las unidades dibujadas.
    window.__aimSamples = [];
    const { enemyRenderer, towerRenderer, projectileRenderer } = renderers;
    const original = projectileRenderer.handleEffects.bind(projectileRenderer);
    const center = (object) => {
      object.updateMatrixWorld(true);
      const box = new object.position.constructor();
      const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      object.traverse((node) => {
        if (!node.isMesh || !node.visible || !node.geometry) return;
        node.geometry.computeBoundingBox();
        const b = node.geometry.boundingBox;
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
          box.set(x, y, z).applyMatrix4(node.matrixWorld);
          ['x', 'y', 'z'].forEach((axis, i) => {
            bounds.min[i] = Math.min(bounds.min[i], box[axis]);
            bounds.max[i] = Math.max(bounds.max[i], box[axis]);
          });
        }
      });
      return box.set(...bounds.min.map((value, i) => (value + bounds.max[i]) / 2));
    };
    projectileRenderer.handleEffects = (effects, ...rest) => {
      for (const effect of effects) {
        if (effect.type === 'enemy-projectile-fired') {
          if (effect.projectile === 'grenade') continue; // sale de la mano, no de la boca
          const enemy = state.enemies.find((item) => item.id === effect.enemyId);
          const mesh = enemyRenderer.meshes.get(effect.enemyId);
          if (!enemy || !mesh) continue; // el modelo todavía no cargó
          if (!enemy.targetTowerId) continue; // le dispara a una roca: acá se mide contra las torres
          // Se mide ya tirado, de rodilla o de pie, no a medio gesto.
          const prone = mesh.userData.prone ?? 0;
          if (prone > 0.05 && prone < 0.95) continue;
          if ((mesh.userData.kneel ?? 0) > 0.05 && mesh.userData.kneel < 0.9) continue;
          mesh.updateMatrixWorld(true);
          const muzzle = mesh.userData.rig.muzzles[effect.fireIndex % mesh.userData.rig.muzzles.length];
          const drawn = muzzle.getWorldPosition(muzzle.position.clone());
          const direction = muzzle.getWorldDirection(muzzle.position.clone());
          // El objetivo es el eje de la torre a media altura: el centro de su caja se corre hacia
          // donde apuntan sus cañones.
          const towerEntry = towerRenderer.meshes.get(enemy.targetTowerId);
          const target = center(towerEntry.mesh);
          target.x = towerEntry.root.position.x;
          target.z = towerEntry.root.position.z;
          // Distancia de la boca a la torre, en celdas, para explicar un disparo desviado.
          const distance = drawn.distanceTo(target) / state.config.worldScale;
          const toTower = target.sub(drawn).normalize();
          window.__aimSamples.push({
            type: enemy.proneSeconds > 0 && !(enemy.kneelSeconds > 0) ? `${enemy.enemyTypeId} tirado` : enemy.enemyTypeId,
            gap: drawn.distanceTo(effect.position),
            angle: (Math.acos(Math.min(1, direction.dot(toTower))) * 180) / Math.PI,
            distance,
            elevation: (enemy.aimPitch * 180) / Math.PI,
          });
        } else if (effect.type === 'projectile-fired') {
          const entry = towerRenderer.meshes.get(effect.towerId);
          entry.root.updateMatrixWorld(true);
          const drawn = towerRenderer.getMuzzleWorldPosition(effect.towerId, effect.fireIndex);
          if (!drawn) continue; // el modelo de la torre todavía no cargó
          window.__aimSamples.push({ type: effect.towerTypeId, gap: drawn.distanceTo(effect.position), angle: null });
        }
      }
      return original(effects, ...rest);
    };

    core.startWave(state, { overrideWaveDefinition: { interval: 1.1, spawns } });
    // Un disparo mata a un soldado sin cobertura: al principio las torres no tiran, para que alcancen
    // a disparar. Al encontrar blanco, uno de cada dos se tira, y se mide aparte.
    const startedAt = performance.now();
    const seen = new Set();
    const counts = {};
    const hold = setInterval(() => {
      const holding = performance.now() - startedAt < (playSeconds * 1000) * (2 / 3);
      for (const tower of state.towers) tower.cooldown = holding ? 999 : 0;
      if (!holding) return clearInterval(hold);
      for (const soldier of state.enemies) {
        if (soldier.armorClass !== 'infantry' || !soldier.targetTowerId || seen.has(soldier.id)) continue;
        seen.add(soldier.id);
        counts[soldier.enemyTypeId] = (counts[soldier.enemyTypeId] ?? 0) + 1;
        if (counts[soldier.enemyTypeId] % 2) soldier.proneSeconds = 1e3;
      }
    }, 50);
  }, { spawns: [...armedTypes, ...armedTypes, ...armedTypes], playSeconds: PLAY_SECONDS });

  await page.waitForTimeout(PLAY_SECONDS * 1000);
  samples = await page.evaluate(() => window.__aimSamples);
} finally {
  await browser.close();
  await server.close();
}

let failed = problems.length > 0;
for (const problem of problems) console.log(`✗ error en la página: ${problem}`);
for (const type of [...armedTypes, 'infantry-mg tirado', 'mg7-vulcan', 'lm2-lanza']) {
  const shots = samples.filter((sample) => sample.type === type);
  const worstGap = Math.max(0, ...shots.map((shot) => shot.gap));
  // Un soldado pegado a la torre: el ángulo lo domina la altura de ella, y no dice nada de su arma.
  const aimed = shots.filter((shot) => shot.angle !== null && !(type.startsWith('infantry-') && shot.distance < MIN_SOLDIER_DISTANCE));
  const within = aimed.filter((shot) => shot.angle <= MAX_ANGLE_DEG).length;
  const share = aimed.length ? within / aimed.length : 1;
  const errors = [];
  const minShots = MIN_SHOTS_BY_TYPE[type] ?? MIN_SHOTS;
  if (shots.length < minShots) errors.push(`solo ${shots.length} disparos medidos (mínimo ${minShots})`);
  if (worstGap > (type.endsWith(' tirado') || type === 'infantry-rpg' ? MAX_PRONE_GAP : MAX_MUZZLE_GAP)) errors.push(`una bala nació a ${worstGap.toFixed(3)} de la boca`);
  if (share < MIN_SHARE) errors.push(`${Math.round(share * 100)} % de disparos con el cañón a ${MAX_ANGLE_DEG}° o menos`);
  const angleText = aimed.length ? `, cañón a ≤${MAX_ANGLE_DEG}° en ${Math.round(share * 100)} % (peor ${Math.max(...aimed.map((shot) => shot.angle)).toFixed(1)}°)` : '';
  console.log(`${errors.length ? '✗' : '✓'} ${type.padEnd(22)} ${String(shots.length).padStart(3)} disparos, bala a ≤${worstGap.toFixed(3)} de la boca${angleText}`);
  for (const error of errors) console.log(`    ${error}`);
  for (const shot of aimed.filter((item) => item.angle > MAX_ANGLE_DEG)) {
    console.log(`    desviado ${shot.angle.toFixed(1)}°: boca a ${shot.distance.toFixed(2)} celdas de la torre, cañón a ${shot.elevation.toFixed(1)}°`);
  }
  if (errors.length) failed = true;
}
if (failed) process.exit(1);
