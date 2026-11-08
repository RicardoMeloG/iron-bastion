import * as THREE from 'three';
import { createFlameCluster } from './flame.js';
import { RENDERING_CONFIG } from './config/rendering.js';

const FIRE = RENDERING_CONFIG.map.fireZone;

// El suelo ardiendo tras un impacto incendiario: una mancha roja que brilla y llamas chicas repartidas
// por la zona, que se apagan al final. Las manchas comparten geometría y material, igual que las llamas.
const glowGeometry = new THREE.CircleGeometry(1, 28);
glowGeometry.rotateX(-Math.PI / 2);
const glowMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uTime: { value: 0 }, uSeed: { value: 0 }, uStrength: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vPosition;
    void main() {
      vPosition = position.xz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uSeed;
    uniform float uStrength;
    varying vec2 vPosition;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }

    void main() {
      float t = uTime * 1.3 + uSeed * 31.0;
      float n = noise(vPosition * 4.0 + vec2(uSeed * 9.0, t * 0.5)) * 0.6 + noise(vPosition * 9.0 - vec2(t * 0.8, uSeed * 5.0)) * 0.4;
      float edge = length(vPosition) + (n - 0.5) * 0.35;
      float body = 1.0 - smoothstep(0.55, 0.95, edge);
      vec3 color = mix(vec3(0.42, 0.03, 0.01), vec3(0.95, 0.12, 0.02), smoothstep(0.2, 0.8, body));
      color = mix(color, vec3(1.0, 0.45, 0.05), smoothstep(0.55, 0.85, n) * body);
      float alpha = body * (0.62 + 0.28 * n) * uStrength;
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(color, alpha);
    }
  `,
});

function createGlow(radius) {
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.scale.setScalar(radius);
  glow.renderOrder = 2;
  glow.userData.seed = Math.random();
  glow.userData.time = 0;
  glow.userData.strength = 1;
  glow.onBeforeRender = () => {
    glowMaterial.uniforms.uTime.value = glow.userData.time;
    glowMaterial.uniforms.uSeed.value = glow.userData.seed;
    glowMaterial.uniforms.uStrength.value = glow.userData.strength;
    glowMaterial.uniformsNeedUpdate = true;
  };
  return glow;
}

export class FireZoneRenderer {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.entries = new Map();
  }

  build(zone) {
    const flames = createFlameCluster(FIRE.flames, FIRE.flameSize * this.config.worldScale, FIRE.lift);
    for (const flame of flames) {
      flame.position.set(zone.x + flame.userData.clusterX * zone.radius * FIRE.spread, zone.groundY, zone.z + flame.userData.clusterZ * zone.radius * FIRE.spread);
      this.scene.add(flame);
    }
    const glow = createGlow(zone.radius * FIRE.glowScale);
    glow.position.set(zone.x, zone.groundY + FIRE.glowHeight * this.config.worldScale, zone.z);
    this.scene.add(glow);
    return { flames, glow };
  }

  sync(state, elapsedTime) {
    const burning = new Set();
    for (const zone of state.fireZones) {
      burning.add(zone.id);
      if (!this.entries.has(zone.id)) this.entries.set(zone.id, this.build(zone));
      const fade = Math.min(1, zone.remaining / FIRE.fadeSeconds);
      const { flames, glow } = this.entries.get(zone.id);
      glow.userData.time = elapsedTime;
      glow.userData.strength = fade;
      for (const flame of flames) {
        flame.userData.time = elapsedTime;
        flame.userData.strength = fade;
        flame.scale.setScalar(flame.userData.baseSize * (0.6 + 0.4 * fade));
      }
    }
    for (const [id, { flames, glow }] of this.entries) {
      if (burning.has(id)) continue;
      this.scene.remove(glow);
      for (const flame of flames) this.scene.remove(flame);
      this.entries.delete(id);
    }
  }
}
