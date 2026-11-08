# Estándar de modelos

Contrato que cumple **todo** modelo 3D que el juego dibuja (ADR 001). Es normativo: si un modelo no lo cumple, no entra. Lo verifica `npm run check:rigs` (`tools/asset-pipeline/validate-rig.mjs`) y lo produce el normalizador (tarea T03). Nadie tiene que abrir Blender para cumplirlo.

## Archivo

- glTF binario (`.glb`), un vehículo o torre por archivo, en `public/models/<id>.glb`. Un modelo que no se puede publicar (`"publish": false` en su manifiesto) va a `assets/test-models/<id>.glb`: así no llega al build, y se valida igual.
- Lo genera el normalizador desde `assets/source/`. No se edita a mano.
- Las torres también siguen el estándar: su `hull` es la base. La LM-2 se carga de su `.glb` como un vehículo y su tamaño en el juego es `model.scale` de su definición.
- Sin animaciones: el juego anima la torreta, el cañón y las ruedas.
- Sin cámaras ni luces.

## Ejes, origen y escala

- **+Y es arriba y +Z es el frente** del vehículo, que es hacia donde avanza.
- **El origen** queda en el centro del chasis visto desde arriba y a ras del suelo: `y = 0` es el punto más bajo del modelo (la base de las ruedas u orugas).
- **Escala:** el chasis mide 1 unidad de largo. El tamaño en el juego lo da un solo número por tipo de unidad: `model.scale` en `src/content/enemies/`, el largo del vehículo en celdas del mapa. Está en el contenido y no en render porque el núcleo también lo necesita (de dónde sale la bala, T07).
- Ningún nodo del rig (ver abajo) tiene escala no uniforme. El normalizador hornea las transformaciones en la malla.

## Jerarquía

```
unit_root                  identidad
├── hull                   todo lo que no gira
├── wheel_*                opcional; giran sobre su eje X
└── turret_yaw             solo si la unidad tiene arma
    ├── (mallas de la torreta)
    └── gun_pitch
        ├── (mallas del cañón)
        ├── muzzle_01      punta del primer cañón
        └── muzzle_02 …    uno por cañón
```

| Nodo | Posición | Rotación en reposo | Movimiento permitido |
|---|---|---|---|
| `unit_root` | origen | identidad | lo mueve el juego (posición y rumbo) |
| `turret_yaw` | centro del aro de la torreta | identidad | solo `rotation.y` |
| `gun_pitch` | eje de los muñones, donde pivota el cañón | identidad | solo `rotation.x`; un valor **negativo eleva** (convención de Three.js) |
| `muzzle_NN` | punta del cañón | identidad, así que apunta a +Z | ninguno |

En reposo, todos los cañones apuntan al frente del vehículo (+Z) y quedan horizontales.

Con esto, el código del juego mueve cualquier torreta igual:

```js
turretYaw.rotation.y = aimAngle - bodyAngle;
gunPitch.rotation.x = -aimPitch;
```

## Estilo

Todos los vehículos comparten la estética del mapa y la MG-7 (spec 001, D-6): colores planos de la paleta común (`src/render/config/palette.js`), sin texturas, con sombreado por cara. El normalizador lo aplica cuando el manifiesto trae `style`:

1. Cada vértice toma el color de su material (o de la textura en ese punto) y se lleva al color más cercano de la paleta, medido en CIELAB.
2. Se descartan UV, normales y tangentes, se sueldan los vértices y, si se pide, se simplifica la malla con meshoptimizer.
3. Cada triángulo queda con un solo color, y los triángulos del mismo color comparten vértices. El modelo no lleva normales: three.js sombrea plano cuando faltan, y el archivo pesa entre 3 y 5 veces menos (T13). Hay un único material, `paleta`, que dibuja por ambos lados si el original lo hacía.

Un modelo de terceros solo puede pasar por este paso si su licencia permite modificarlo (CC-BY lo permite, con atribución). Estilizar un modelo sin licencia válida no lo vuelve propio.

## Metadatos del rig

El normalizador escribe `src/content/rigs/<id>.json`, en coordenadas de `unit_root` con escala 1:

```json
{
  "id": "m163",
  "source": "assets/source/m163a2_vads.glb",
  "hullLength": 1,
  "hitRadius": 0.32,
  "height": 0.62,
  "turretPivot": [0, 0.41, -0.05],
  "gunPivot": [0.12, 0.55, 0.08],
  "muzzles": [[0.12, 0.57, 0.71]]
}
```

El núcleo los lee de `src/content/rigs/index.js` para saber de dónde sale cada bala y hacia dónde apunta el cañón (`src/core/rig-geometry.js`), con la misma convención que render usa para dibujar. Las pruebas de `tests/muzzle.test.js` comprueban que el núcleo y el dibujo coinciden. Un rig nuevo se agrega a ese índice.

## Validación (`npm run check:rigs`)

Un modelo pasa si cumple todo esto:

1. **Jerarquía:** `unit_root` es la única raíz de la escena y `hull` es su hijo. Si tiene arma, `turret_yaw` es hijo de `unit_root`, `gun_pitch` es hijo de `turret_yaw` y cada `muzzle_NN` es hijo de `gun_pitch`.
2. **Nodos limpios:** los nodos del rig tienen rotación identidad y escala 1.
3. **Origen y tamaño:** la base del modelo está en `y = 0` (±0,01), el centro del chasis en `x = 0`, `z = 0` (±0,05) y el chasis mide 1 de largo (±0,02). El centro se mide en el chasis para que un cañón largo no corra el origen del vehículo.
4. **Cañón hacia el frente:** cada boca está delante del pivote del cañón (z mayor). Como la boca tiene rotación identidad, apunta a +Z.
5. **Giro horizontal:** al girar `turret_yaw` en pasos de 45°, la altura de cada boca no cambia (±0,005).
6. **Elevación:** al darle a `gun_pitch` −0,3 rad, cada boca sube y no se desplaza hacia los lados (±0,005).
7. **Metadatos:** existe su `src/content/rigs/<id>.json` y coincide con el modelo (±0,005).

`npm run check:rigs` revisa todo `public/models/` y las unidades generadas por código, y forma parte de `npm run check`. Para revisar un archivo suelto que todavía no pasó por el normalizador: `node tools/asset-pipeline/validate-rig.mjs archivo.glb --sin-metadatos`.

## Cómo entra un modelo nuevo

1. Copiar el original a `assets/source/` y registrar autor, URL y licencia en `docs/assets/ASSET_CREDITS.md`. Revisar la página del modelo: si dice que fue extraído de un juego («ripped»), no sirve aunque tenga licencia CC.
2. Mirar su estructura con `npm run assets:inspect -- assets/source/<archivo>.glb` (jerarquía, posiciones y cajas de cada nodo).
3. Escribir `tools/asset-pipeline/manifests/<id>.json`:

   | Campo | Obligatorio | Qué es |
   |---|---|---|
   | `id` | sí | Nombre del modelo en el juego; da nombre a `public/models/<id>.glb` y a su rig |
   | `source` | sí | Archivo original en `assets/source/` |
   | `publish` | sí | `false` si el modelo no puede publicarse (por licencia); T15 lo excluye |
   | `forward`, `up` | sí | Hacia dónde mira el frente y dónde queda arriba en el original: `+x`, `-x`, `+y`, `-y`, `+z` o `-z` |
   | `turret`, `gun` | si tiene arma y no trae `split` | Nombre del nodo que gira (la torreta) y del que eleva (el cañón) en el original |
   | `muzzles` | si tiene arma | Nodos que marcan cada boca; si el nodo tiene malla se usa su centro |
   | `turretMount` | no | `"roof"` apoya la torreta sobre el techo, para torretas armadas aparte del chasis |
   | `turretPivot` | no | `"node"` usa el origen del nodo de la torreta; por defecto, el centro de su base |
   | `gunPivot` | no | `"axis"` lo calcula sobre el eje del cañón; por defecto, el origen de su nodo si cae dentro del cañón |
   | `split` | si el original es una sola malla | Corte por volúmenes, en coordenadas del original (ver abajo). Reemplaza a `turret`, `gun`, `muzzles` y `turretPivot` |
   | `gunAxis` | no | `"forward"` da por hecho que el cañón apunta al frente, en vez de medirlo: en un lanzador con tubos a ambos lados, el eje más largo puede ser el ancho |
   | `hullFrom` | no | Toma el casco de otro modelo ya normalizado y monta la torreta en su pivote: la base común de los niveles de una torre |
   | `style` | no | Paso de estilo: `simplify` (fracción de triángulos que se busca conservar), `paint` (lista de `{ mesh, x, y, z, color }`: pinta de ese color un tramo de la pieza, en sus coordenadas; para lo que el concepto no muestra y TRELLIS inventa con manchas), `simplifyError` (cuánto puede deformarse; 0,006 por defecto en los Humvee), `brightness` (aclara la textura antes de buscar el color: las de TRELLIS salen oscuras) `palette` y `meshPalette` (colores permitidos, en todo el modelo o por pieza), `keepColorBorders` (simplifica sin borrar el límite entre colores) y `materials` (material original → color de la paleta, para lo que el muestreo no resuelve bien: vidrios, piezas sin color, la tapa del corte) |
   | `note` | no | Por qué el manifiesto es como es |

4. `npm run assets:normalize -- <id>`. El normalizador informa lo que corrigió (giro de la torreta, nivelación del cañón, montaje, escala) y valida el resultado.
5. Mirarlo en `/tools/labs/rig-viewer.html?model=<id>`: la línea roja tiene que salir por el cañón dibujado con la torreta en cualquier ángulo, y la flecha verde (+Z) tiene que apuntar al frente del vehículo. Si el vehículo mira hacia atrás, se corrige `forward` en el manifiesto; nunca en el código del juego. Para juzgar el estilo, `?fila=<id>,<id>` lo muestra junto a la MG-7 sobre el pasto del mapa.
6. Usarlo en un tipo de enemigo de `src/content/enemies/`: `model: { rig: "<id>", scale: <largo en celdas> }`. No hace falta nada más: `src/render/units.js` carga `public/models/<id>.glb` y apunta su torreta con el mismo código que a todas.

## Modelos por código (ADR 003)

Las piezas mecánicas se modelan con un guion de Blender en `tools/asset-pipeline/blender/`. `npm run assets:code` lo corre, deja el GLB en `public/models/` y su rig en `src/content/rigs/`, y lo valida. Blender se busca en `BLENDER_PATH` o en su carpeta de instalación; solo hace falta para regenerar.

Cumplen el mismo estándar y agregan esto:

- `rocket_NN`: la munición visible, hija del cañón, con el mismo número que su boca. El render la oculta al disparar y la devuelve durante la recarga (`getLoadedRockets`).
- Colores de `CODE_MODEL_PALETTE`, elegidos pieza por pieza.
- `rotor`: lo que gira sobre el centro de las bocas, como los cañones de la gatling.
- `wheel_*`: ruedas, con su eje en x. El render las hace girar según lo que avanza el vehículo.

## Modelos generados con IA (spec 002)

Un vehículo o una torre propios se generan desde una imagen de concepto con TRELLIS, que entrega una sola malla texturizada (créditos y licencias en `docs/assets/ASSET_CREDITS.md`):

1. `npm run assets:import -- <modelo de TRELLIS>.glb <id>` lo copia a `assets/source/<id>.glb` con la textura en PNG (necesita ffmpeg).
2. Se miden los volúmenes del corte con el modelo a la vista (vistas ortogonales con cuadrícula, o perfiles por altura de sus triángulos) y se escriben en el campo `split` del manifiesto:

   ```json
   "split": {
     "turret": { "above": -0.028, "box": { "x": [-0.215, 0.215], "z": [-0.4, 0.168] }, "pivot": [0, -0.1] },
     "gun": {
       "tubes": [{ "root": [0, 0.026, 0.138], "direction": [0.655, -0.033, 1], "radius": 0.036, "from": -0.005 }],
       "boxes": [{ "x": [-0.06, 0.06], "y": [-0.02, 0.07], "z": [0.05, 0.17] }],
       "trunnion": [0, 0.026, 0.09]
     },
     "cap": { "x": [-0.2, 0.2], "z": [-0.39, 0.16], "y": -0.03 }
   }
   ```

   | Campo | Qué es |
   |---|---|
   | `turret.above`, `turret.box` o `turret.radius` | La torreta es lo que queda sobre la altura del aro y dentro de su planta (una caja en x y z, o un círculo alrededor del pivote) |
   | `turret.pivot` | Centro del aro (x, z): ahí gira la torreta |
   | `gun.tubes` | Un tubo por cañón: raíz, dirección y radio. Cada uno da una boca en su punta. Si la IA dejó el tubo girado respecto de su torreta, el corte lo endereza (`"straighten": false` lo evita) |
   | `gun.boxes` | Piezas que elevan con el cañón: mantelete, visor |
   | `gun.trunnion` | Eje de los muñones: ahí pivota el cañón |
   | `gun.rotor` | Opcional. Cilindro (`root`, `direction`, `radius`) que queda como pieza `rotor`, hija del cañón. Gira sobre el centro de las bocas, como los cañones de una gatling |
   | `turret.scale` | Opcional. Achica torreta y cañón juntos desde el pivote, si la IA dejó el arma muy grande para su base |
   | `turret.wide` | Opcional. Sobre `above`, la planta pasa a tener este `radius`: un cuello angosto que no toma lo que rodea a la base, con una torreta ancha encima |
   | `cap` | Tapa plana sobre el hueco que la torreta deja en el techo al girar (material `tapa`, que `style.materials` pinta) |

   Cada triángulo va al grupo donde cae su centro (`tools/asset-pipeline/split.mjs`), así que el borde del corte queda algo dentado; a la distancia del juego no se ve.
3. `npm run assets:normalize -- <id>` y se sigue como con cualquier modelo.

Un modelo de terceros que no trae la torreta y el cañón como piezas separadas tampoco sirve con este corte si su licencia no permite modificarlo.
