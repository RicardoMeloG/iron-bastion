// Fronteras de arquitectura (docs/architecture.md, ADR 001 y ADR 002).
//
//   npm run check:boundaries
//
// Revisa los imports y algunas reglas de contenido en src/ y tools/. La deuda que ya
// existía está en scripts/checks/known-violations.json, cada una con la tarea que la
// elimina. Falla si aparece una violación nueva o si una conocida ya se resolvió y
// sigue en la lista (así la lista no miente).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOTS = ['src', 'tools', 'tests'];
const KNOWN_FILE = 'scripts/checks/known-violations.json';

// Qué capa puede importar a cuál. Ver docs/architecture.md.
const LAYERS = {
  core: ['core', 'content'],
  content: ['content'],
  audio: ['audio'],
  render: ['render', 'core', 'content'],
  ui: ['ui', 'core', 'content'],
  app: ['app', 'core', 'content', 'render', 'ui', 'audio'],
  tools: ['tools', 'app', 'core', 'content', 'render', 'ui', 'audio'],
  tests: ['tests', 'core', 'content', 'render', 'app', 'tools'],
};
const THREE_ALLOWED = new Set(['render', 'app', 'tools', 'tests']);

// ADR 001: el código del juego no calibra modelos uno por uno.
const CALIBRATION_KNOBS = /\b(assetRotation|headingOffset|headingOffsetAdjust|autoHeadingFromMuzzle|turretYawOffset|yawPivotMode|pitchPivotFromMuzzle|pitchAxis|pitchSign|skipWeaponNodeValidation)\b/;
const BROWSER_GLOBALS = /\b(window|document|requestAnimationFrame|localStorage)\b/;
const ASSET_REFERENCE = /['"`][^'"`]*\.(glb|gltf|mp3|wav|ogg|png|jpe?g)['"`]/;

function layerOf(file) {
  const parts = file.split('/');
  if (parts[0] === 'src') return parts[1];
  return parts[0];
}

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.(js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

const violations = [];
const report = (rule, file, line, detail) => violations.push({ rule, file, line, detail });

for (const file of ROOTS.flatMap(listFiles)) {
  const layer = layerOf(file);
  const allowed = LAYERS[layer];
  if (!allowed) {
    report('capa-desconocida', file, 1, `la carpeta "${layer}" no es una capa declarada`);
    continue;
  }
  const raw = readFileSync(file, 'utf8');
  const code = stripComments(raw);

  for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"]+)\1/g)) {
    const spec = match[2];
    const line = lineOf(code, match.index);
    if (spec.startsWith('.')) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      const targetLayer = layerOf(target);
      if (!allowed.includes(targetLayer)) {
        report('import-entre-capas', file, line, `${layer} no puede importar ${targetLayer} (${spec})`);
      }
    } else if (spec === 'three' || spec.startsWith('three/')) {
      if (!THREE_ALLOWED.has(layer)) report('three-fuera-de-render', file, line, `${layer} no puede usar three.js`);
    } else if (!spec.startsWith('node:') && layer !== 'tools' && layer !== 'tests') {
      report('dependencia-externa', file, line, `paquete no declarado en la arquitectura: ${spec}`);
    }
  }

  if (layer === 'core') {
    const m = code.match(BROWSER_GLOBALS);
    if (m) report('core-sin-navegador', file, lineOf(code, m.index), `el núcleo usa "${m[1]}"; debe correr en Node`);
  }
  if (layer === 'content') {
    const m = code.match(ASSET_REFERENCE);
    if (m) report('contenido-sin-assets', file, lineOf(code, m.index), `el contenido referencia un archivo visual o de audio: ${m[0]}`);
  }
  if (layer !== 'tests') {
    const m = code.match(CALIBRATION_KNOBS);
    if (m) report('sin-calibracion-por-modelo', file, lineOf(code, m.index), `ajuste por modelo "${m[1]}" (ADR 001)`);
  }
}

const known = JSON.parse(readFileSync(KNOWN_FILE, 'utf8'));
const key = (v) => `${v.rule}|${v.file}`;
const knownKeys = new Map(known.map((k) => [key(k), k]));
const foundKeys = new Set(violations.map(key));

const fresh = violations.filter((v) => !knownKeys.has(key(v)));
const resolved = known.filter((k) => !foundKeys.has(key(k)));
const pending = violations.filter((v) => knownKeys.has(key(v)));

const pendingByKey = [...new Set(pending.map(key))];
if (pendingByKey.length) {
  console.log(`Deuda conocida (${pendingByKey.length}), cada una con su tarea:`);
  for (const k of pendingByKey) {
    const entry = knownKeys.get(k);
    console.log(`  · ${entry.rule}  ${entry.file}  → ${entry.task}`);
  }
}

if (resolved.length) {
  console.log('\nResueltas, quítalas de scripts/checks/known-violations.json:');
  for (const k of resolved) console.log(`  ✓ ${k.rule}  ${k.file}  (${k.task})`);
}

if (fresh.length) {
  console.log('\nViolaciones nuevas:');
  for (const v of fresh) console.log(`  ✗ ${v.rule}  ${v.file}:${v.line}  ${v.detail}`);
}

if (fresh.length || resolved.length) {
  process.exit(1);
}
console.log('\nFronteras: sin violaciones nuevas.');
