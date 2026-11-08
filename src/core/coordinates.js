export function gridToWorld(gx, gy, worldScale, halfWidth, halfHeight) {
  return {
    x: (gx - halfWidth + 0.5) * worldScale,
    y: 0,
    z: (gy - halfHeight + 0.5) * worldScale,
  };
}

export function worldToGrid(wx, wz, worldScale, halfWidth, halfHeight) {
  return {
    gx: Math.floor(wx / worldScale + halfWidth),
    gy: Math.floor(wz / worldScale + halfHeight),
  };
}
