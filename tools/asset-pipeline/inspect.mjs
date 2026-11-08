// Inspector de modelos: muestra la jerarquía, las posiciones de mundo y las medidas de
// un glTF. Sirve para escribir el manifiesto de un modelo nuevo (docs/asset-standard.md).
//
//   npm run assets:inspect -- assets/source/m163a2-vads.glb
//   npm run assets:inspect -- archivo.glb --filtro=turret|gun|muzzle
import { Vector3 } from 'three';
import { createIO, meshBounds, worldPosition } from './rig.mjs';

const file = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const filterArg = process.argv.find((arg) => arg.startsWith('--filtro='))?.split('=')[1];
const filter = filterArg ? new RegExp(filterArg, 'i') : null;
if (!file) {
  console.log('Uso: npm run assets:inspect -- archivo.glb [--filtro=expresión]');
  process.exit(1);
}

const document = await createIO().read(file);
const fmt = (v) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
const all = meshBounds(document);
const size = all.getSize(new Vector3());
console.log(`${file}`);
console.log(`  caja: min ${fmt(all.min)}  max ${fmt(all.max)}  tamaño ${fmt(size)}`);
console.log(`  extensiones: ${document.getRoot().listExtensionsUsed().map((e) => e.extensionName).join(', ') || 'ninguna'}`);
console.log(`  pieles: ${document.getRoot().listSkins().length}, animaciones: ${document.getRoot().listAnimations().length}\n`);

function visit(node, depth) {
  const name = node.getName() || '(sin nombre)';
  const children = node.listChildren();
  const show = !filter || filter.test(name);
  if (show) {
    const parts = [`${'  '.repeat(depth)}${name}`];
    parts.push(`origen ${fmt(worldPosition(node))}`);
    const [x, y, z, w] = node.getRotation();
    if (Math.abs(w) < 0.9999) parts.push(`rot [${[x, y, z, w].map((n) => n.toFixed(3)).join(', ')}]`);
    const scale = node.getScale();
    if (scale.some((s) => Math.abs(s - 1) > 1e-4)) parts.push(`escala [${scale.map((n) => n.toFixed(2)).join(', ')}]`);
    const subtree = meshBounds(document, node);
    if (!subtree.isEmpty()) parts.push(`caja ${fmt(subtree.min)} → ${fmt(subtree.max)}`);
    if (node.getMesh()) parts.push('[malla]');
    console.log(parts.join('  '));
  }
  for (const child of children) visit(child, show ? depth + 1 : depth);
}

for (const scene of document.getRoot().listScenes()) {
  for (const node of scene.listChildren()) visit(node, 0);
}
