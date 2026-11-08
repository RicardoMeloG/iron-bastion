// Una llama animada: un plano que siempre mira a la cámara, con la forma y el movimiento calculados
// en el shader, sin texturas. Todas comparten geometría y material, así que quien las usa no los libera.
import * as THREE from 'three';

const geometry = new THREE.PlaneGeometry(1, 1.5);
geometry.translate(0, 0.75, 0);

const material = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: {
    uTime: { value: 0 },
    uSeed: { value: 0 },
    uStrength: { value: 1 },
    uLift: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform float uLift;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float size = length(modelMatrix[0].xyz);
      center.xy += position.xy * size;
      // Se acerca a la cámara para que no la tape el modelo del que sale.
      center.z += size * uLift;
      gl_Position = projectionMatrix * center;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uSeed;
    uniform float uStrength;
    varying vec2 vUv;

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
      float y = vUv.y;
      float t = uTime + uSeed * 17.0;
      // El ruido sube con el tiempo: dobla la llama arriba y le recorta lenguas.
      float n = noise(vec2(vUv.x * 3.0 + uSeed * 9.0, y * 3.0 - t * 1.9)) * 0.65
        + noise(vec2(vUv.x * 7.0 - uSeed * 5.0, y * 6.5 - t * 3.4)) * 0.35;
      float x = vUv.x - 0.5 + (n - 0.5) * 0.6 * y;
      float width = 0.42 * pow(max(1.0 - y, 0.0), 0.7) * smoothstep(0.0, 0.14, y);
      float body = 1.0 - smoothstep(width * 0.3, width, abs(x));
      body *= smoothstep(y * 1.05 - 0.12, y * 1.05 + 0.22, n + 0.28);

      float heat = body * (1.0 - y * 0.72);
      vec3 color = mix(vec3(0.95, 0.16, 0.02), vec3(1.0, 0.47, 0.04), smoothstep(0.12, 0.42, heat));
      color = mix(color, vec3(1.0, 0.82, 0.25), smoothstep(0.42, 0.68, heat));
      color = mix(color, vec3(1.0, 0.97, 0.78), smoothstep(0.72, 0.92, heat));

      float alpha = smoothstep(0.02, 0.28, body) * uStrength;
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(color, alpha);
    }
  `,
});

/**
 * `size`: ancho de la llama; mide 1,5 veces eso de alto, desde su base. `lift`: cuánto se acerca a
 * la cámara, en veces su ancho.
 */
export function createFlame(size, lift = 1.5) {
  const flame = new THREE.Mesh(geometry, material);
  flame.scale.setScalar(size);
  flame.renderOrder = 30;
  flame.frustumCulled = false;
  flame.userData.sharedResources = true;
  flame.userData.baseSize = size;
  flame.userData.seed = Math.random();
  flame.userData.time = 0;
  flame.userData.strength = 1;
  flame.userData.lift = lift;
  flame.onBeforeRender = () => {
    material.uniforms.uTime.value = flame.userData.time;
    material.uniforms.uSeed.value = flame.userData.seed;
    material.uniforms.uStrength.value = flame.userData.strength;
    material.uniforms.uLift.value = flame.userData.lift;
    material.uniformsNeedUpdate = true;
  };
  return flame;
}

// Las llamas de un fuego: de la más grande, al centro, a la más chica, en el borde.
const FACTOR_CENTER = 1.25;
const FACTOR_EDGE = 0.45;
const FACTOR_JITTER = 0.15;
const GOLDEN_ANGLE = 2.4;

/**
 * Un fuego son varias llamas de distintos tamaños. `factor` multiplica el tamaño base, y `x`, `z`
 * dicen dónde va cada una, de -1 a 1. Todas se acercan lo mismo a la cámara, sea cual sea su tamaño:
 * `lift` se divide por el `factor`, para que la chica tampoco quede tapada.
 */
export function createFlameCluster(count, size, lift) {
  return Array.from({ length: count }, (_, index) => {
    const position = count > 1 ? index / (count - 1) : 0;
    const factor = FACTOR_CENTER + (FACTOR_EDGE - FACTOR_CENTER) * position + (Math.random() - 0.5) * FACTOR_JITTER;
    const angle = index * GOLDEN_ANGLE + Math.random();
    const flame = createFlame(size * factor, lift / factor);
    flame.userData.factor = factor;
    flame.userData.clusterX = Math.cos(angle) * position;
    flame.userData.clusterZ = Math.sin(angle) * position;
    return flame;
  });
}
