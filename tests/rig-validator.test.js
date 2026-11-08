import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import { Document } from '@gltf-transform/core';
import { computeRigMetadata } from '../tools/asset-pipeline/rig.mjs';
import { validateDocument } from '../tools/asset-pipeline/validate-rig.mjs';

// Caja de malla con su base en y = 0, centrada en x y z, del tamaño pedido.
function box(document, name, size, offset = [0, 0, 0]) {
  const [sx, sy, sz] = size.map((value) => value / 2);
  const [ox, oy, oz] = offset;
  const corners = [];
  for (const x of [-sx, sx]) for (const y of [0, 2 * sy]) for (const z of [-sz, sz]) corners.push(x + ox, y + oy, z + oz);
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  const positions = document.createAccessor().setType('VEC3').setArray(new Float32Array(corners)).setBuffer(buffer);
  const indices = document.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7])).setBuffer(buffer);
  const primitive = document.createPrimitive().setAttribute('POSITION', positions).setIndices(indices);
  return document.createMesh(name).addPrimitive(primitive);
}

// Vehículo que cumple el estándar: chasis de largo 1, torreta y un cañón hacia +Z.
function compliantVehicle({ armed = true } = {}) {
  const document = new Document();
  const root = document.createNode('unit_root');
  const hull = document.createNode('hull').setMesh(box(document, 'hull-mesh', [0.5, 0.3, 1]));
  root.addChild(hull);
  if (armed) {
    const turret = document.createNode('turret_yaw').setTranslation([0, 0.3, -0.05]);
    turret.setMesh(box(document, 'turret-mesh', [0.25, 0.1, 0.25]));
    const gun = document.createNode('gun_pitch').setTranslation([0, 0.06, 0.05]);
    gun.setMesh(box(document, 'gun-mesh', [0.04, 0.04, 0.3], [0, -0.02, 0.15]));
    const muzzle = document.createNode('muzzle_01').setTranslation([0, 0, 0.3]);
    gun.addChild(muzzle);
    turret.addChild(gun);
    root.addChild(turret);
  }
  document.createScene().addChild(root);
  return document;
}

test('un vehículo que cumple el estándar no tiene errores', () => {
  const document = compliantVehicle();
  const rig = computeRigMetadata(document, { id: 'prueba', source: 'sintético' });
  assert.deepEqual(validateDocument(document, rig), []);
});

test('un vehículo sin arma solo necesita unit_root y hull', () => {
  const document = compliantVehicle({ armed: false });
  const rig = computeRigMetadata(document, { id: 'prueba', source: 'sintético' });
  assert.equal(rig.muzzles, undefined);
  assert.deepEqual(validateDocument(document, rig), []);
});

test('la torreta con rotación propia se rechaza (regla 2)', () => {
  const document = compliantVehicle();
  const turret = document.getRoot().listNodes().find((node) => node.getName() === 'turret_yaw');
  turret.setRotation([Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
  const errors = validateDocument(document, null);
  assert.ok(errors.some((error) => error.startsWith('regla 2') && error.includes('turret_yaw')));
});

test('el pivote heredado de un padre rotado hace que la boca cambie de altura al girar (regla 5)', () => {
  const document = compliantVehicle();
  const root = document.getRoot().listNodes().find((node) => node.getName() === 'unit_root');
  root.setRotation([0.2588, 0, 0, 0.9659]); // 30° sobre X, como los nodos Z-up del M163
  const errors = validateDocument(document, null);
  assert.ok(errors.some((error) => error.startsWith('regla 5')));
});

test('un cañón que apunta hacia atrás se rechaza (reglas 4 y 6)', () => {
  const document = compliantVehicle();
  const muzzle = document.getRoot().listNodes().find((node) => node.getName() === 'muzzle_01');
  muzzle.setTranslation([0, 0, -0.3]);
  const errors = validateDocument(document, null);
  assert.ok(errors.some((error) => error.startsWith('regla 4')));
  assert.ok(errors.some((error) => error.startsWith('regla 6')));
});

test('modelo fuera de escala o desplazado se rechaza (regla 3)', () => {
  const document = compliantVehicle();
  const hull = document.getRoot().listNodes().find((node) => node.getName() === 'hull');
  hull.setTranslation([0.3, -0.5, 0]);
  const errors = validateDocument(document, null);
  assert.ok(errors.some((error) => error.includes('la base está')));
  assert.ok(errors.some((error) => error.includes('el centro del chasis está')));
});

test('metadatos que no coinciden con el modelo se rechazan (regla 7)', () => {
  const document = compliantVehicle();
  const rig = computeRigMetadata(document, { id: 'prueba', source: 'sintético' });
  rig.muzzles = [[0, 0.36, 0.9]];
  assert.ok(validateDocument(document, rig).some((error) => error.startsWith('regla 7') && error.includes('muzzles')));
  assert.ok(validateDocument(document, undefined).some((error) => error.includes('no existe su archivo')));
});

// El normalizador debe arreglar un modelo mal armado: ejes Z-up, frente en -Y, torreta
// mirando hacia el costado y montada bajo el chasis, como venían los originales.
test('el normalizador deja en el estándar un modelo Z-up con la torreta girada y bajo el chasis', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createIO } = await import('../tools/asset-pipeline/rig.mjs');
  const { normalize } = await import('../tools/asset-pipeline/normalize.mjs');

  const document = new Document();
  const root = document.createNode('vehiculo').setRotation([Math.SQRT1_2, 0, 0, Math.SQRT1_2]); // Z-up → Y-up en la raíz
  const body = document.createNode('carroceria').setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]).setScale([3, 3, 3]);
  body.setMesh(box(document, 'carroceria', [0.5, 1.4, 0.4])); // largo en Y, alto en Z
  const turret = document.createNode('torre').setTranslation([0, 0.2, -0.3]);
  turret.setMesh(box(document, 'torre', [0.3, 0.3, 0.1]));
  const gun = document.createNode('arma').setTranslation([0, 0.2, -0.25]);
  gun.setMesh(box(document, 'canon', [0.4, 0.03, 0.03], [0.2, 0, 0])); // apunta a +X: hacia el costado
  const tip = document.createNode('punta').setTranslation([0.4, 0.2, -0.25]);
  turret.addChild(gun);
  body.addChild(turret);
  body.addChild(tip);
  root.addChild(body);
  document.createScene().addChild(root);

  const folder = mkdtempSync(join(tmpdir(), 'rig-'));
  try {
    const source = join(folder, 'fuente.glb');
    await createIO().write(source, document);
    const manifest = { id: 'prueba', source, forward: '-y', up: '+z', turret: 'torre', gun: 'arma', muzzles: ['punta'], turretMount: 'roof' };
    const { document: normalized, rig, log } = await normalize(manifest);
    assert.deepEqual(validateDocument(normalized, rig), []);
    assert.ok(log.some((line) => line.startsWith('torreta llevada al frente')));
    assert.ok(log.some((line) => line.startsWith('torreta montada sobre el techo')));
    assert.ok(rig.muzzles[0][2] > rig.gunPivot[2], 'la boca queda delante del pivote');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('el paso de estilo deja colores de la paleta, sin texturas, y el modelo sigue en el estándar', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createIO } = await import('../tools/asset-pipeline/rig.mjs');
  const { normalize } = await import('../tools/asset-pipeline/normalize.mjs');
  const { VEHICLE_PALETTE } = await import('../src/render/config/palette.js');

  const document = compliantVehicle();
  const sand = document.createMaterial('carroceria').setBaseColorFactor([0.38, 0.29, 0.17, 1]);
  const white = document.createMaterial('blanco').setBaseColorFactor([0.8, 0.8, 0.8, 1]);
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) primitive.setMaterial(mesh.getName() === 'gun-mesh' ? white : sand);
  }
  const folder = mkdtempSync(join(tmpdir(), 'estilo-'));
  try {
    const source = join(folder, 'fuente.glb');
    await createIO().write(source, document);
    const manifest = {
      id: 'estilo', source, forward: '+z', up: '+y', turret: 'turret_yaw', gun: 'gun_pitch', muzzles: ['muzzle_01'],
      style: { materials: { blanco: 'metalOscuro' } },
    };
    const { document: styled, rig } = await normalize(manifest);
    assert.deepEqual(validateDocument(styled, rig), []);
    assert.equal(styled.getRoot().listTextures().length, 0);
    assert.deepEqual(styled.getRoot().listMaterials().map((material) => material.getName()), ['paleta']);

    const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const paletteLinear = Object.values(VEHICLE_PALETTE).map((hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => Math.fround(toLinear(v / 255))));
    for (const mesh of styled.getRoot().listMeshes()) {
      const colors = mesh.listPrimitives()[0].getAttribute('COLOR_0').getArray();
      for (let i = 0; i < colors.length; i += 3) {
        const color = [colors[i], colors[i + 1], colors[i + 2]];
        assert.ok(paletteLinear.some((entry) => entry.every((value, k) => Math.abs(value - color[k]) < 1e-6)), 'cada color es de la paleta');
      }
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('los seis cañones de la gatling quedan a la misma distancia de su eje y se cubren al girar', () => {
  const { muzzles } = JSON.parse(readFileSync('src/content/rigs/mg7-n5.json', 'utf8'));
  assert.equal(muzzles.length, 6);
  const center = [0, 1].map((axis) => muzzles.reduce((sum, muzzle) => sum + muzzle[axis], 0) / muzzles.length);
  const radii = muzzles.map(([x, y]) => Math.hypot(x - center[0], y - center[1]));
  const mean = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  for (const radius of radii) assert.ok(Math.abs(radius - mean) < 0.004, `radio ${radius} contra ${mean}`);
});
