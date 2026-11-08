// Fortificación del blindaje de las torres, hecha por código: un anillo que va en el suelo
// alrededor de la torre, separado de ella, así que le sirve a cualquiera (src/render/
// tower-renderer.js lo escala según su tamaño). Escribe assets/source/blindaje-n1.glb (sacos)
// y blindaje-n2.glb (barreras de hormigón, placas y sacos), que luego pasan por npm run
// assets:normalize como cualquier otro modelo. Diseño: assets/concepts/blindaje-*.jpg.
//
//   node tools/asset-pipeline/make-blindaje.mjs
import { Document, NodeIO } from '@gltf-transform/core';

const COLORS = {
  saco: [0.72, 0.42, 0.15],
  hormigon: [0.22, 0.2, 0.19],
  placa: [0.05, 0.05, 0.055],
};
// Medidas en un anillo de 1 de diámetro; el normalizador lo deja igual.
// Sacos grandes: a la distancia del juego, uno pequeño no se distingue. Los dos niveles tienen
// el mismo hueco adentro, así que se escalan igual.
const BAG = { length: 0.15, width: 0.085, height: 0.05 };
const RING = { rows: 2 };
const OUTER_RADIUS = 0.5;

// Azar con semilla: el modelo sale siempre igual y los sacos no quedan todos alineados.
let seed = 7;
const jitter = (amount) => {
  seed = (seed * 16807) % 2147483647;
  return ((seed / 2147483647) * 2 - 1) * amount;
};

class MeshBuilder {
  constructor() {
    this.positions = [];
    this.indices = [];
  }

  /** Prisma de planta rectangular por capas: cada capa es [y, escala de la planta]. */
  loft({ center, yaw, length, width, layers }) {
    const first = this.positions.length / 3;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // Esquinas achaflanadas: la planta es un octógono alargado.
    const outline = [[-1, -0.55], [-0.72, -1], [0.72, -1], [1, -0.55], [1, 0.55], [0.72, 1], [-0.72, 1], [-1, 0.55]];
    for (const [y, scale] of layers) {
      for (const [a, b] of outline) {
        const along = (a * scale * length) / 2;
        const across = (b * scale * width) / 2;
        this.positions.push(center[0] + along * cos + across * sin, center[1] + y, center[2] - along * sin + across * cos);
      }
    }
    const sides = outline.length;
    for (let layer = 0; layer < layers.length - 1; layer++) {
      for (let i = 0; i < sides; i++) {
        const a = first + layer * sides + i;
        const b = first + layer * sides + ((i + 1) % sides);
        const c = a + sides;
        const d = b + sides;
        this.indices.push(a, c, b, b, c, d);
      }
    }
    const top = first + (layers.length - 1) * sides;
    for (let i = 1; i < sides - 1; i++) {
      this.indices.push(top, top + i + 1, top + i);
      this.indices.push(first, first + i, first + i + 1);
    }
  }
}

/** Un saco: panzudo al medio y aplastado arriba. */
function addBag(builder, angle, radius, y) {
  const center = [Math.sin(angle) * radius + jitter(0.003), y, Math.cos(angle) * radius + jitter(0.003)];
  builder.loft({
    center,
    yaw: angle + jitter(0.07),
    length: BAG.length * (1 + jitter(0.06)),
    width: BAG.width,
    layers: [[0, 0.8], [BAG.height * 0.45, 1], [BAG.height * 0.8, 0.92], [BAG.height, 0.68]],
  });
}

function addBagRing(builder, radius, rows, baseY = 0) {
  const perRow = Math.round((Math.PI * 2 * radius) / (BAG.length * 0.96));
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < perRow; i++) {
      addBag(builder, ((i + (row % 2) * 0.5) / perRow) * Math.PI * 2, radius, baseY + row * BAG.height * 0.92);
    }
  }
}

/** Barrera de hormigón: base ancha y tope angosto. */
function addBarrier(builder, angle, radius, length) {
  builder.loft({
    center: [Math.sin(angle) * radius, 0, Math.cos(angle) * radius],
    yaw: angle,
    length,
    width: 0.09,
    layers: [[0, 1], [0.018, 1], [0.05, 0.62], [0.125, 0.48]],
  });
}

function addPlate(builder, angle, radius, length) {
  builder.loft({
    center: [Math.sin(angle) * radius, 0.03, Math.cos(angle) * radius],
    yaw: angle,
    length,
    width: 0.012,
    layers: [[0, 1], [0.06, 1]],
  });
}

async function write(id, parts) {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene(id);
  for (const [name, builder] of Object.entries(parts)) {
    const material = document.createMaterial(name).setBaseColorFactor([...COLORS[name], 1]);
    const primitive = document.createPrimitive()
      .setMaterial(material)
      .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(new Float32Array(builder.positions)).setBuffer(buffer))
      .setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(builder.indices)).setBuffer(buffer));
    scene.addChild(document.createNode(name).setMesh(document.createMesh(name).addPrimitive(primitive)));
  }
  await new NodeIO().write(`assets/source/${id}.glb`, document);
  console.log(`assets/source/${id}.glb: ${Object.values(parts).reduce((sum, part) => sum + part.indices.length / 3, 0)} triángulos`);
}

// Nivel 1: anillo cerrado de sacos, ajustado por fuera para medir 1 de diámetro.
const sacos = new MeshBuilder();
addBagRing(sacos, OUTER_RADIUS - BAG.width / 2, RING.rows);
await write('blindaje-n1', { saco: sacos });

// Nivel 2: un octógono de barreras de hormigón con placas, en el lugar de los sacos, y sacos
// apilados en cada unión.
const SIDES = 8;
const sacos2 = new MeshBuilder();
const hormigon = new MeshBuilder();
const placas = new MeshBuilder();
const apothem = OUTER_RADIUS - 0.045;
const side = 2 * apothem * Math.tan(Math.PI / SIDES);
for (let i = 0; i < SIDES; i++) {
  const angle = (i / SIDES) * Math.PI * 2;
  addBarrier(hormigon, angle, apothem, side * 0.86);
  addPlate(placas, angle, apothem + 0.032, side * 0.26);
  const corner = angle + Math.PI / SIDES;
  for (let row = 0; row < 3; row++) {
    addBag(sacos2, corner, apothem / Math.cos(Math.PI / SIDES) - 0.03, row * BAG.height * 0.92);
  }
}
await write('blindaje-n2', { saco: sacos2, hormigon, placa: placas });
