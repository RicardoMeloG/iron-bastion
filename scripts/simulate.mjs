// Simulación de balance sin pantalla (spec 001, CA-4).
//
//   npm run simulate              tabla por estrategia y oleada
//   npm run simulate -- --json    lo mismo en JSON, para otros scripts
//
// Las estrategias están en tools/balance/strategies.mjs; tests/balance.test.js exige sus
// metas: quien evoluciona sus torres gana, y poner muchas básicas no alcanza. Antes muestra lo
// que rinde cada nivel por crédito (tools/balance/level-value.mjs).
import { towerDefinitions } from '../src/content/towers/index.js';
import { levelValueAgainstBasic } from '../tools/balance/level-value.mjs';
import { runAll, runSeeds } from '../tools/balance/strategies.mjs';

const asJson = process.argv.includes('--json');
const results = runAll();

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const targets = ['infantry-mg', 'moto-recon', 'patrulla', 'apc-8x8', 'tank-heavy'];
  for (const tower of Object.values(towerDefinitions)) {
    console.log(`\n${tower.shortName}: daño por segundo y rendimiento por crédito contra poner torres de nivel 1`);
    console.log(`  nivel  costo total  ${targets.map((id) => id.padStart(16)).join('')}`);
    tower.levels.forEach((_, index) => {
      const cells = targets.map((id) => {
        const row = levelValueAgainstBasic(tower, id)[index];
        return `${row.damagePerSecond.toFixed(0).padStart(5)}${row.againstBasic === null ? '     -' : `${row.againstBasic.toFixed(2).padStart(6)}x`}`.padStart(16);
      });
      console.log(`  ${String(index + 1).padStart(5)}  ${String(levelValueAgainstBasic(tower, targets[0])[index].totalCost).padStart(11)}  ${cells.join('')}`);
    });
  }
  for (const r of results) {
    console.log(`\n== ${r.strategy}: ${r.result} (llegó a la oleada ${r.lastWave})`);
    for (const w of r.waves) {
      const percent = (value) => (value === null ? '  -  ' : `${(value * 100).toFixed(0).padStart(3)} %`);
      const accuracy = percent(w.accuracy);
      console.log(
        `  oleada ${String(w.wave).padStart(2)}  enemigos ${String(w.enemies).padStart(2)}  vidas -${String(w.livesLost).padStart(2)} → ${String(w.lives).padStart(2)}  créditos ${String(w.credits).padStart(4)}  árboles ${String(w.treesLeft).padStart(2)}  a la vez ${String(w.peakAlive).padStart(2)}  torres ${String(w.towers).padStart(2)} (${String(w.towersDestroyed).padStart(2)} caídas)  aciertos torres ${accuracy}  vehículos ${percent(w.enemyAccuracy)}`,
      );
    }
  }
  // El resultado es caótico: cambios mínimos lo mueven mucho, así que importa más esto que una corrida.
  const { runs, wins, lives, medianLives } = runSeeds('partida-real');
  console.log(`
== partida-real con ${runs.length} órdenes de enemigos: gana ${wins}, mediana de ${medianLives} vidas (${lives.join(', ')})`);
}
