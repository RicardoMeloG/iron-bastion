export const defaultMapDefinition = {
  id: 'default-map',
  width: 24,
  height: 11,
  maxLives: 20,
  // Alcanza para una sola MG-7, y las primeras oleadas se pueden con ella.
  initialCredits: 60,
  // Columnas que la cámara no muestra: el camino sigue por ahí, bajo la niebla, y no se
  // construye. Con 6, ninguna torre alcanza el punto de aparición, ni siquiera la LM-2 de nivel
  // 5 (5 celdas): los vehículos llegan desde fuera del mapa, no aparecen bajo el fuego.
  enemyTerritory: { columns: 6 },
  pathPoints: [
    [0, 6],
    [9, 6],
    [9, 1],
    [13, 1],
    [13, 9],
    [17, 9],
    [17, 1],
    [20, 1],
    [20, 5],
    [23, 5],
  ],
  // Por dónde entran las escuadras de infantería: siempre por el lado de la niebla, en la columna
  // `column`. Al principio, por las filas centrales `earlyRows`; desde la oleada `openFromWave`, por
  // cualquiera de ese borde, esquinas incluidas.
  infantrySpawn: { column: 5, earlyRows: [4, 7], allRows: [0, 10], openFromWave: 4 },
  // Rocas, en celdas libres. Casi todas en las rutas de la infantería, que las usa de cobertura:
  // quitan lugares buenos para las torres, y sacarlas cuesta dinero.
  rocks: [
    [7, 2],
    [7, 8],
    [10, 6],
    [11, 3],
    [12, 5],
    [12, 8],
    [14, 2],
    [14, 6],
    [16, 5],
    [16, 8],
    [18, 3],
    [18, 7],
    [19, 5],
    [21, 4],
    [21, 7],
  ],
  // Árboles, en celdas libres. Los primeros seis, donde la infantería recibe más disparos: ahí
  // caen durante la partida. Los demás, en grupos hacia los bordes. Ninguno ocupa una celda de la
  // partida de referencia.
  trees: [
    [7, 5],
    [10, 4],
    [14, 7],
    [15, 5],
    [15, 8],
    [18, 4],
    [6, 0],
    [6, 1],
    [7, 3],
    [9, 10],
    [10, 10],
    [20, 9],
    [21, 10],
    [22, 0],
    [23, 1],
  ],
  // Arbustos: casi todos donde la infantería recibe disparos. No ocupan la celda: una torre los aplasta.
  bushes: [
    [7, 7],
    [8, 5],
    [8, 7],
    [11, 2],
    [11, 9],
    [12, 3],
    [15, 6],
    [16, 2],
    [16, 7],
    [18, 5],
    [19, 6],
    [19, 7],
    [21, 8],
    [22, 3],
  ],
  visualModel: {
    backgroundColor: 0x0b1622,
    groundTileHeight: 0.04,
    pathTileHeight: 0.08,
  },
};
