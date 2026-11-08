# Iron Bastion: orientación para agentes

Este archivo es la **fuente única de verdad** del proyecto. Léelo antes de cambiar código, contenido o arquitectura. Los demás documentos se abren solo cuando hacen falta (mapa al final).

## Qué es

Un tower defense isométrico 2.5D para el navegador, hecho con Three.js y Vite, en JavaScript sin framework. Es una **pieza de portafolio** de Ricardo Melo y no tiene fin comercial. Quien lo evalúe abrirá el enlace, jugará unos minutos y mirará el repositorio, así que las dos cosas cuentan como evidencia: que el juego funcione y se vea bien, y que el código muestre criterio.

## Dirección (2026-11-02)

- **Etapa actual: el MVP** (`specs/001-mvp/`). No se construye nada fuera de su alcance hasta cerrarlo.
- **El problema que frenó el proyecto son las torretas.** Cada modelo de Sketchfab traía sus propios ejes, pivotes y nombres, y el juego los calibraba a mano con unos 12 números por vehículo. Por eso el cañón dibujado y la bala no coincidían: el Humvee A331 dispara con el cañón desviado 95° (medición en `specs/001-mvp/spec.md`).
- **Decisión (ADR 001): un estándar propio de modelos.** Los modelos entran al juego solo a través de un normalizador que los deja con una misma estructura y la valida. El código del juego no calibra modelos uno por uno.
- **Puerta de la etapa 1.** Si el normalizador no deja al M163 y al A331 apuntando bien sin ajustes a mano, Ricardo evalúa abandonar el proyecto con esa evidencia.
- **Estamos en desarrollo, no en producción.** Lo que rompe el juego bloquea (tests, fronteras, build); lo que es calidad de publicación solo avisa hasta que Ricardo diga que pasamos a producción.

## Arquitectura

Detalle y razones en `docs/architecture.md` (ADR 002). En resumen:

| Capa | Carpeta | Qué contiene | Puede importar |
|---|---|---|---|
| núcleo | `src/core/` | Reglas puras: estado, simulación, combate, economía, oleadas. Corre en Node. | content |
| contenido | `src/content/` | Datos de juego: torres, enemigos, oleadas, mapa, balance y metadatos de rigs. Sin rutas de archivos. | content |
| render | `src/render/` | Three.js: escena, modelos, efectos. Lee el estado, nunca lo cambia. | core, content |
| interfaz | `src/ui/` | DOM: HUD, panel, layout, estilos. | core, content |
| audio | `src/audio/` | Reproductor de sonido y niveles. | — |
| app | `src/app/` | Arma todo: bucle, input, comandos al núcleo. | todas |
| herramientas | `tools/` | Laboratorios y el pipeline de modelos. No entran al juego. | todas |

`npm run check:boundaries` hace cumplir esta tabla y dos reglas más: el núcleo no usa el navegador y nadie calibra modelos. La deuda que ya existía está en `scripts/checks/known-violations.json`, cada entrada con la tarea que la elimina.

## Arnés

| Comando | Qué hace | Cuándo |
|---|---|---|
| `npm run check` | Tests, fronteras, estándar de modelos y build | Antes de cada commit |
| `npm run check:rigs` | Valida cada modelo de `public/models/` y la MG-7 (generada por código) contra `docs/asset-standard.md` | Incluido en `check` |
| `npm run walkthrough` | Abre el juego en Chrome sin sonido y, a 1440×900 y 1366×768: fotografía el inicio, entra con «Jugar», juega hasta la oleada 3 mejorando torres y fuerza una victoria y una derrota. Deja las capturas en `walkthrough/` y falla si hay errores en la consola | Antes de cerrar una tarea que cambie algo visible |
| `npm run check:mobile` | Abre el juego como en un teléfono (táctil, densidad 2,6, horizontal y vertical): toca una celda para poner una torre, juega la oleada 1 y fotografía todo en `walkthrough/movil-*.png`. Falla si el toque no construye o hay errores en la consola | Al tocar la entrada, el layout o el render |
| `npm run check:aim` | Juega una oleada con todos los tipos armados en Chrome y mide, en cada disparo, la distancia entre la bala y la boca dibujada y el ángulo entre el cañón y su objetivo (CA-2). Tarda unos 45 s | Al tocar puntería, rigs o el render de unidades |
| `npm run check:dist` | Revisa `dist/` (25 MB o menos, solo el juego) y abre el build de producción en Chrome: sin errores, sin «Modo Desarrollo» ni `__game`, con los modelos cargados. Deja `walkthrough/produccion-1366x768.png` | Después de `npm run build`, antes de publicar |
| `npm run record:gameplay` | Graba el GIF del README (`docs/media/partida.gif`) con Chrome y ffmpeg | Cuando cambie algo visible de la partida |
| `node scripts/export-public.mjs <carpeta> --url=<enlace>` | Copia limpia para publicar (D-3): sin los modelos que no se publican, con el workflow de GitHub Pages. No publica nada | Solo con la confirmación de Ricardo (T15) |
| `npm run registro` | Informe por oleada de la última partida jugada en local (`logs/`, spec 002): destruidos y que pasaron por tipo, daño por munición y blindaje, puntería, economía y acciones | Para medir el balance con partidas reales |
| `npm run simulate` | Juega las 10 oleadas sin pantalla con estrategias fijas y muestra vidas, créditos y aciertos | Al tocar combate, economía u oleadas |
| `npm run assets:import -- <glb> <id>` | Copia a `assets/source/` un modelo generado con TRELLIS, con su textura en PNG | Antes de escribir el manifiesto de un modelo generado con IA |
| `npm run assets:normalize` | Convierte los modelos de `assets/source/` al estándar según su manifiesto (los de IA, partidos por volúmenes) | Al agregar o cambiar un modelo |
| `npm run assets:inspect -- archivo.glb` | Muestra la jerarquía y las medidas de un modelo | Al escribir un manifiesto |
| `npm run dev` | El juego en `http://localhost:5173` | — |

Laboratorios (solo en `npm run dev`): `/tools/labs/rig-viewer.html` (modelos normalizados, con la dirección de cada cañón), `/tools/labs/vehicle-lab.html` y `/tools/labs/preview.html`.

**Gancho para agentes.** En `npm run dev` existe `window.__game` con `state`, `core` (`placeTower`, `startWave`, `upgradeTower`, `upgradeTowerDefense`, `sellTower`, `clearCover`, `resetWave`, `resetAll`), `renderers`, `camera`, `setMuted(true)`, `setSpeed(n)`, `setPaused(bool)` y `closeStartScreen()` (la pantalla de inicio pausa la simulación). Permite manejar y medir el juego sin depender del mouse ni de una persona. No existe en el build de producción.

## Definición de terminado

1. `npm run check` pasa.
2. Si la tarea cambia algo visible, se corrió `npm run walkthrough`, **se miraron las capturas** y se informa lo que se vio. Que el script pase no prueba que el juego se vea bien.
3. Si toca combate, economía u oleadas, se corrió `npm run simulate` y se informa qué cambió.
4. Si mueve una frontera, `docs/architecture.md` se actualiza en el mismo cambio. Si resuelve deuda, su entrada sale de `known-violations.json`.
5. La tarea queda marcada en `specs/001-mvp/tasks.md` con su commit.

## Convenciones

- **Idioma:** documentos y textos del juego en español, con tildes y eñes; identificadores en inglés, como el código existente.
- **Commits:** `tipo(alcance): descripción` en español (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`), y la tarea (`T06`) en el cuerpo.
- **Subir los cambios (pedido del dueño, 2026-11-05):** el agente hace commit y push sin esperar a que se lo pidan, cada vez que termina un bloque de trabajo con `npm run check` en verde, y al cerrar la sesión si queda algo verificado sin subir. Solo a la rama de trabajo, sin forzar. Con `check` en rojo no se sube: se arregla primero, o se avisa. Nunca fusionar a `main` ni publicar el juego (T15) sin confirmación.
- **Ramas:** una por tarea o grupo de tareas. `main` recibe solo trabajo verificado.
- **Modelos 3D:** entran solo por el normalizador (`docs/asset-standard.md`). Nunca se edita a mano un archivo de `public/models/` ni se agrega un ajuste por modelo en el código.
- **Licencias:** ningún asset de terceros entra sin autor, URL y licencia en `docs/assets/ASSET_CREDITS.md`.
- **Repositorio público a futuro:** sin datos personales ni nombres de clientes en archivos ni en mensajes de commit.

## Mapa de documentos

- `docs/architecture.md`: capas, flujo, reglas en vigor y deuda.
- `docs/asset-standard.md`: el contrato que cumple todo modelo del juego.
- `docs/decisions/`: decisiones de arquitectura (ADR).
- `specs/001-mvp/`: alcance, criterios de aceptación (`spec.md`) y tareas (`tasks.md`).
- `docs/design/`: documento de diseño original (GDD), matriz de blindaje y sistema de oleadas. Son referencia: el MVP manda sobre ellos.
- `docs/assets/ASSET_CREDITS.md`: créditos y licencias.
- `docs/history/`: documentos de marzo de 2026 que describen el sistema anterior. No se siguen.
