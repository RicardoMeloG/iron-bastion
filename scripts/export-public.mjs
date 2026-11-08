// Copia limpia del proyecto para publicarla (spec 001, T15, D-3).
//
//   node scripts/export-public.mjs <carpeta-destino> [--url=https://usuario.github.io/repo/]
//
// D-3 recomienda publicar un repositorio nuevo, sin el historial de este: el historial
// tiene correos personales y modelos extraídos de videojuegos (ver la spec). Este script no
// publica nada: copia los archivos versionados a una carpeta nueva, sin lo que no se puede
// publicar, y agrega el workflow de GitHub Pages. Publicar es un paso aparte, a mano.
//
// Se excluye todo modelo con "publish": false en su manifiesto (hoy, el M163): el manifiesto,
// su archivo fuente, su modelo normalizado y su rig. Con --url, el README queda con el enlace
// para jugar.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const MANIFESTS_DIR = 'tools/asset-pipeline/manifests';
// Lo mínimo indispensable (Ricardo, 08-11-2026): el juego y la evidencia técnica (pruebas,
// herramientas, ADR, arquitectura). Fuera: las specs con su historial, los originales de TRELLIS
// (el juego usa sus versiones reducidas de public/models/), los conceptos de IA, documentos
// viejos o de trabajo, y la MG-7 antigua con su laboratorio.
const PUBLIC_EXCLUDE = [
  'specs/', 'assets/source/', 'assets/concepts/', 'assets/models/', 'docs/evidence/', 'docs/history/',
  'docs/design/Iron_Bastion_GDD_v1.docx', 'docs/design/panel_inferior_concepto.png', 'tools/labs/asset-lab.',
  'scripts/blender_build_mg7.py', 'scripts/run-blender-export.mjs', '.mcp.json', 'CLAUDE.md',
];
// Textos que nombran lo excluido: [archivo, antes, después].
const PUBLIC_PATCHES = [
  ['package.json', '    "export:mg7-assets": "node scripts/run-blender-export.mjs",\n', ''],
  ['AGENTS.md', ', `/tools/labs/asset-lab.html`', ''],
  ['README.md', '; las decisiones, en `docs/decisions/`; y los planes, con cada tarea y lo que se encontró en el camino, en `specs/`.', ', y las decisiones, en `docs/decisions/`.'],
  ['README.en.md', '; the decisions, in `docs/decisions/`; and the plans, with every task and what was found along the way, in `specs/`.', ', and the decisions in `docs/decisions/`.'],
];
const destination = process.argv[2];
const url = process.argv.find((arg) => arg.startsWith('--url='))?.slice('--url='.length);

if (!destination || destination.startsWith('--')) {
  console.error('Uso: node scripts/export-public.mjs <carpeta-destino> [--url=https://usuario.github.io/repo/]');
  process.exit(1);
}
if (existsSync(destination) && readdirSync(destination).length > 0) {
  console.error(`${destination} ya existe y no está vacía.`);
  process.exit(1);
}

// Lo que no se publica, a partir de los manifiestos.
const excluded = new Set();
for (const name of readdirSync(MANIFESTS_DIR).filter((file) => file.endsWith('.json'))) {
  const manifest = JSON.parse(readFileSync(path.join(MANIFESTS_DIR, name), 'utf8'));
  if (manifest.publish !== false) continue;
  excluded.add(`${MANIFESTS_DIR}/${name}`);
  excluded.add(manifest.source);
  excluded.add(`assets/test-models/${manifest.id}.glb`);
  excluded.add(`src/content/rigs/${manifest.id}.json`);
}

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const files = tracked.filter((file) => !excluded.has(file) && !file.startsWith('assets/test-models/')
  && !PUBLIC_EXCLUDE.some((prefix) => file.startsWith(prefix)) && existsSync(file));
for (const file of files) {
  mkdirSync(path.join(destination, path.dirname(file)), { recursive: true });
  copyFileSync(file, path.join(destination, file));
}

// Workflow de GitHub Pages (D-4) y, si se pasó, el enlace para jugar.
mkdirSync(path.join(destination, '.github/workflows'), { recursive: true });
copyFileSync('tools/publish/pages.yml', path.join(destination, '.github/workflows/pages.yml'));
if (url) {
  for (const [file, before, after] of [
    ['README.md', /\*\*Jugar:\*\*.*/, `**Jugar:** [${url}](${url})`],
    ['README.en.md', /\*\*Play:\*\*.*/, `**Play:** [${url}](${url})`],
  ]) {
    const target = path.join(destination, file);
    const text = readFileSync(target, 'utf8');
    if (!before.test(text)) throw new Error(`${file} no tiene la línea del enlace`);
    writeFileSync(target, text.replace(before, after));
  }
}

for (const [file, before, after] of PUBLIC_PATCHES) {
  const target = path.join(destination, file);
  const text = readFileSync(target, 'utf8');
  const crlf = text.includes('\r\n');
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.includes(before)) throw new Error(`${file} no tiene el texto a ajustar: ${before.slice(0, 50)}`);
  const patched = normalized.replace(before, after);
  writeFileSync(target, crlf ? patched.replace(/\n/g, '\r\n') : patched);
}

const leaked = [...excluded].filter((file) => existsSync(path.join(destination, file)));
if (leaked.length) {
  console.error(`Se copiaron archivos que no se publican: ${leaked.join(', ')}`);
  process.exit(1);
}
console.log(`${files.length} archivos en ${destination}; quedaron fuera: ${[...excluded].join(', ')}.`);
console.log('Siguiente paso, a mano: git init, primer commit y subirlo a un repositorio nuevo; en él, activar Pages con «GitHub Actions».');
