import * as THREE from 'three';
import { FRAMING_CONFIG } from './config/framing.js';

function applyCameraPose(camera, angle, elevation, distance, worldScale, target) {
  // La cámara se traslada con el punto que mira: si solo girara hacia él, el mapa se deformaría
  // al arrastrarlo.
  camera.position.set(
    target.x + Math.cos(angle) * Math.cos(elevation) * distance * worldScale,
    target.y + Math.sin(elevation) * distance * worldScale,
    target.z + Math.sin(angle) * Math.cos(elevation) * distance * worldScale,
  );
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}

function getPlayableHalfExtents(mapDefinition, worldScale, framingConfig) {
  const padding = framingConfig.fitPlayablePadding ?? 0;
  const hiddenColumns = mapDefinition.enemyTerritory?.columns ?? 0;
  return {
    centerX: (hiddenColumns * worldScale) / 2,
    halfWidth: ((mapDefinition.width - hiddenColumns + padding) * worldScale) / 2,
    halfDepth: ((mapDefinition.height + padding) * worldScale) / 2,
  };
}

function getPlayableCorners(mapDefinition, worldScale, framingConfig) {
  const { centerX, halfWidth, halfDepth } = getPlayableHalfExtents(mapDefinition, worldScale, framingConfig);
  return [
    new THREE.Vector3(centerX - halfWidth, 0, -halfDepth),
    new THREE.Vector3(centerX - halfWidth, 0, halfDepth),
    new THREE.Vector3(centerX + halfWidth, 0, -halfDepth),
    new THREE.Vector3(centerX + halfWidth, 0, halfDepth),
  ];
}

function getFitCamSize(camera, mapDefinition, worldScale, aspect, target, framingConfig) {
  const corners = getPlayableCorners(mapDefinition, worldScale, framingConfig);

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const corner of corners) {
    const local = corner.clone().sub(target).applyQuaternion(camera.quaternion.clone().invert());
    minX = Math.min(minX, local.x);
    maxX = Math.max(maxX, local.x);
    minY = Math.min(minY, local.y);
    maxY = Math.max(maxY, local.y);
  }

  const requiredHalfHeight = Math.max((maxY - minY) / 2, (maxX - minX) / (2 * aspect));
  return requiredHalfHeight * framingConfig.fitPadding;
}

function projectPointToViewport(camera, point, viewportRect) {
  const ndc = point.clone().project(camera);
  return {
    x: ((ndc.x + 1) / 2) * viewportRect.width,
    y: ((1 - ndc.y) / 2) * viewportRect.height,
  };
}

function computeProjectedPlayableBounds(camera, mapDefinition, worldScale, framingConfig, viewportRect) {
  const points = getPlayableCorners(mapDefinition, worldScale, framingConfig).map((corner) =>
    projectPointToViewport(camera, corner, viewportRect),
  );

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    points,
  };
}

function screenToGround(camera, viewportRect, raycaster, plane, screenX, screenY) {
  const ndcX = (screenX / viewportRect.width) * 2 - 1;
  const ndcY = 1 - (screenY / viewportRect.height) * 2;
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, hit)) return null;
  return hit;
}

function recenterTargetToViewport({
  camera,
  mapDefinition,
  worldScale,
  framingConfig,
  viewportRect,
  target,
  raycaster,
  plane,
}) {
  const centering = framingConfig.centering ?? {};
  const bounds = computeProjectedPlayableBounds(camera, mapDefinition, worldScale, framingConfig, viewportRect);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const desiredX = viewportRect.width * (centering.screenXRatio ?? 0.5);
  const desiredY = viewportRect.height * (centering.screenYRatio ?? 0.5);
  const tolerance = centering.tolerancePx ?? 0.5;

  if (Math.abs(centerX - desiredX) <= tolerance && Math.abs(centerY - desiredY) <= tolerance) {
    return false;
  }

  const currentWorld = screenToGround(camera, viewportRect, raycaster, plane, centerX, centerY);
  const desiredWorld = screenToGround(camera, viewportRect, raycaster, plane, desiredX, desiredY);
  if (!currentWorld || !desiredWorld) return false;

  target.x += currentWorld.x - desiredWorld.x;
  target.z += currentWorld.z - desiredWorld.z;
  return true;
}

export function createSceneRuntime({
  viewportEl,
  mapDefinition,
  worldScale = 1,
  framingConfig = FRAMING_CONFIG,
}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(mapDefinition.visualModel.backgroundColor);

  let cameraAngle = framingConfig.initialAngle;
  const cameraElevation = framingConfig.elevation;
  const target = new THREE.Vector3(
    (framingConfig.lookAtXOffset ?? 0) * worldScale,
    0,
    (framingConfig.lookAtZOffset ?? 0) * worldScale,
  );
  let fitCamSize = framingConfig.initialSize * worldScale;
  let zoomRatio = framingConfig.zoom.defaultRatio ?? 1;
  let hasInitializedZoom = false;
  // Cuánto se arrastró el mapa desde el encuadre centrado. Sin zoom no hay nada que mover: el
  // margen crece a medida que se acerca, y alejarse del todo vuelve a centrarlo.
  const pan = new THREE.Vector3();
  const viewPoint = new THREE.Vector3();
  let camSize = fitCamSize * zoomRatio;

  const camera = new THREE.OrthographicCamera(-1, 1, camSize, -camSize, 0.1, framingConfig.farPlane * worldScale);
  const touchDevice = isTouchDevice() ? framingConfig.touchDevice : null;
  const renderer = new THREE.WebGLRenderer({ antialias: touchDevice?.antialias ?? true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, touchDevice?.maxPixelRatio ?? framingConfig.maxPixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = touchDevice && !touchDevice.softShadows ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  viewportEl.insertBefore(renderer.domElement, viewportEl.firstChild);
  const recenterRaycaster = new THREE.Raycaster();
  const recenterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const { lighting } = framingConfig;
  scene.add(new THREE.AmbientLight(lighting.ambient.color, lighting.ambient.intensity));
  const sunLight = new THREE.DirectionalLight(lighting.sun.color, lighting.sun.intensity);
  sunLight.position.set(
    lighting.sun.position[0] * worldScale,
    lighting.sun.position[1] * worldScale,
    lighting.sun.position[2] * worldScale,
  );
  sunLight.castShadow = true;
  sunLight.shadow.camera.left = -lighting.sun.shadowBounds * worldScale;
  sunLight.shadow.camera.right = lighting.sun.shadowBounds * worldScale;
  sunLight.shadow.camera.top = lighting.sun.shadowBounds * worldScale;
  sunLight.shadow.camera.bottom = -lighting.sun.shadowBounds * worldScale;
  const shadowMapSize = touchDevice?.shadowMapSize ?? lighting.sun.shadowMapSize;
  sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(lighting.fill.color, lighting.fill.intensity);
  fillLight.position.set(
    lighting.fill.position[0] * worldScale,
    lighting.fill.position[1] * worldScale,
    lighting.fill.position[2] * worldScale,
  );
  scene.add(fillLight);

  function applyPannedPose() {
    const { halfWidth, halfDepth } = getPlayableHalfExtents(mapDefinition, worldScale, framingConfig);
    const slack = 1 - zoomRatio;
    pan.x = Math.max(-halfWidth * slack, Math.min(halfWidth * slack, pan.x));
    pan.z = Math.max(-halfDepth * slack, Math.min(halfDepth * slack, pan.z));
    viewPoint.copy(target).add(pan);
    applyCameraPose(camera, cameraAngle, cameraElevation, framingConfig.distance, worldScale, viewPoint);
  }

  function groundAt(rect, x, y) {
    return screenToGround(camera, rect, recenterRaycaster, recenterPlane, x, y);
  }

  function resize() {
    const rect = viewportEl.getBoundingClientRect();
    const aspect = rect.width / rect.height;

    applyCameraPose(camera, cameraAngle, cameraElevation, framingConfig.distance, worldScale, target);
    const fitSize = getFitCamSize(camera, mapDefinition, worldScale, aspect, target, framingConfig);
    if (Number.isFinite(fitSize) && fitSize > 0) {
      fitCamSize = fitSize;
    }
    if (!hasInitializedZoom) {
      zoomRatio = (framingConfig.zoom.defaultRatio ?? 1) + (framingConfig.initialZoomRatio ?? 0);
      hasInitializedZoom = true;
    }
    zoomRatio = Math.max(
      framingConfig.zoom.minRatio,
      Math.min(framingConfig.zoom.maxRatio, zoomRatio),
    );
    camSize = fitCamSize * zoomRatio;

    camera.left = -camSize * aspect;
    camera.right = camSize * aspect;
    camera.top = camSize;
    camera.bottom = -camSize;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);

    if (recenterTargetToViewport({
      camera,
      mapDefinition,
      worldScale,
      framingConfig,
      viewportRect: rect,
      target,
      raycaster: recenterRaycaster,
      plane: recenterPlane,
    })) {
      applyCameraPose(camera, cameraAngle, cameraElevation, framingConfig.distance, worldScale, target);
    }
    applyPannedPose();
  }

  function rotate(deltaX) {
    cameraAngle += deltaX * framingConfig.rotation.sensitivity;
    resize();
  }

  /** Acerca o aleja manteniendo fijo el punto del mapa que está bajo el cursor. */
  function zoom(deltaY, clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const before = groundAt(rect, x, y);
    zoomRatio += deltaY * framingConfig.zoom.sensitivity;
    resize();
    const after = groundAt(rect, x, y);
    if (!before || !after) return;
    pan.x += before.x - after.x;
    pan.z += before.z - after.z;
    applyPannedPose();
  }

  /** Arrastra el mapa con la mano: lo que estaba bajo el cursor sigue bajo el cursor. */
  function panBy(deltaX, deltaY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const from = groundAt(rect, rect.width / 2, rect.height / 2);
    const to = groundAt(rect, rect.width / 2 + deltaX, rect.height / 2 + deltaY);
    if (!from || !to) return;
    pan.x += from.x - to.x;
    pan.z += from.z - to.z;
    applyPannedPose();
  }

  function getProjectedPlayableBounds() {
    const viewportRect = viewportEl.getBoundingClientRect();
    return computeProjectedPlayableBounds(camera, mapDefinition, worldScale, framingConfig, viewportRect);
  }

  resize();

  return {
    scene,
    camera,
    renderer,
    resize,
    rotate,
    zoom,
    panBy,
    getProjectedPlayableBounds,
    get cameraAngle() {
      return cameraAngle;
    },
    get framing() {
      return {
        fitCamSize,
        zoomRatio,
        camSize,
        target: target.clone(),
      };
    },
  };
}

/** Pantalla táctil sin mouse: teléfonos y tabletas. */
export function isTouchDevice() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}
