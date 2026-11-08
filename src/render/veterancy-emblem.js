// El emblema de veteranía: de uno a tres galones dorados. Sin emblema, la unidad no tiene veteranía.
import * as THREE from 'three';

const SIZE = 128;
const materials = new Map();

function drawChevron(context, top, width, height) {
  const left = (SIZE - width) / 2;
  const middle = SIZE / 2;
  const thickness = height * 0.5;
  context.beginPath();
  context.moveTo(left, top + height - thickness);
  context.lineTo(middle, top);
  context.lineTo(left + width, top + height - thickness);
  context.lineTo(left + width, top + height);
  context.lineTo(middle, top + thickness);
  context.lineTo(left, top + height);
  context.closePath();
  context.lineJoin = 'round';
  context.lineWidth = 11;
  context.strokeStyle = '#17191d';
  context.stroke();
  const gold = context.createLinearGradient(0, top, 0, top + height);
  gold.addColorStop(0, '#ffe24d');
  gold.addColorStop(1, '#f2a60c');
  context.fillStyle = gold;
  context.fill();
}

function createMaterial(level) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  const height = 54;
  const gap = 27;
  const total = height + gap * (level - 1);
  for (let index = 0; index < level; index++) {
    drawChevron(context, (SIZE - total) / 2 + index * gap, 104, height);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map, depthTest: false, transparent: true, toneMapped: false });
}

/** El sprite del emblema de un nivel (1 a 3). Los niveles comparten material. */
export function createVeterancyEmblem(level) {
  if (!materials.has(level)) materials.set(level, createMaterial(level));
  return new THREE.Sprite(materials.get(level));
}
