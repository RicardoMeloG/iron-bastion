// Modelos por código (ADR 003): corre los guiones de Blender, deja cada GLB en public/models/ y su
// rig en src/content/rigs/, y los pasa por el mismo validador que un modelo normalizado.
//
//   npm run assets:code
//
// Blender se busca en BLENDER_PATH y, si no está, en la carpeta de instalación de Windows.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CODE_MODEL_PALETTE } from '../../src/render/config/palette.js';
import { createIO, computeRigMetadata } from './rig.mjs';
import { validateDocument } from './validate-rig.mjs';

const MODELS_DIR = 'public/models';
const RIGS_DIR = 'src/content/rigs';
const SCRIPTS = [
  { script: 'tools/asset-pipeline/blender/rk40.py', ids: [1, 2, 3, 4, 5].map((level) => `rk40-brasa-n${level}`) },
  { script: 'tools/asset-pipeline/blender/patrulla.py', ids: ['patrulla', 'patrulla-ametralladora', 'patrulla-misil', 'patrulla-misiles'] },
  { script: 'tools/asset-pipeline/blender/tanque.py', ids: ['tank-heavy'] },
  { script: 'tools/asset-pipeline/blender/vehiculos.py', ids: ['apc-8x8', 'camion-tropas', 'camion-tropas-destruido'] },
  { script: 'tools/asset-pipeline/blender/soldado.py', ids: ['infanteria-ametralladora', 'infanteria-rpg'] },
  { script: 'tools/asset-pipeline/blender/moto.py', ids: ['moto-recon', 'moto-recon-n1', 'moto-recon-n2', 'moto-recon-n3'] },
  { script: 'tools/asset-pipeline/blender/torres.py', ids: ['mg7', 'lm2-lanza', 'aa3-halcon'].flatMap((tower) => [1, 2, 3, 4, 5].map((level) => `${tower}-n${level}`)) },
];
// `npm run assets:code -- patrulla` genera solo los guiones cuyo nombre contenga esa palabra.
const only = process.argv.slice(2);

function findBlender() {
  if (process.env.BLENDER_PATH) return process.env.BLENDER_PATH;
  const base = 'C:/Program Files/Blender Foundation';
  const versions = existsSync(base) ? readdirSync(base).sort().reverse() : [];
  if (!versions.length) throw new Error('no se encontró Blender: instálalo o define BLENDER_PATH');
  return path.join(base, versions[0], 'blender.exe');
}

const blender = findBlender();
const io = createIO();
let failed = 0;
for (const { script, ids } of SCRIPTS.filter(({ script }) => !only.length || only.some((word) => script.includes(word)))) {
  execFileSync(blender, ['-b', '--python-exit-code', '1', '--python', script, '--', MODELS_DIR, JSON.stringify(CODE_MODEL_PALETTE)], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (const id of ids) {
    const document = await io.read(path.join(MODELS_DIR, `${id}.glb`));
    const rig = computeRigMetadata(document, { id, source: script });
    const errors = validateDocument(document, rig);
    // Cada boca lleva su cohete: el render los oculta por número al disparar.
    const names = document.getRoot().listNodes().map((node) => node.getName());
    const rockets = names.filter((name) => /^rocket_\d{2}$/.test(name)).length;
    if (rockets && rockets !== rig.muzzles.length) errors.push(`${rockets} cohetes para ${rig.muzzles.length} bocas`);
    writeFileSync(path.join(RIGS_DIR, `${id}.json`), `${JSON.stringify(rig, null, 2)}\n`);
    console.log(`${errors.length ? '✗' : '✓'} ${id}  ←  ${script}`);
    for (const error of errors) console.log(`    ✗ ${error}`);
    if (errors.length) failed++;
  }
}
if (failed) process.exit(1);
