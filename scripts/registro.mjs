// Informe de una partida registrada (spec 002).
//
//   npm run registro                   la última partida de logs/
//   npm run registro -- logs/x.json    una en particular
//
// Lee el registro que guarda el juego en local (src/app/match-recorder.js) y muestra, por
// oleada: composición, vehículos destruidos y que pasaron, daño efectivo según munición y
// blindaje, puntería de torres y vehículos, economía y acciones del jugador.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const LOGS_DIR = 'logs';
const argument = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
let file = argument;
if (!file) {
  const logs = existsSync(LOGS_DIR) ? readdirSync(LOGS_DIR).filter((name) => name.endsWith('.json')) : [];
  if (logs.length === 0) {
    console.log('No hay partidas en logs/. Juega en npm run dev o en vite preview y vuelve a correrlo.');
    process.exit(0);
  }
  file = path.join(LOGS_DIR, logs.sort((a, b) => statSync(path.join(LOGS_DIR, b)).mtimeMs - statSync(path.join(LOGS_DIR, a)).mtimeMs)[0]);
}

const log = JSON.parse(readFileSync(file, 'utf8'));
const pct = (part, total) => (total > 0 ? `${Math.round((part / total) * 100)} %` : '-');
const avg = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const fmt = (value, digits = 1) => (value === null || value === undefined ? '-' : value.toFixed(digits));

console.log(`Partida ${log.id} (${file})`);
if (log.resultado) {
  const { victoria, oleada, vidas, creditos, segundos } = log.resultado;
  console.log(`Resultado: ${victoria ? 'victoria' : 'derrota'} en la oleada ${oleada}, ${vidas} vidas, $${creditos} sin gastar, ${Math.round(segundos / 60)} min`);
} else {
  console.log('Resultado: partida sin terminar');
}

const actionsBefore = (wave) => log.acciones.filter((action) => action.antesDeOleada === wave);
for (const wave of log.oleadas) {
  console.log(`\n== Oleada ${wave.oleada}  (${fmt(wave.duracion, 0)} s)  vidas ${wave.vidasInicio} → ${wave.vidasFin ?? '?'}  créditos ${wave.creditosInicio} → ${wave.creditosFin ?? '?'}  recompensas $${wave.recompensas}`);
  const actions = actionsBefore(wave.oleada);
  if (actions.length) {
    const spent = actions.reduce((sum, action) => sum + (action.costo ?? 0), 0);
    const counts = {};
    for (const action of actions) counts[action.accion] = (counts[action.accion] ?? 0) + 1;
    console.log(`  Antes de empezar: ${Object.entries(counts).map(([name, count]) => `${count} × ${name}`).join(', ')}; gastó $${spent}`);
  }
  console.log(`  Torres: ${wave.torres.map((tower) => `A${tower.ataque}/B${tower.blindaje}`).join(' ') || 'ninguna'}`);
  console.log('  Unidad                   salieron  destruidos  pasaron  impactos  daño/impacto  segundos vivo  disparos  daño a torres');
  for (const [type, stats] of Object.entries(wave.enemigos)) {
    console.log(`  ${type.padEnd(24)} ${String(stats.salieron).padStart(8)}  ${String(stats.destruidos).padStart(10)}  ${String(stats.pasaron).padStart(7)}  ${String(stats.impactos).padStart(8)}  ${fmt(stats.impactos ? stats.dano / stats.impactos : null).padStart(12)}  ${fmt(avg(stats.segundosVivo)).padStart(13)}  ${String(stats.disparos ?? 0).padStart(8)}  ${String(Math.round(stats.danoATorres ?? 0)).padStart(13)}`);
  }
  const cells = Object.entries(wave.danoPorImpacto);
  if (cells.length) {
    console.log('  Daño por impacto (munición → blindaje): ' + cells.map(([key, cell]) => `${key}: ${fmt(cell.danoEfectivo / cell.impactos)} de ${fmt(cell.danoBruto / cell.impactos)}${cell.sinDano ? `, ${pct(cell.sinDano, cell.impactos)} sin daño` : ''}`).join(' · '));
  }
  // Por tipo de torre (los registros anteriores al LM-2 no traen el tipo: eran todas MG-7).
  const byType = {};
  for (const tower of Object.values(wave.torresStats)) {
    const type = (byType[tower.tipo ?? 'mg7-vulcan'] ??= { disparos: 0, impactos: 0, fallados: 0, bajas: 0, dano: 0 });
    for (const key of Object.keys(type)) type[key] += tower[key] ?? 0;
  }
  const towerLines = Object.entries(byType).map(([type, t]) => `${type}: ${t.disparos} disparos, ${t.impactos || !(t.bajas || t.dano) ? `${pct(t.impactos, t.disparos)} de acierto` : `daño por zona, ${fmt(t.dano, 0)} de daño`}${t.fallados ? `, ${t.fallados} fallados` : ''}${t.interceptados ? `, ${t.interceptados} interceptados` : ''}, ${t.bajas} bajas`);
  console.log(`  Puntería de torres: ${towerLines.join(' · ') || 'sin disparos'}`);
  if (wave.maximoALaVez) console.log(`  A la vez: hasta ${wave.maximoALaVez} enemigos`);
  if (wave.veteranos?.some(Boolean)) console.log(`  Veteranos: ${wave.veteranos.map((count, level) => `${count} de nivel ${level + 1}`).join(', ')}`);
  if (wave.ascensos) console.log(`  Ganaron veteranía por destruir torres: ${wave.ascensos}`);
  if (wave.vehiculos.blindajesRotos) console.log(`  Blindajes rotos por drones: ${wave.vehiculos.blindajesRotos}`);
  const delayed = Object.entries(wave.enemigos).filter(([, stats]) => stats.retrasoFuego > 0);
  if (delayed.length) {
    const total = delayed.reduce((sum, [, stats]) => sum + stats.retrasoFuego, 0);
    console.log(`  Napalm a vehículos: ${fmt(total)} s de retraso en total · ` + delayed.map(([type, stats]) => `${type}: ${stats.recalentados ?? 0} veces recalentado, ${fmt(stats.retrasoFuego)} s`).join(' · '));
  }
  if (wave.granadas?.lanzadas) console.log(`  Granadas: ${wave.granadas.lanzadas} lanzadas, ${wave.granadas.torresAlcanzadas} torres alcanzadas, ${fmt(wave.granadas.dano, 0)} de daño`);
  if (wave.rocas?.impactosEnCobertura || wave.rocas?.impactosExpuestos) console.log(`  Cobertura: ${wave.rocas.impactosEnCobertura} impactos a soldados en roca, ${wave.rocas.impactosExpuestos ?? 0} a expuestos en la calle`);
  const dodged = Object.values(wave.enemigos).reduce((sum, stats) => sum + (stats.esquivas ?? 0), 0);
  if (dodged) console.log(`  Misiles esquivados: ${dodged}`);
  console.log(`  Vehículos: ${wave.vehiculos.disparos} disparos, ${pct(wave.vehiculos.impactos, wave.vehiculos.disparos)} de acierto, ${fmt(wave.vehiculos.dano, 0)} de daño, ${wave.vehiculos.torresDestruidas} torres destruidas`);
}
