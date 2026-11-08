import * as THREE from 'three';
import { MAT, mk } from './materials.js';
import { gridToWorld } from '../core/coordinates.js';
import { RENDERING_CONFIG } from './config/rendering.js';

const MAP = RENDERING_CONFIG.map;

export class MapRenderer {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.cells = [];
    this.hoveredCell = null;
    const ri = MAP.rangeIndicator;
    this.rangeIndicator = mk(
      new THREE.RingGeometry(0, 1, ri.segments),
      new THREE.MeshBasicMaterial({ color: ri.color, transparent: true, opacity: ri.opacity, side: THREE.DoubleSide }),
    );
    this.rangeIndicator.rotation.x = -Math.PI / 2;
    this.rangeIndicator.position.y = ri.yOffset * this.config.worldScale;
    this.rangeIndicator.visible = false;

    const sel = MAP.selection;
    const s = this.config.worldScale;
    this.selectionRing = mk(
      new THREE.RingGeometry(sel.innerRadius * s, sel.outerRadius * s, sel.segments),
      new THREE.MeshBasicMaterial({ color: sel.color, transparent: true, opacity: sel.opacity, side: THREE.DoubleSide }),
    );
    this.selectionRange = mk(
      new THREE.RingGeometry(0, 1, ri.segments),
      new THREE.MeshBasicMaterial({ color: sel.rangeColor, transparent: true, opacity: sel.rangeOpacity, side: THREE.DoubleSide }),
    );
    for (const mesh of [this.selectionRing, this.selectionRange]) {
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
    }
  }

  build() {
    const s = this.config.worldScale;
    const grassTileHeight = this.config.groundTileHeightWorld;
    const pathTileHeight = this.config.pathTileHeightWorld;
    const { width, height, pathPoints, visualModel } = this.config.mapDefinition;
    const baseGrid = this.config.baseGrid;

    const gnd = MAP.ground;
    const ground = mk(new THREE.BoxGeometry((width + gnd.padding) * s, gnd.height * s, (height + gnd.padding) * s), MAT.grass);
    ground.position.y = gnd.yOffset * s;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const sg = MAP.subGround;
    const subGround = mk(
      new THREE.BoxGeometry((width + sg.padding) * s, sg.height * s, (height + sg.padding) * s),
      new THREE.MeshStandardMaterial({ color: sg.color }),
    );
    subGround.position.y = sg.yOffset * s;
    this.scene.add(subGround);

    const tl = MAP.tile;
    const cb = MAP.curb;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isPath = baseGrid[y][x] === 1;
        const material = isPath ? MAT.road.clone() : MAT.grass.clone();
        if (!isPath) {
          const variance = tl.grassVarianceMin + Math.random() * tl.grassVarianceRange;
          material.color.setRGB(0.26 * variance, 0.56 * variance, 0.17 * variance);
        }
        const tileHeight = isPath ? pathTileHeight : grassTileHeight;
        const tile = mk(new THREE.BoxGeometry(tl.size * s, tileHeight, tl.size * s), material);
        const tileWorld = gridToWorld(x, y, s, this.config.halfWidth, this.config.halfHeight);
        tile.position.set(tileWorld.x, tileHeight / 2, tileWorld.z);
        tile.receiveShadow = true;
        tile.userData = { gx: x, gy: y, baseMaterial: material };
        this.scene.add(tile);
        this.cells.push(tile);

        if (isPath) {
          const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height || baseGrid[ny][nx] !== 1) {
              const curb = mk(new THREE.BoxGeometry((dx ? cb.thickness : tl.size) * s, cb.height * s, (dy ? cb.thickness : tl.size) * s), MAT.roadEdge);
              curb.position.set(tileWorld.x + dx * cb.offset * s, cb.yOffset * s, tileWorld.z + dy * cb.offset * s);
              curb.receiveShadow = true;
              this.scene.add(curb);
            }
          }
        }
      }
    }

    const rd = MAP.roadDash;
    for (let index = 0; index < pathPoints.length - 1; index++) {
      const dx = Math.sign(pathPoints[index + 1][0] - pathPoints[index][0]);
      const dy = Math.sign(pathPoints[index + 1][1] - pathPoints[index][1]);
      let xx = pathPoints[index][0];
      let yy = pathPoints[index][1];
      let count = 0;
      while (xx !== pathPoints[index + 1][0] || yy !== pathPoints[index + 1][1]) {
        if (count % 2 === 0) {
          const dash = mk(new THREE.BoxGeometry((dx ? rd.length : rd.width) * s, rd.height * s, (dy ? rd.length : rd.width) * s), MAT.roadLine);
          const dashWorld = gridToWorld(xx, yy, s, this.config.halfWidth, this.config.halfHeight);
          dash.position.set(dashWorld.x, rd.yOffset * s, dashWorld.z);
          this.scene.add(dash);
        }
        xx += dx;
        yy += dy;
        count += 1;
      }
    }

    this.buildEdgeFog();

    const mk_ = MAP.markers;
    const spawnPoint = pathPoints[0];
    const spawnWorld = gridToWorld(spawnPoint[0], spawnPoint[1], s, this.config.halfWidth, this.config.halfHeight);
    const sp = mk_.spawn;
    this.spawnMarker = mk(new THREE.CylinderGeometry(sp.topRadius * s, sp.bottomRadius * s, sp.height * s, sp.segments), new THREE.MeshStandardMaterial({ color: sp.color }));
    this.spawnMarker.position.set(spawnWorld.x, this.config.pathSurfaceY + sp.yOffset * s, spawnWorld.z);
    this.scene.add(this.spawnMarker);

    const basePoint = pathPoints[pathPoints.length - 1];
    const baseWorld = gridToWorld(basePoint[0], basePoint[1], s, this.config.halfWidth, this.config.halfHeight);
    const bp = mk_.base;
    this.baseMarker = mk(new THREE.CylinderGeometry(bp.topRadius * s, bp.bottomRadius * s, bp.height * s, bp.segments), new THREE.MeshStandardMaterial({ color: bp.color }));
    this.baseMarker.position.set(baseWorld.x, this.config.pathSurfaceY + bp.yOffset * s, baseWorld.z);
    this.scene.add(this.baseMarker);

    const bb = mk_.baseBuilding;
    const baseBuilding = mk(new THREE.BoxGeometry(bb.size * s, bb.height * s, bb.size * s), new THREE.MeshStandardMaterial({ color: bb.color }));
    baseBuilding.position.set(baseWorld.x, this.config.pathSurfaceY + bb.yOffset * s, baseWorld.z);
    baseBuilding.castShadow = true;
    this.scene.add(baseBuilding);
    this.scene.add(this.rangeIndicator);
    this.scene.add(this.selectionRing, this.selectionRange);
  }

  updateAnimatedMarkers(elapsedTime) {
    this.spawnMarker.rotation.y = elapsedTime * MAP.markers.spawn.rotationSpeed;
    this.baseMarker.rotation.y = elapsedTime * MAP.markers.base.rotationSpeed;
  }

  restoreCell(gx, gy) {
    const cell = this.cells[gy * this.config.mapDefinition.width + gx];
    if (cell) cell.material = cell.userData.baseMaterial;
  }

  /** Niebla oscura sobre el territorio enemigo: los vehículos salen de ella. */
  buildEdgeFog() {
    if (!this.config.mapDefinition.enemyTerritory) return;
    const { fadeColumns, endColumn, lengthColumns, depthColumns, y, renderOrder } = MAP.edgeFog;
    const s = this.config.worldScale;
    const color = new THREE.Color(this.config.mapDefinition.visualModel.backgroundColor).getStyle();

    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1 - fadeColumns / lengthColumns, color);
    gradient.addColorStop(1, color.replace('rgb(', 'rgba(').replace(')', ',0)'));
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    // Sin prueba de profundidad y dibujada al final: también tapa a los vehículos que vienen.
    const fog = mk(
      new THREE.PlaneGeometry(lengthColumns * s, depthColumns * s),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    );
    fog.rotation.x = -Math.PI / 2;
    fog.renderOrder = renderOrder;
    const edge = gridToWorld(endColumn - 0.5, 0, s, this.config.halfWidth, this.config.halfHeight);
    fog.position.set(edge.x - (lengthColumns * s) / 2, y * s, 0);
    this.scene.add(fog);
  }

  /** La torre que se inspecciona lleva un anillo y su alcance en cian (construir va en verde). */
  updateSelection(tower, towerDefinitions) {
    this.selectionRing.visible = Boolean(tower);
    this.selectionRange.visible = Boolean(tower);
    if (!tower) return;
    const s = this.config.worldScale;
    const y = MAP.selection.yOffset * s;
    this.selectionRing.position.set(tower.wx, y, tower.wz);
    this.selectionRange.position.set(tower.wx, y, tower.wz);
    this.selectionRange.scale.setScalar(towerDefinitions[tower.towerTypeId].levels[tower.level].range * s);
  }

  updateHover(state, hoveredCell, towerDefinitions) {
    if (this.hoveredCell) {
      this.restoreCell(this.hoveredCell.gx, this.hoveredCell.gy);
    }

    this.hoveredCell = hoveredCell;
    this.rangeIndicator.visible = false;
    if (!hoveredCell) return;

    const cell = this.cells[hoveredCell.gy * this.config.mapDefinition.width + hoveredCell.gx];
    const cellValue = state.grid[hoveredCell.gy][hoveredCell.gx];
    // Una torre o una roca se puede abrir; la roca, para sacarla.
    cell.material = cellValue === 0 ? MAT.hover : cellValue === 2 || cellValue === 4 ? MAT.selected : MAT.invalid;

    const riYOffset = MAP.rangeIndicator.yOffset;
    if (cellValue === 0) {
      this.rangeIndicator.visible = true;
      this.rangeIndicator.scale.setScalar(towerDefinitions[state.buildTowerTypeId].levels[0].range * this.config.worldScale);
      const hoveredWorld = gridToWorld(hoveredCell.gx, hoveredCell.gy, this.config.worldScale, this.config.halfWidth, this.config.halfHeight);
      this.rangeIndicator.position.set(hoveredWorld.x, riYOffset * this.config.worldScale, hoveredWorld.z);
    } else if (cellValue === 2) {
      const tower = state.towers.find((item) => item.gx === hoveredCell.gx && item.gy === hoveredCell.gy);
      // La seleccionada ya muestra su alcance (updateSelection).
      if (!tower || tower.id === state.selectedTowerId) return;
      this.rangeIndicator.visible = true;
      this.rangeIndicator.scale.setScalar(towerDefinitions[tower.towerTypeId].levels[tower.level].range * this.config.worldScale);
      this.rangeIndicator.position.set(tower.wx, riYOffset * this.config.worldScale, tower.wz);
    }
  }
}
