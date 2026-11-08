// Paso de estilo del normalizador (spec 001, D-6).
//
// Deja un modelo en la estética del juego: colores planos de la paleta común
// (src/render/config/palette.js), sin texturas ni normales (three.js sombrea plano) y, si el
// manifiesto lo pide, con menos triángulos. Cada triángulo toma el color de su material
// (o de la textura, leída en su centro) y se lleva al color más cercano de la paleta.
//
// Manifiesto: "style": { "simplify": 0.15, "materials": { "nombre del material": "oliva" } }
// "brightness" aclara (> 1) u oscurece la textura antes de buscar el color de la paleta: las
// texturas que genera TRELLIS salen más oscuras que su imagen de concepto.
import { simplify, weld, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { PNG } from 'pngjs';
import { VEHICLE_PALETTE } from '../../src/render/config/palette.js';

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

// Distancia perceptual: CIELAB (D65) desde sRGB en 0..1.
function toLab([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const PALETTE = Object.entries(VEHICLE_PALETTE).map(([name, hex]) => {
  const srgb = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
  return { name, lab: toLab(srgb), linear: srgb.map(srgbToLinear) };
});

const inside = (value, [min, max]) => value >= min && value <= max;

function nearest(srgb, palette = PALETTE) {
  const lab = toLab(srgb);
  let best = palette[0];
  let bestDistance = Infinity;
  for (const entry of palette) {
    const d = (entry.lab[0] - lab[0]) ** 2 + (entry.lab[1] - lab[1]) ** 2 + (entry.lab[2] - lab[2]) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = entry;
    }
  }
  return best;
}

function decodeTexture(texture) {
  const mime = texture.getMimeType();
  if (mime !== 'image/png') throw new Error(`textura ${mime} sin decodificador (solo PNG)`);
  const png = PNG.sync.read(Buffer.from(texture.getImage()));
  return { width: png.width, height: png.height, data: png.data };
}

function sampleTexture(image, u, v) {
  const x = Math.min(image.width - 1, Math.floor((u - Math.floor(u)) * image.width));
  const y = Math.min(image.height - 1, Math.floor((v - Math.floor(v)) * image.height));
  const i = (y * image.width + x) * 4;
  return [image.data[i] / 255, image.data[i + 1] / 255, image.data[i + 2] / 255];
}

function countTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      total += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return total;
}

/** Simplifica sin borrar el límite entre colores: si no, un triángulo grande de arena toma el oscuro de una esquina. */
function simplifyKeepingColors(primitive, style, buffer, document) {
  MeshoptSimplifier.useExperimentalFeatures = true; // simplifyWithAttributes es experimental en meshoptimizer 0.22
  const positions = primitive.getAttribute('POSITION').getArray();
  const colors = primitive.getAttribute('COLOR_0').getArray();
  const indices = primitive.getIndices() ? Uint32Array.from(primitive.getIndices().getArray()) : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
  const target = Math.floor((indices.length * style.simplify) / 3) * 3;
  const [simplified] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, colors, 3, [1, 1, 1], null, target, style.simplifyError ?? 0.02);
  primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(Uint32Array.from(simplified)).setBuffer(buffer));
}

export async function applyStyle(document, style, log) {
  const buffer = document.getRoot().listBuffers()[0];
  const flat = document.createMaterial('paleta').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0.05);
  const decoded = new Map();
  const fixedColors = style.materials ?? {};
  const brightness = style.brightness ?? 1;
  // "palette" limita los colores posibles: en una textura de TRELLIS, un tono claro de arena
  // podría caer en una luz ámbar y una sombra, en vidrio.
  // "meshPalette" la cambia por pieza: la oliva de los tubos, en la base saldría como manchas.
  const paletteOf = (mesh) => {
    const names = style.meshPalette?.[mesh.getName()] ?? style.palette;
    return names ? PALETTE.filter((entry) => names.includes(entry.name)) : PALETTE;
  };
  const primitives = document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
  // "paint" pinta de un color un tramo de una pieza, en coordenadas de esa pieza: lo que el
  // concepto no muestra, como la espalda de un bloque, TRELLIS lo inventa con manchas.
  const paintOf = new Map(document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives().map((primitive) => [primitive, (style.paint ?? []).filter((paint) => paint.mesh === mesh.getName())])));
  const paletteOfPrimitive = new Map(document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives().map((primitive) => [primitive, paletteOf(mesh)])));
  // Si el original dibuja sus caras por ambos lados, el material plano también: si no,
  // las caras con la orientación invertida desaparecen y dejan huecos.
  if (primitives.some((primitive) => primitive.getMaterial()?.getDoubleSided())) flat.setDoubleSided(true);

  // 1. Cada vértice toma su color de la paleta y se descarta el resto (UV, normales,
  //    tangentes). Así los vértices de una costura de textura vuelven a ser uno solo y el
  //    simplificador puede trabajar sobre la malla continua.
  for (const primitive of primitives) {
    const material = primitive.getMaterial();
    const fixed = fixedColors[material?.getName() ?? ''];
    if (fixed && !VEHICLE_PALETTE[fixed]) throw new Error(`"${fixed}" no es un color de la paleta`);
    const factor = material ? material.getBaseColorFactor() : [1, 1, 1, 1];
    const texture = !fixed && material?.getBaseColorTexture();
    if (texture && !decoded.has(texture)) decoded.set(texture, decodeTexture(texture));
    const image = texture ? decoded.get(texture) : null;
    const uvs = primitive.getAttribute('TEXCOORD_0')?.getArray();
    const count = primitive.getAttribute('POSITION').getCount();
    const colors = new Float32Array(count * 3);
    const positions = primitive.getAttribute('POSITION').getArray();
    for (let i = 0; i < count; i++) {
      let entry;
      const paint = paintOf.get(primitive).find((range) => ['x', 'y', 'z'].every((axis, k) => !range[axis] || inside(positions[i * 3 + k], range[axis])));
      if (fixed || paint) {
        entry = PALETTE.find((candidate) => candidate.name === (fixed || paint.color));
      } else {
        let linear = factor.slice(0, 3);
        if (image && uvs) linear = sampleTexture(image, uvs[i * 2], uvs[i * 2 + 1]).map((value, k) => srgbToLinear(Math.min(1, value * brightness)) * factor[k]);
        entry = nearest(linear.map(linearToSrgb), paletteOfPrimitive.get(primitive));
      }
      colors.set(entry.linear, i * 3);
    }
    for (const semantic of primitive.listSemantics()) if (semantic !== 'POSITION') primitive.setAttribute(semantic, null);
    primitive.setAttribute('COLOR_0', document.createAccessor().setType('VEC3').setArray(colors).setBuffer(buffer));
    primitive.setMaterial(flat);
  }

  // 2. Soldar y simplificar.
  const before = countTriangles(document);
  await document.transform(weld());
  if (style.simplify) {
    await MeshoptSimplifier.ready;
    if (style.keepColorBorders) {
      for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) simplifyKeepingColors(primitive, style, buffer, document);
    } else {
      await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio: style.simplify, error: style.simplifyError ?? 0.02 }));
    }
  }
  log.push(`triángulos: ${before} → ${countTriangles(document)}`);

  // 3. Un color por triángulo (el que más se repite entre sus vértices) y sin normales:
  //    three.js sombrea plano cuando el modelo no las trae, como el mapa y la MG-7. Los
  //    triángulos del mismo color comparten vértices, así el archivo pesa poco (T13).
  const usage = new Map();
  const nameOf = new Map(PALETTE.map((entry) => [Array.from(Float32Array.from(entry.linear)).join(','), entry.name]));
  for (const primitive of document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives())) {
    const positions = primitive.getAttribute('POSITION').getArray();
    const colors = primitive.getAttribute('COLOR_0').getArray();
    const indices = primitive.getIndices()?.getArray() ?? Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
    const vertexOf = new Map();
    const outPositions = [];
    const outColors = [];
    const outIndices = [];
    for (let t = 0; t < indices.length / 3; t++) {
      const corners = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];
      const keys = corners.map((i) => `${colors[i * 3]},${colors[i * 3 + 1]},${colors[i * 3 + 2]}`);
      const key = keys[1] === keys[2] ? keys[1] : keys[0];
      const name = nameOf.get(key) ?? '?';
      usage.set(name, (usage.get(name) ?? 0) + 1);
      const color = key.split(',').map(Number);
      for (const corner of corners) {
        const vertexKey = `${corner}|${key}`;
        if (!vertexOf.has(vertexKey)) {
          vertexOf.set(vertexKey, outPositions.length / 3);
          outPositions.push(positions[corner * 3], positions[corner * 3 + 1], positions[corner * 3 + 2]);
          outColors.push(...color);
        }
        outIndices.push(vertexOf.get(vertexKey));
      }
    }
    const vertexCount = outPositions.length / 3;
    primitive.setAttribute('NORMAL', null);
    primitive.setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(new Float32Array(outPositions)).setBuffer(buffer));
    primitive.setAttribute('COLOR_0', document.createAccessor().setType('VEC3').setArray(new Float32Array(outColors)).setBuffer(buffer));
    const IndexArray = vertexCount < 65536 ? Uint16Array : Uint32Array;
    primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(IndexArray.from(outIndices)).setBuffer(buffer));
  }

  await document.transform(prune({ keepLeaves: true }));
  const total = [...usage.values()].reduce((sum, count) => sum + count, 0);
  const shares = [...usage.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count / total >= 0.005)
    .map(([name, count]) => `${name} ${Math.round((count / total) * 100)} %`)
    .join(', ');
  log.push(`paleta: ${shares}`);
}
