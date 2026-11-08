import * as THREE from 'three';
import { createCoverHpBar, showCoverHp } from './cover-hp-bar.js';
import { MAT, mk } from './materials.js';
import { RENDERING_CONFIG } from './config/rendering.js';

const ROCK = RENDERING_CONFIG.map.rock;

// Las rocas del mapa. Cada una se construye una sola vez y se oculta al desaparecer del estado:
// reintentar la oleada las devuelve tal como estaban.
export class RockRenderer {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.entries = new Map();
  }

  build(rock) {
    const s = this.config.worldScale;
    const groundY = this.config.groundTileHeightWorld;
    const root = new THREE.Group();
    root.position.set(rock.wx, groundY, rock.wz);

    const size = (ROCK.sizeMin + Math.random() * ROCK.sizeRange) * s;
    const boulder = mk(new THREE.DodecahedronGeometry(size, 0), MAT.rock);
    boulder.scale.y = ROCK.squash;
    boulder.position.y = size * ROCK.squash * 0.6;
    boulder.rotation.set(Math.random() * 2, Math.random() * 3, 0);
    boulder.castShadow = true;
    root.add(boulder);

    for (let index = 0; index < ROCK.pebbles; index++) {
      const pebbleSize = ROCK.pebbleSize * s * (0.7 + Math.random() * 0.6);
      const pebble = mk(new THREE.DodecahedronGeometry(pebbleSize, 0), MAT.rock);
      const angle = Math.random() * Math.PI * 2;
      pebble.position.set(Math.cos(angle) * ROCK.pebbleSpread * s, pebbleSize * 0.5, Math.sin(angle) * ROCK.pebbleSpread * s);
      pebble.rotation.set(Math.random() * 2, Math.random() * 3, 0);
      pebble.castShadow = true;
      root.add(pebble);
    }

    this.scene.add(root);
    const hpBar = createCoverHpBar(this.scene, ROCK.hpBar, rock, groundY, s);
    return { root, hpBar };
  }

  sync(state, camera) {
    for (const rock of state.rocks) {
      if (!this.entries.has(rock.id)) this.entries.set(rock.id, this.build(rock));
    }
    const standing = new Map(state.rocks.map((rock) => [rock.id, rock]));
    for (const [id, entry] of this.entries) {
      const rock = standing.get(id);
      entry.root.visible = Boolean(rock);
      showCoverHp(entry.hpBar, rock ? rock.hp / rock.maxHp : 1, camera);
    }
  }
}
