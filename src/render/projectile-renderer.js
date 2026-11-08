import * as THREE from 'three';
import { EFFECTS_CONFIG } from './config/effects.js';
import { mk } from './materials.js';

const FX = EFFECTS_CONFIG;

function normalizeAtlasFrame(texture, tilesX, tilesY, frame) {
  const safeFrame = Math.max(0, frame);
  const col = safeFrame % tilesX;
  const row = Math.floor(safeFrame / tilesX);
  texture.repeat.set(1 / tilesX, 1 / tilesY);
  texture.offset.set(col / tilesX, 1 - (row + 1) / tilesY);
}

function createFlipbookAtlasCanvas(kind, tilesX, tilesY, tileSize = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = tilesX * tileSize;
  canvas.height = tilesY * tileSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  for (let frame = 0; frame < tilesX * tilesY; frame += 1) {
    const col = frame % tilesX;
    const row = Math.floor(frame / tilesX);
    const x = col * tileSize;
    const y = row * tileSize;
    const t = frame / Math.max(1, tilesX * tilesY - 1);
    const cx = x + tileSize / 2;
    const cy = y + tileSize / 2;

    const ringRadius = kind === 'explosion'
      ? tileSize * (0.12 + t * 0.48)
      : tileSize * (0.2 + Math.sin(t * Math.PI) * 0.22);

    const coreGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, ringRadius);
    if (kind === 'explosion') {
      coreGradient.addColorStop(0, `rgba(255, 250, 210, ${1 - t * 0.25})`);
      coreGradient.addColorStop(0.38, `rgba(255, 184, 80, ${0.94 - t * 0.35})`);
      coreGradient.addColorStop(0.72, `rgba(255, 96, 24, ${0.72 - t * 0.48})`);
      coreGradient.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      coreGradient.addColorStop(0, `rgba(255, 244, 190, ${0.8 - t * 0.2})`);
      coreGradient.addColorStop(0.45, `rgba(255, 160, 40, ${0.7 - t * 0.2})`);
      coreGradient.addColorStop(0.8, `rgba(216, 84, 16, ${0.5 - t * 0.2})`);
      coreGradient.addColorStop(1, 'rgba(0,0,0,0)');
    }

    ctx.fillStyle = coreGradient;
    ctx.fillRect(x, y, tileSize, tileSize);

    const sparkCount = kind === 'explosion' ? 18 : 10;
    for (let spark = 0; spark < sparkCount; spark += 1) {
      const angle = (spark / sparkCount) * Math.PI * 2 + t * 1.1;
      const spread = ringRadius * (0.18 + ((spark % 5) / 5));
      const sx = cx + Math.cos(angle) * spread;
      const sy = cy + Math.sin(angle) * spread;
      const sRadius = (kind === 'explosion' ? 3.8 : 2.5) * (1 - t * 0.6);
      const sparkGradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, sRadius);
      sparkGradient.addColorStop(0, `rgba(255,255,220,${0.82 - t * 0.5})`);
      sparkGradient.addColorStop(1, 'rgba(255,255,220,0)');
      ctx.fillStyle = sparkGradient;
      ctx.beginPath();
      ctx.arc(sx, sy, sRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas;
}

function createGeneratedFlipbookTexture(kind, config) {
  const canvas = createFlipbookAtlasCanvas(kind, config.tilesX, config.tilesY);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  normalizeAtlasFrame(texture, config.tilesX, config.tilesY, 0);
  return texture;
}

function resolveBlending(mode) {
  return mode === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
}

function disposeParticleMesh(scene, particle) {
  scene.remove(particle.mesh);
  if (particle.texture) {
    particle.texture.dispose();
  }
  if (particle.mesh.material) {
    particle.mesh.material.dispose();
  }
  // Todos los Sprite de three.js comparten una misma geometría.
  if (particle.mesh.geometry && !particle.mesh.isSprite) {
    particle.mesh.geometry.dispose();
  }
}

// Geometrías y materiales de una clase de bala. Se comparten entre todas las balas y duran toda
// la partida: al retirar una bala solo se quita su grupo de la escena.
function createBulletAssets(worldScale, { sphereColor, sphereRadius, sphereSegments, trailColor, trailOpacity, trailTopRadius, trailBottomRadius, trailHeight, trailZ }) {
  return {
    sphereGeometry: new THREE.SphereGeometry(sphereRadius * worldScale, sphereSegments, sphereSegments),
    sphereMaterial: new THREE.MeshBasicMaterial({ color: sphereColor }),
    trailGeometry: new THREE.CylinderGeometry(trailTopRadius * worldScale, trailBottomRadius * worldScale, trailHeight * worldScale, 6),
    trailMaterial: new THREE.MeshBasicMaterial({ color: trailColor, transparent: true, opacity: trailOpacity }),
    trailZ: trailZ * worldScale,
  };
}

const COVER_BURST = { rock: FX.rockBurst, tree: FX.treeBurst, bush: FX.bushBurst };

// Las piezas de un misil o de un cohete, según su configuración (FX.missile, FX.rocket).
function createMissileAssets(s, ms) {
  const noseRadius = ms.noseRadius ?? ms.bodyRadius;
  const noseLength = ms.noseLength ?? ms.bodyLength * 0.3;
  return {
    config: ms,
    bodyGeometry: new THREE.CylinderGeometry(ms.bodyRadius * s, ms.bodyRadius * s, ms.bodyLength * s, 8),
    bodyMaterial: new THREE.MeshBasicMaterial({ color: ms.bodyColor }),
    noseGeometry: new THREE.ConeGeometry(noseRadius * s, noseLength * s, 8),
    noseMaterial: new THREE.MeshBasicMaterial({ color: ms.noseColor }),
    noseZ: ((ms.bodyLength + noseLength) / 2) * s,
    // La parte de atrás de una ojiva en rombo.
    noseBackGeometry: ms.noseBackLength ? new THREE.ConeGeometry(noseRadius * s, ms.noseBackLength * s, 8) : null,
    noseBackZ: ms.noseBackLength ? ((ms.bodyLength - ms.noseBackLength) / 2) * s : 0,
    flameGeometry: new THREE.SphereGeometry(ms.flameRadius * s, 8, 8),
    flameMaterial: new THREE.MeshBasicMaterial({ color: ms.flameColor }),
  };
}

export class ProjectileRenderer {
  constructor(scene, worldScale = 1) {
    this.rewardTextures = new Map();
    this.scene = scene;
    this.worldScale = worldScale;
    this.projectileMeshes = new Map();
    // Dónde dejó cada misil su último soplo de humo.
    this.missileTrails = new Map();
    this.particles = [];
    const pr = FX.projectile;
    const ep = FX.enemyProjectile;
    this.towerBulletAssets = createBulletAssets(worldScale, {
      sphereColor: pr.sphere.color,
      sphereRadius: pr.sphere.radius,
      sphereSegments: pr.sphere.segments,
      trailColor: pr.trail.color,
      trailOpacity: pr.trail.opacity,
      trailTopRadius: pr.trail.topRadius,
      trailBottomRadius: pr.trail.bottomRadius,
      trailHeight: pr.trail.height,
      trailZ: pr.trail.zOffset,
    });
    this.enemyBulletAssets = createBulletAssets(worldScale, {
      sphereColor: ep.sphereColor,
      sphereRadius: ep.sphereRadius,
      sphereSegments: pr.sphere.segments,
      trailColor: ep.trailColor,
      trailOpacity: ep.trailOpacity,
      trailTopRadius: ep.trailTopRadius,
      trailBottomRadius: ep.trailBottomRadius,
      trailHeight: ep.trailHeight,
      // La estela queda detrás de la bala, sin importar su largo.
      trailZ: -ep.trailHeight / 2,
    });
    this.missileAssets = createMissileAssets(worldScale, FX.missile);
    this.rocketAssets = createMissileAssets(worldScale, FX.rocket);
    this.textureLoader = new THREE.TextureLoader();
    this.flipbookTemplates = {
      explosion: createGeneratedFlipbookTexture('explosion', FX.explosionFlipbook),
      fire: createGeneratedFlipbookTexture('fire', FX.fireFlipbook),
    };

    this.tryLoadAtlasTexture('explosion', FX.explosionFlipbook);
    this.tryLoadAtlasTexture('fire', FX.fireFlipbook);
  }

  tryLoadAtlasTexture(key, config) {
    if (!config.atlasUrl) return;
    this.textureLoader.load(
      config.atlasUrl,
      (loadedTexture) => {
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.wrapS = THREE.RepeatWrapping;
        loadedTexture.wrapT = THREE.RepeatWrapping;
        loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
        loadedTexture.magFilter = THREE.LinearFilter;
        normalizeAtlasFrame(loadedTexture, config.tilesX, config.tilesY, 0);
        this.flipbookTemplates[key]?.dispose();
        this.flipbookTemplates[key] = loadedTexture;
      },
      undefined,
      () => {
        // Keep generated atlas as fallback.
      },
    );
  }

  createFlipbookSprite(position, config, key, scaleMultiplier = 1) {
    const template = this.flipbookTemplates[key];
    if (!template) return null;

    const localTexture = template.clone();
    localTexture.needsUpdate = true;
    normalizeAtlasFrame(localTexture, config.tilesX, config.tilesY, 0);

    const material = new THREE.SpriteMaterial({
      map: localTexture,
      transparent: true,
      opacity: config.opacity,
      depthWrite: false,
      depthTest: false,
      blending: resolveBlending(config.blending),
    });

    const sprite = new THREE.Sprite(material);
    const size = config.size * this.worldScale * scaleMultiplier;
    sprite.scale.set(size, size, 1);
    sprite.position.set(
      position.x,
      position.y + config.yOffset * this.worldScale,
      position.z,
    );
    this.scene.add(sprite);

    return {
      mesh: sprite,
      texture: localTexture,
      life: config.lifetime,
      totalLife: config.lifetime,
      type: 'flipbook',
      frame: -1,
      frameCount: config.frameCount,
      fps: config.fps,
      tilesX: config.tilesX,
      tilesY: config.tilesY,
      maxOpacity: config.opacity,
    };
  }

  createRewardSprite(position, rewardAmount, small) {
    const cfg = FX.rewardFloatText;
    const texture = this.rewardTexture(rewardAmount);
    if (!texture) return null;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: cfg.opacity,
      depthWrite: false,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(material);
    const scale = cfg.scale * (small ? cfg.soldierShare : 1) * this.worldScale;
    sprite.scale.set(scale * 2.1, scale, 1);
    sprite.position.set(position.x, position.y + cfg.startYOffset * this.worldScale, position.z);
    this.scene.add(sprite);

    const duration = cfg.durationMin + Math.random() * cfg.durationRange;
    const driftAngle = Math.random() * Math.PI * 2;
    const driftSpeed = cfg.driftSpeed * this.worldScale;
    return {
      mesh: sprite,
      life: duration,
      totalLife: duration,
      type: 'reward-text',
      riseSpeed: cfg.riseSpeed * this.worldScale,
      driftX: Math.cos(driftAngle) * driftSpeed,
      driftZ: Math.sin(driftAngle) * driftSpeed,
      pulse: cfg.scalePulse,
      baseScaleX: sprite.scale.x,
      baseScaleY: sprite.scale.y,
      maxOpacity: cfg.opacity,
    };
  }

  // Una textura por monto, compartida: en una oleada grande caen decenas de soldados por segundo.
  rewardTexture(rewardAmount) {
    if (this.rewardTextures.has(rewardAmount)) return this.rewardTextures.get(rewardAmount);
    const cfg = FX.rewardFloatText;
    const canvas = document.createElement('canvas');
    canvas.width = cfg.width;
    canvas.height = cfg.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const rewardText = `+$${rewardAmount}`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${cfg.fontSize}px ${cfg.fontFamily}`;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = cfg.strokeStyle;
    ctx.lineWidth = cfg.strokeWidth;
    ctx.shadowColor = cfg.glowStyle;
    ctx.shadowBlur = 24;
    ctx.strokeText(rewardText, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = cfg.fillStyle;
    ctx.fillText(rewardText, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    this.rewardTextures.set(rewardAmount, texture);
    return texture;
  }

  spawnSmokePuff(position, config, options = {}) {
    const lifetime = options.lifetime ?? config.lifetime;
    const radius = (options.radius ?? config.radius) * this.worldScale;
    const puff = mk(
      new THREE.SphereGeometry(radius, config.segments, config.segments),
      new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: options.opacity ?? config.opacity,
        depthWrite: false,
      }),
    );
    puff.position.set(
      position.x + (options.offsetX ?? 0),
      position.y + (options.offsetY ?? 0),
      position.z + (options.offsetZ ?? 0),
    );
    this.scene.add(puff);
    this.particles.push({
      mesh: puff,
      life: lifetime,
      totalLife: lifetime,
      type: 'smoke',
      vy: (options.riseSpeed ?? config.upwardSpeed) * this.worldScale,
      vx: options.vx ?? 0,
      vz: options.vz ?? 0,
      growthRate: options.growthRate ?? config.growthRate,
      opacityMultiplier: options.opacityMultiplier ?? config.opacityMultiplier ?? 1,
      maxOpacity: options.opacity ?? config.opacity,
    });
  }

  buildMissileMesh(assets) {
    const ms = assets.config;
    const s = this.worldScale;
    const group = new THREE.Group();
    const body = mk(assets.bodyGeometry, assets.bodyMaterial);
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const nose = mk(assets.noseGeometry, assets.noseMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = assets.noseZ;
    group.add(nose);
    if (assets.noseBackGeometry) {
      const noseBack = mk(assets.noseBackGeometry, assets.noseMaterial);
      noseBack.rotation.x = -Math.PI / 2;
      noseBack.position.z = assets.noseBackZ;
      group.add(noseBack);
    }
    const flame = mk(assets.flameGeometry, assets.flameMaterial);
    flame.position.z = -ms.bodyLength * 0.6 * s;
    group.add(flame);
    return group;
  }

  buildBulletMesh(assets) {
    const group = new THREE.Group();
    group.add(mk(assets.sphereGeometry, assets.sphereMaterial));
    const trail = mk(assets.trailGeometry, assets.trailMaterial);
    trail.rotation.x = Math.PI / 2;
    trail.position.z = assets.trailZ;
    group.add(trail);
    return group;
  }

  // El misil deja un soplo de humo cada trailSpacing celdas de vuelo.
  emitMissileTrail(projectile, ms) {
    const last = this.missileTrails.get(projectile.id);
    const here = new THREE.Vector3(projectile.x, projectile.y, projectile.z);
    if (last && last.distanceTo(here) < ms.trailSpacing * this.worldScale) return;
    this.missileTrails.set(projectile.id, here);
    this.spawnSmokePuff(here, ms.trailPuff, { opacityMultiplier: 1 });
  }

  syncProjectiles(state) {
    const nextIds = new Set(state.projectiles.map((projectile) => projectile.id));
    for (const [projectileId, mesh] of this.projectileMeshes.entries()) {
      if (!nextIds.has(projectileId)) {
        this.scene.remove(mesh);
        this.projectileMeshes.delete(projectileId);
        this.missileTrails.delete(projectileId);
      }
    }

    for (const projectile of state.projectiles) {
      let mesh = this.projectileMeshes.get(projectile.id);
      if (projectile.look === 'grenade') {
        this.syncGrenade(projectile);
        continue;
      }
      const missile = projectile.missile ? this.missileAssets : projectile.look === 'rocket' ? this.rocketAssets : null;
      if (!mesh && missile) {
        mesh = this.buildMissileMesh(missile);
        this.scene.add(mesh);
        this.projectileMeshes.set(projectile.id, mesh);
      }
      if (missile) this.emitMissileTrail(projectile, missile.config);
      if (!mesh) {
        mesh = this.buildBulletMesh(projectile.sourceType === 'enemy' ? this.enemyBulletAssets : this.towerBulletAssets);
        this.scene.add(mesh);
        this.projectileMeshes.set(projectile.id, mesh);
      }

      mesh.position.set(projectile.x, projectile.y, projectile.z);
      const direction = new THREE.Vector3(projectile.vx ?? 0, projectile.vy ?? 0, projectile.vz ?? 1).normalize();
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    }
  }

  // Vuela en línea recta en la simulación; el arco es solo de dibujo.
  syncGrenade(projectile) {
    const cfg = FX.grenade;
    let mesh = this.projectileMeshes.get(projectile.id);
    if (!mesh) {
      this.grenadeAssets ??= {
        geometry: new THREE.SphereGeometry(cfg.radius * this.worldScale, 8, 6),
        material: new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.8 }),
      };
      mesh = new THREE.Mesh(this.grenadeAssets.geometry, this.grenadeAssets.material);
      this.scene.add(mesh);
      this.projectileMeshes.set(projectile.id, mesh);
    }
    const { origin, flight } = projectile;
    const flown = Math.min(1, Math.hypot(projectile.x - origin.x, projectile.y - origin.y, projectile.z - origin.z) / flight);
    mesh.position.set(projectile.x, projectile.y + Math.sin(Math.PI * flown) * cfg.arc * this.worldScale, projectile.z);
  }

  handleEffects(effects, towerRenderer, enemyRenderer = null) {
    for (const effect of effects) {
      if (effect.type === 'projectile-fired' && effect.launch) {
        this.spawnLaunch(FX.missileLaunch, (offset) => towerRenderer.getMuzzleWorldPosition(effect.towerId, effect.fireIndex, offset), effect.position);
      } else if (effect.type === 'enemy-projectile-fired' && effect.projectile === 'rocket') {
        this.spawnLaunch(FX.rocketLaunch, (offset) => enemyRenderer?.getMuzzleWorldPosition(effect.enemyId, effect.fireIndex ?? 0, offset), effect.position);
      } else if (effect.type === 'defense-fired') {
        this.spawnInterceptor(effect, enemyRenderer);
      } else if (effect.type === 'missile-intercepted') {
        this.spawnInterception(effect);
      } else if (effect.type === 'missile-missed') {
        this.spawnMissileMiss(effect.position);
      } else if (effect.type === 'projectile-burst') {
        this.spawnMissileBlast(effect.position, effect.impactBlast, FX.impactBlast);
      } else if (effect.type === 'incendiary-impact' || effect.type === 'drone-exploded' || effect.type === 'flak-burst') {
        this.spawnMissileBlast(effect.position, effect.impactBlast, FX.impactBlast);
      } else if (effect.type === 'vehicle-overheated') {
        this.spawnSmokePuff(effect.position, FX.engineOverheat);
      } else if (effect.type === 'cover-hit') {
        if (effect.impactBlast > 0) this.spawnMissileBlast(effect.position, effect.impactBlast, FX.impactBlast);
        this.spawnDebris(effect.position, COVER_BURST[effect.kind].color, FX.coverHit.count, FX.coverHit.pieceScale);
      } else if (effect.type === 'cover-removed') {
        const { color, count, dust, pieceScale } = COVER_BURST[effect.kind];
        this.spawnSmokePuff(effect.position, dust);
        this.spawnDebris(effect.position, color, count, pieceScale);
      } else if (effect.type === 'projectile-fired') {
        const turret = towerRenderer.getTurret(effect.towerId);
        if (!turret) continue;
        const mf = FX.muzzleFlash;
        const muzzleWorldPosition = towerRenderer.getMuzzleWorldPosition(effect.towerId, effect.fireIndex, mf.forwardOffset * this.worldScale);
        if (!muzzleWorldPosition) continue;
        const flash = mk(new THREE.SphereGeometry(mf.radius * this.worldScale, mf.segments, mf.segments), new THREE.MeshBasicMaterial({ color: mf.color }));
        flash.position.copy(muzzleWorldPosition);
        this.scene.add(flash);
        this.particles.push({ mesh: flash, life: mf.lifetime, totalLife: mf.lifetime, type: 'impact-pulse', maxOpacity: 1 });
      } else if (effect.type === 'enemy-projectile-fired') {
        const mf = FX.enemyMuzzleFlash;
        const muzzleWorldPosition = enemyRenderer?.getMuzzleWorldPosition(
          effect.enemyId,
          effect.fireIndex ?? 0,
          (mf.forwardOffset ?? 0) * this.worldScale,
        );
        const flashPosition = muzzleWorldPosition ?? new THREE.Vector3(effect.position.x, effect.position.y, effect.position.z);
        const flash = mk(
          new THREE.SphereGeometry(mf.radius * this.worldScale, mf.segments, mf.segments),
          new THREE.MeshBasicMaterial({ color: mf.color }),
        );
        flash.position.copy(flashPosition);
        this.scene.add(flash);
        this.particles.push({
          mesh: flash,
          life: mf.lifetime,
          totalLife: mf.lifetime,
          type: 'impact-pulse',
          growthRate: 20,
          maxOpacity: 1,
        });
        const flashCore = mk(
          new THREE.SphereGeometry(mf.radius * this.worldScale * 0.48, mf.segments, mf.segments),
          new THREE.MeshBasicMaterial({ color: 0xffe2b8 }),
        );
        flashCore.position.copy(flashPosition);
        this.scene.add(flashCore);
        this.particles.push({
          mesh: flashCore,
          life: mf.lifetime * 0.8,
          totalLife: mf.lifetime * 0.8,
          type: 'impact-pulse',
          growthRate: 12,
          maxOpacity: 1,
        });
      } else if (effect.type === 'hit' || effect.type === 'enemy-killed') {
        if (effect.type === 'hit' && effect.impactBlast > 0) {
          // Misil: explosión del impacto.
          this.spawnMissileBlast(effect.position, effect.impactBlast, FX.impactBlast);
        }
        if (effect.type === 'hit') {
          const hs = FX.hitSpark;
          const spark = mk(
            new THREE.SphereGeometry(hs.radius * this.worldScale, hs.segments, hs.segments),
            new THREE.MeshBasicMaterial({ color: hs.color, transparent: true, opacity: hs.opacity }),
          );
          spark.position.set(effect.position.x, effect.position.y, effect.position.z);
          this.scene.add(spark);
          this.particles.push({
            mesh: spark,
            life: hs.lifetime,
            totalLife: hs.lifetime,
            type: 'impact-pulse',
            growthRate: hs.growthRate,
            maxOpacity: hs.opacity,
          });
        }

        if (effect.type === 'enemy-killed' && effect.armorClass !== 'infantry') {
          this.spawnVehicleDeath(effect);

          const fireSprite = this.createFlipbookSprite(effect.position, FX.fireFlipbook, 'fire', 0.92 + Math.random() * 0.22);
          if (fireSprite) {
            this.particles.push(fireSprite);
          }

          const smokeBurst = FX.smokeBurst;
          this.spawnSmokePuff(effect.position, smokeBurst, {
            offsetY: smokeBurst.yOffset * this.worldScale,
            lifetime: smokeBurst.lifetime,
            opacity: smokeBurst.opacity,
          });

          const smokeTrail = FX.smokeTrail;
          for (let index = 0; index < smokeTrail.puffCount; index += 1) {
            const angle = Math.random() * Math.PI * 2;
            const spread = Math.random() * smokeTrail.spread * this.worldScale;
            this.spawnSmokePuff(effect.position, smokeTrail, {
              offsetX: Math.cos(angle) * spread,
              offsetZ: Math.sin(angle) * spread,
              offsetY: (0.04 + Math.random() * 0.08) * this.worldScale,
              lifetime: smokeTrail.lifetimeMin + Math.random() * smokeTrail.lifetimeRange,
              riseSpeed: smokeTrail.riseSpeed * (0.8 + Math.random() * 0.5),
              opacity: smokeTrail.opacity * (0.82 + Math.random() * 0.18),
              vx: (Math.random() - 0.5) * smokeTrail.driftSpeed * this.worldScale,
              vz: (Math.random() - 0.5) * smokeTrail.driftSpeed * this.worldScale,
              growthRate: smokeTrail.growthRate,
              opacityMultiplier: 0.7,
            });
          }

        }

        if (effect.type === 'enemy-killed' && effect.reward > 0) {
          const rewardSprite = this.createRewardSprite(effect.position, effect.reward, effect.armorClass === 'infantry');
          if (rewardSprite) this.particles.push(rewardSprite);
        }

        const db = FX.debris;
        for (let index = 0; index < effect.count; index++) {
          const size = (db.sizeMin + Math.random() * db.sizeRange) * this.worldScale;
          const mesh = mk(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color: effect.color }));
          mesh.position.set(effect.position.x, effect.position.y, effect.position.z);
          this.scene.add(mesh);
          this.particles.push({
            mesh,
            life: db.lifetimeMin + Math.random() * db.lifetimeRange,
            totalLife: db.lifetimeMin + db.lifetimeRange,
            vx: (Math.random() - 0.5) * db.velocity.horizontal * this.worldScale,
            vy: (Math.random() * db.velocity.verticalRange + db.velocity.verticalMin) * this.worldScale,
            vz: (Math.random() - 0.5) * db.velocity.horizontal * this.worldScale,
            type: 'debris',
            maxOpacity: 1,
          });
        }
      } else if (effect.type === 'tower-hit') {
        // Cañonazo HE: la explosión mide lo que alcanza su onda.
        if (effect.blastRadius > 0) this.spawnMissileBlast(effect.position, effect.blastRadius * FX.tankShellBlast.sizeRatio, FX.tankShellBlast);
        // Cohete: solo se ve, no daña a las torres de alrededor.
        if (effect.impactBlast > 0) this.spawnMissileBlast(effect.position, effect.impactBlast, FX.impactBlast);
        const hs = FX.towerHitSpark;
        const spark = mk(
          new THREE.SphereGeometry(hs.radius * this.worldScale, hs.segments, hs.segments),
          new THREE.MeshBasicMaterial({ color: hs.color, transparent: true, opacity: hs.opacity }),
        );
        spark.position.set(effect.position.x, effect.position.y, effect.position.z);
        this.scene.add(spark);
        this.particles.push({
          mesh: spark,
          life: hs.lifetime,
          totalLife: hs.lifetime,
          type: 'impact-pulse',
          growthRate: hs.growthRate,
          maxOpacity: hs.opacity,
        });
      } else if (effect.type === 'tower-destroyed') {
        const burst = FX.towerDestroyedBurst;
        const blast = mk(
          new THREE.SphereGeometry(burst.radius * this.worldScale, burst.segments, burst.segments),
          new THREE.MeshBasicMaterial({ color: burst.color, transparent: true, opacity: burst.opacity }),
        );
        blast.position.set(
          effect.position.x,
          effect.position.y + burst.yOffset * this.worldScale,
          effect.position.z,
        );
        this.scene.add(blast);
        this.particles.push({
          mesh: blast,
          life: burst.lifetime,
          totalLife: burst.lifetime,
          type: 'explosion-flash',
          growthRate: burst.growthRate,
          maxOpacity: burst.opacity,
        });
        this.spawnSmokePuff(effect.position, FX.smokeBurst, {
          offsetY: FX.smokeBurst.yOffset * this.worldScale,
          lifetime: FX.smokeBurst.lifetime * 1.2,
          opacity: FX.smokeBurst.opacity,
        });
      }
    }
  }

  // Lanzamiento: fogonazo en la boca y el chorro de humo que sale por detrás del tubo.
  // `muzzleAt(offset)` da la boca adelantada `offset` en la dirección del tubo.
  spawnLaunch(ml, muzzleAt, fallback) {
    const s = this.worldScale;
    const position = muzzleAt(0) ?? new THREE.Vector3(fallback.x, fallback.y, fallback.z);
    const flash = mk(new THREE.SphereGeometry(ml.flashRadius * s, 8, 8), new THREE.MeshBasicMaterial({ color: ml.flashColor, transparent: true }));
    flash.position.copy(position);
    this.scene.add(flash);
    this.particles.push({ mesh: flash, life: ml.flashLifetime, totalLife: ml.flashLifetime, type: 'impact-pulse', growthRate: 14, maxOpacity: 1 });
    const behind = muzzleAt(-0.3 * s);
    const back = behind ? behind.clone().sub(position).normalize() : new THREE.Vector3(0, 0, -1);
    const smokeOrigin = (ml.backOffset ? muzzleAt(-ml.backOffset * s) : null) ?? position;
    for (let index = 0; index < ml.backBlastPuffs; index++) {
      const speed = ml.backBlastSpeed * s * (0.6 + Math.random() * 0.6);
      this.spawnSmokePuff(smokeOrigin, ml.puff, {
        vx: back.x * speed + (Math.random() - 0.5) * 0.2 * s,
        vz: back.z * speed + (Math.random() - 0.5) * 0.2 * s,
        lifetime: ml.puff.lifetime * (0.7 + Math.random() * 0.5),
      });
    }
  }

  spawnMissileMiss(position) {
    this.spawnMissileBlast(position, FX.missileMiss.radius * this.worldScale, FX.missileMiss);
  }

  // La defensa activa dispara: sale humo del lanzador, y el interceptor vuela hasta el proyectil con su estela.
  spawnInterceptor({ enemyId, launcher, from, to, seconds }, enemyRenderer) {
    const { dart, launchSmoke, trail } = FX.interception;
    const end = new THREE.Vector3(to.x, to.y, to.z);
    const start = enemyRenderer?.aimDefenseLauncher(enemyId, launcher, end) ?? new THREE.Vector3(from.x, from.y, from.z);
    const direction = end.clone().sub(start).normalize();
    const size = this.worldScale;
    const shot = mk(
      new THREE.BoxGeometry(dart.width * size, dart.width * size, dart.length * size),
      new THREE.MeshBasicMaterial({ color: dart.color, toneMapped: false }),
    );
    shot.position.copy(start);
    shot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    const line = mk(
      new THREE.CylinderGeometry(trail.radius * size, trail.radius * size, 1, 6),
      new THREE.MeshBasicMaterial({ color: trail.color, transparent: true, opacity: 1, toneMapped: false }),
    );
    line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.scene.add(shot, line);
    this.particles.push(
      { mesh: shot, life: seconds, totalLife: seconds, type: 'interceptor', start, end },
      { mesh: line, life: seconds + trail.fade, totalLife: seconds + trail.fade, type: 'interceptor-trail', start, end, seconds },
    );
    this.spawnSmokePuff(start, { ...FX.smokeBurst, ...launchSmoke });
  }

  // El interceptor llegó: un destello blanco y el proyectil estalla en el aire.
  spawnInterception({ position }) {
    const { blastRadius, flash } = FX.interception;
    const light = mk(
      new THREE.SphereGeometry(flash.radius * this.worldScale, 12, 10),
      new THREE.MeshBasicMaterial({ color: flash.color, transparent: true, opacity: 1, toneMapped: false }),
    );
    light.position.set(position.x, position.y, position.z);
    this.scene.add(light);
    this.particles.push({ mesh: light, life: flash.lifetime, totalLife: flash.lifetime, type: 'impact-pulse', growthRate: flash.growthRate, maxOpacity: 1 });
    this.spawnMissileBlast(position, blastRadius * this.worldScale, FX.impactBlast);
  }

  // `radius` en unidades de mundo: la bola de fuego llega a medir más o menos eso.
  spawnMissileBlast(position, radius, { dirtColor, dirtCount, smokeRadius, overlay = false }) {
    const { fireball, core, sizePerRadius } = FX.missileBlast;
    for (const part of [fireball, core]) {
      const mesh = mk(
        new THREE.SphereGeometry(part.startRadius * radius, 14, 12),
        new THREE.MeshBasicMaterial({ color: part.color, transparent: true, opacity: part.opacity, depthWrite: false, depthTest: !overlay }),
      );
      mesh.position.set(position.x, position.y, position.z);
      this.scene.add(mesh);
      this.particles.push({ mesh, life: part.lifetime, totalLife: part.lifetime, type: 'impact-pulse', growthRate: part.growthRate, maxOpacity: part.opacity });
    }
    const blast = this.createFlipbookSprite(position, FX.explosionFlipbook, 'explosion', (radius / this.worldScale) * sizePerRadius);
    if (blast) this.particles.push(blast);
    this.spawnSmokePuff(position, FX.smokeBurst, { offsetY: FX.smokeBurst.yOffset * this.worldScale * 0.5, lifetime: FX.smokeBurst.lifetime, radius: smokeRadius });
    this.spawnDebris(position, dirtColor, dirtCount);
  }

  // Un vehículo o un dron destruido: explosión de su tamaño y esquirlas de metal que giran y caen.
  spawnVehicleDeath({ position, size: length = 1, flying }) {
    const vd = FX.vehicleDeath;
    const size = Math.max(vd.minSize, length);
    const s = this.worldScale;
    const center = { x: position.x, y: position.y + (flying ? 0 : vd.lift * size * s), z: position.z };
    this.spawnMissileBlast(center, vd.blastPerSize * size * s, { dirtColor: vd.debris.colors[0], dirtCount: 0, smokeRadius: vd.smokeRadiusPerSize * size, overlay: Boolean(flying) });
    const d = vd.debris;
    for (let index = 0; index < Math.round(d.perSize * size); index++) {
      const piece = (d.sizeMin + Math.random() * d.sizeRange) * s * size;
      const mesh = mk(
        new THREE.BoxGeometry(piece, piece * (0.4 + Math.random() * 0.6), piece * (0.6 + Math.random() * 0.8)),
        new THREE.MeshBasicMaterial({ color: d.colors[index % d.colors.length] }),
      );
      mesh.position.set(center.x, center.y, center.z);
      this.scene.add(mesh);
      const angle = Math.random() * Math.PI * 2;
      const push = (0.4 + Math.random() * 0.6) * d.horizontal * s;
      const life = d.lifetimeMin + Math.random() * d.lifetimeRange;
      this.particles.push({
        mesh,
        life,
        totalLife: life,
        vx: Math.cos(angle) * push,
        vy: (d.verticalMin + Math.random() * d.verticalRange) * s,
        vz: Math.sin(angle) * push,
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(d.spin),
        type: 'debris',
        maxOpacity: 1,
      });
    }
  }

  spawnDebris(position, color, count, pieceScale = 1) {
    const db = FX.debris;
    for (let index = 0; index < count; index++) {
      const size = (db.sizeMin + Math.random() * db.sizeRange) * this.worldScale * pieceScale;
      const mesh = mk(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color }));
      mesh.position.set(position.x, position.y, position.z);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        life: db.lifetimeMin + Math.random() * db.lifetimeRange,
        totalLife: db.lifetimeMin + db.lifetimeRange,
        vx: (Math.random() - 0.5) * db.velocity.horizontal * this.worldScale,
        vy: (Math.random() * db.velocity.verticalRange + db.velocity.verticalMin) * this.worldScale,
        vz: (Math.random() - 0.5) * db.velocity.horizontal * this.worldScale,
        type: 'debris',
        maxOpacity: 1,
      });
    }
  }

  updateParticles(dt) {
    const hs = FX.hitSpark;
    const db = FX.debris;

    this.particles = this.particles.filter((particle) => {
      particle.life -= dt;
      if (particle.life <= 0) {
        disposeParticleMesh(this.scene, particle);
        return false;
      }

      if (particle.type === 'interceptor') {
        particle.mesh.position.lerpVectors(particle.start, particle.end, 1 - particle.life / particle.totalLife);
      } else if (particle.type === 'interceptor-trail') {
        const elapsed = particle.totalLife - particle.life;
        const reached = Math.min(1, elapsed / particle.seconds);
        const length = particle.start.distanceTo(particle.end) * reached;
        particle.mesh.scale.y = Math.max(length, 1e-3);
        particle.mesh.position.lerpVectors(particle.start, particle.end, reached / 2);
        particle.mesh.material.opacity = elapsed < particle.seconds ? 1 : particle.life / (particle.totalLife - particle.seconds);
      } else if (particle.type === 'impact-pulse') {
        const growthRate = particle.growthRate ?? hs.growthRate;
        particle.mesh.scale.multiplyScalar(1 + dt * growthRate);
        if (particle.mesh.material) {
          particle.mesh.material.opacity = Math.max(0, particle.life / particle.totalLife) * (particle.maxOpacity ?? 1);
        }
      } else if (particle.type === 'explosion-flash') {
        particle.mesh.scale.multiplyScalar(1 + dt * (particle.growthRate ?? 10));
        if (particle.mesh.material) {
          particle.mesh.material.opacity = Math.max(0, particle.life / particle.totalLife) * (particle.maxOpacity ?? 1);
        }
      } else if (particle.type === 'smoke') {
        particle.mesh.position.y += particle.vy * dt;
        particle.mesh.position.x += particle.vx * dt;
        particle.mesh.position.z += particle.vz * dt;
        particle.mesh.scale.multiplyScalar(1 + dt * particle.growthRate);
        if (particle.mesh.material) {
          particle.mesh.material.opacity = Math.max(0, particle.life / particle.totalLife) * particle.opacityMultiplier * particle.maxOpacity;
        }
      } else if (particle.type === 'debris') {
        particle.vy -= db.gravity * this.worldScale * dt;
        particle.mesh.position.x += particle.vx * dt;
        particle.mesh.position.y += particle.vy * dt;
        particle.mesh.position.z += particle.vz * dt;
        if (particle.spin) {
          particle.mesh.rotation.x += particle.spin.x * dt;
          particle.mesh.rotation.y += particle.spin.y * dt;
          particle.mesh.rotation.z += particle.spin.z * dt;
        }
        if (particle.mesh.material) {
          particle.mesh.material.opacity = Math.max(0, particle.life / db.opacityLifetime);
          particle.mesh.material.transparent = true;
        }
      } else if (particle.type === 'flipbook') {
        const elapsed = particle.totalLife - particle.life;
        const frame = Math.min(
          particle.frameCount - 1,
          Math.floor(elapsed * particle.fps),
        );
        if (frame !== particle.frame) {
          normalizeAtlasFrame(particle.texture, particle.tilesX, particle.tilesY, frame);
          particle.frame = frame;
        }
        if (particle.mesh.material) {
          particle.mesh.material.opacity = Math.max(0, particle.life / particle.totalLife) * particle.maxOpacity;
        }
      } else if (particle.type === 'reward-text') {
        particle.mesh.position.y += particle.riseSpeed * dt;
        particle.mesh.position.x += particle.driftX * dt;
        particle.mesh.position.z += particle.driftZ * dt;
        const lifeRatio = Math.max(0, particle.life / particle.totalLife);
        const pulse = 1 + (1 - lifeRatio) * particle.pulse;
        particle.mesh.scale.set(particle.baseScaleX * pulse, particle.baseScaleY * pulse, 1);
        if (particle.mesh.material) {
          particle.mesh.material.opacity = lifeRatio * particle.maxOpacity;
        }
      }

      return true;
    });
  }
}
