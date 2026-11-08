import { LAYOUT_CONFIG } from './layout-config.js';

function toPx(value) {
  return `${Math.round(value)}px`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveViewportHeight(win) {
  return Math.floor(win.innerHeight);
}

function resolveViewportWidth(win) {
  return Math.floor(win.innerWidth);
}

function resolvePanelHeight(config, win) {
  const viewportHeight = resolveViewportHeight(win);
  const targetHeight = (viewportHeight * config.panel.viewportHeightPercent) / 100;
  return clamp(targetHeight, config.panel.minHeightPx, config.panel.maxHeightPx);
}

export function createLayoutCoordinator(doc, config = LAYOUT_CONFIG) {
  const win = doc.defaultView;
  const root = doc.documentElement;

  function apply() {
    const viewportWidth = resolveViewportWidth(win);
    const viewportHeight = resolveViewportHeight(win);
    const panelHeight = resolvePanelHeight(config, win);
    const viewportTopOffset = 0;
    const viewportLeftOffset = 0;
    const bottomInset = Math.max(0, config.viewport.minBottomSafePx ?? 0);
    const bottomBuffer = config.viewport.windowBottomBufferPx + bottomInset;
    const topBuffer = config.viewport.windowTopBufferPx;
    const rightBuffer = config.viewport.windowRightBufferPx;
    const leftBuffer = config.viewport.windowLeftBufferPx;

    root.style.setProperty('--cfg-app-width', toPx(viewportWidth));
    root.style.setProperty('--cfg-app-height', toPx(viewportHeight));
    root.style.setProperty('--cfg-app-left', toPx(viewportLeftOffset));
    root.style.setProperty('--cfg-app-top', toPx(viewportTopOffset));
    root.style.setProperty('--cfg-panel-height', toPx(panelHeight));
    root.style.setProperty('--cfg-panel-safe-bottom', toPx(config.panel.safeBottomPx));
    root.style.setProperty('--cfg-window-bottom-buffer', toPx(bottomBuffer));
    root.style.setProperty('--cfg-window-top-buffer', toPx(topBuffer));
    root.style.setProperty('--cfg-window-right-buffer', toPx(rightBuffer));
    root.style.setProperty('--cfg-window-left-buffer', toPx(leftBuffer));
    root.style.setProperty('--cfg-lower-ui-gap', toPx(config.overlayUi.lowerGapPx));
    root.style.setProperty('--cfg-tip-gap', toPx(config.overlayUi.tipGapPx));
    root.style.setProperty('--cfg-canvas-overscan-x', toPx(config.canvas.overscanXPx));
    root.style.setProperty('--cfg-canvas-shift-x', toPx(config.canvas.shiftXPx));
    root.style.setProperty('--cfg-canvas-shift-y', toPx(config.canvas.shiftYPx));
  }

  apply();

  return {
    apply,
    getConfig() {
      return config;
    },
  };
}
