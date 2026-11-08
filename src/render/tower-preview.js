import * as THREE from 'three';
import { aimTurret } from './units.js';

export class TowerPreview {
  constructor(containerEl, buildTowerMesh) {
    this.containerEl = containerEl;
    this.buildTowerMesh = buildTowerMesh;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x132432);
    this.camera = new THREE.PerspectiveCamera(22, 320 / 360, 0.1, 50);
    this.camera.position.set(2.75, 1.95, 2.45);
    this.camera.lookAt(0.03, 0.45, 0.16);

    this.scene.add(new THREE.AmbientLight(0x7f93aa, 0.6));

    const keyLight = new THREE.DirectionalLight(0xffe3bb, 1.85);
    keyLight.position.set(3.8, 5.4, 3.4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.camera.left = -3;
    keyLight.shadow.camera.right = 3;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x86b2ff, 0.38);
    fillLight.position.set(-3.2, 3.6, -2.4);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xa7fff1, 0.42);
    rimLight.position.set(-1.5, 2, 4.2);
    this.scene.add(rimLight);

    const pedestalBottom = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.72, 0.24, 48),
      new THREE.MeshStandardMaterial({ color: 0x436f31, roughness: 0.84 }),
    );
    pedestalBottom.position.y = -0.11;
    this.scene.add(pedestalBottom);

    const pedestalTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.26, 1.34, 0.18, 48),
      new THREE.MeshStandardMaterial({ color: 0x6eaa4e, roughness: 0.76 }),
    );
    pedestalTop.position.y = 0;
    pedestalTop.receiveShadow = true;
    this.scene.add(pedestalTop);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.32, 0.03, 12, 72),
      new THREE.MeshStandardMaterial({ color: 0x2f5e1e, roughness: 0.44, metalness: 0.08 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.095;
    this.scene.add(ring);

    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x98a58e, roughness: 0.9 });
    const rockA = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), rockMaterial);
    rockA.position.set(-0.62, 0.085, 0.64);
    rockA.rotation.set(0.4, 0.8, 0.15);
    this.scene.add(rockA);

    const rockB = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), rockMaterial);
    rockB.position.set(0.48, 0.09, 0.72);
    rockB.rotation.set(0.32, 1.3, 0.1);
    this.scene.add(rockB);

    this.sparkles = [];
    for (let index = 0; index < 14; index++) {
      const sparkle = new THREE.Mesh(
        new THREE.SphereGeometry(0.012 + Math.random() * 0.01, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe1a6, transparent: true, opacity: 0.55 + Math.random() * 0.3 }),
      );
      sparkle.position.set(-1.45 + Math.random() * 2.9, 0.78 + Math.random() * 1.55, -0.6 + Math.random() * 1.8);
      sparkle.userData.baseY = sparkle.position.y;
      sparkle.userData.phase = Math.random() * Math.PI * 2;
      this.scene.add(sparkle);
      this.sparkles.push(sparkle);
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(320, 360);
    this.containerEl.insertBefore(this.renderer.domElement, this.containerEl.firstChild);
    this.mesh = null;
  }

  // El marco del panel cambia con la ventana: sin esto, la torre se ve aplastada.
  fitToContainer() {
    const width = this.containerEl.clientWidth;
    const height = this.containerEl.clientHeight;
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setTower(definition, level) {
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = this.buildTowerMesh(definition.id, level);
    this.scene.add(this.mesh);
  }

  clear() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh = null;
      // render() no dibuja sin torre: se borra aquí la última imagen.
      this.renderer.render(this.scene, this.camera);
    }
  }

  render(elapsedTime) {
    if (!this.mesh) return;
    this.fitToContainer();
    this.mesh.rotation.y = 0;
    this.mesh.position.y = 0.11;
    this.mesh.position.x = 0.03;
    this.mesh.scale.setScalar(1.05);
    aimTurret(this.mesh.userData.rig, -0.88 + elapsedTime * 0.55, 0.3 - Math.sin(elapsedTime * 0.9) * 0.08);

    for (const sparkle of this.sparkles) {
      sparkle.position.y = sparkle.userData.baseY + Math.sin(elapsedTime * 1.6 + sparkle.userData.phase) * 0.025;
      sparkle.material.opacity = 0.35 + (Math.sin(elapsedTime * 2.2 + sparkle.userData.phase) + 1) * 0.22;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
