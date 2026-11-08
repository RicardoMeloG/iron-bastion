// Importa un modelo generado con TRELLIS (spec 002) a assets/source/.
//
//   npm run assets:import -- <modelo de TRELLIS>.glb <id>
//
// TRELLIS entrega una sola malla con texturas WebP de color y de metal/rugosidad. El paso de
// estilo solo lee PNG y no usa metal ni rugosidad, así que aquí la textura de color pasa a PNG
// (con ffmpeg, que ya usa npm run record:gameplay) y se descarta la otra. La geometría no se
// toca: el corte en piezas y todo lo demás lo hace el normalizador según el manifiesto.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prune } from '@gltf-transform/functions';
import { createIO } from './rig.mjs';

const [input, id] = process.argv.slice(2);
if (!input || !id) {
  console.log('Uso: npm run assets:import -- <modelo de TRELLIS>.glb <id>');
  process.exit(1);
}

const io = createIO();
const document = await io.read(input);
const temp = mkdtempSync(path.join(tmpdir(), 'trellis-'));
try {
  for (const material of document.getRoot().listMaterials()) {
    const texture = material.getBaseColorTexture();
    if (texture && texture.getMimeType() !== 'image/png') {
      const original = path.join(temp, 'color.webp');
      const png = path.join(temp, 'color.png');
      writeFileSync(original, Buffer.from(texture.getImage()));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', original, png]);
      texture.setImage(new Uint8Array(readFileSync(png))).setMimeType('image/png').setURI('');
    }
    material.setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(0.9);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
for (const extension of document.getRoot().listExtensionsUsed()) {
  if (extension.extensionName === 'EXT_texture_webp') extension.dispose();
}
await document.transform(prune());
const output = path.join('assets/source', `${id}.glb`);
await io.write(output, document);
console.log(`${output} listo. Falta su manifiesto en tools/asset-pipeline/manifests/${id}.json (docs/asset-standard.md).`);
