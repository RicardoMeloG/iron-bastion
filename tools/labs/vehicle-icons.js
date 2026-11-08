// Foto de cada vehículo con fondo transparente, para el panel de la próxima oleada. La usa
// scripts/render-vehicle-icons.mjs, que la guarda en public/vehicles/<id>.webp.
import * as THREE from 'three';
import { vehicleEnemyDefinitions } from '../../src/content/enemies/vehicleCatalog.js';
import { createUnit, loadUnitModel } from '../../src/render/units.js';

const SIZE = 192;

export async function renderVehicleIcons() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xc4cfd8, 1.9));
  const sun = new THREE.DirectionalLight(0xfff0d0, 3);
  sun.position.set(4, 8, 6);
  scene.add(sun);

  const icons = {};
  for (const definition of Object.values(vehicleEnemyDefinitions)) {
    const unit = createUnit(await loadUnitModel(definition.model.rig));
    scene.add(unit);
    const box = new THREE.Box3().setFromObject(unit);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() * 0.4;
    const camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, radius * 8);
    camera.position.copy(center).add(new THREE.Vector3(1, 0.65, 1).normalize().multiplyScalar(radius * 4));
    camera.lookAt(center);
    renderer.render(scene, camera);
    icons[definition.id] = renderer.domElement.toDataURL('image/webp', 0.9);
    scene.remove(unit);
  }
  renderer.dispose();
  return icons;
}
