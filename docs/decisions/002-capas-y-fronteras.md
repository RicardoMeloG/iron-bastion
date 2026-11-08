# ADR 002: Capas con fronteras que se verifican solas

- **Estado:** aceptada (2026-11-02)
- **Decide:** Ricardo Melo
- **Detalle vigente:** `docs/architecture.md`

## Contexto

El código de marzo ya separaba el núcleo del render (`src/game/core`, `src/game/runtime`), pero tenía cuatro problemas:

- La separación no estaba escrita en ningún lado ni se comprobaba, así que se podía romper sin que nadie lo notara.
- El contenido mezclaba datos de juego con cosas visuales: el catálogo de enemigos guardaba, junto a la vida y la velocidad, la ruta del modelo y sus ajustes de calibración.
- `src/config/` juntaba balance, render, interfaz y audio en una sola carpeta.
- En la raíz convivían el juego, tres laboratorios, 19 capturas de depuración y el documento de diseño en Word. El build empaquetaba todo eso.

El proyecto es de portafolio: el repositorio es evidencia tanto como el juego, y lo van a trabajar agentes que necesitan reglas que puedan verificar sin una persona.

## Decisión

1. **Siete carpetas con un propósito cada una:** `src/core`, `src/content`, `src/render`, `src/ui`, `src/audio`, `src/app` y `tools`. La tabla de qué puede importar cada una está en `docs/architecture.md`.
2. **Las fronteras se comprueban** con `npm run check:boundaries`, que forma parte de `npm run check`.
3. **La deuda existente se declara, no se esconde:** cada violación conocida va en `scripts/checks/known-violations.json` con la tarea que la elimina. El chequeo falla con una violación nueva y también cuando una conocida se resolvió y sigue en la lista.
4. **Lo que no es juego sale de la raíz:** los laboratorios van a `tools/labs/`, los documentos a `docs/` y las capturas de depuración no se versionan.

Se eligió un script propio de unas 150 líneas en vez de una herramienta como dependency-cruiser o ESLint: las reglas son pocas, propias del proyecto (calibración por modelo, contenido sin assets) y así no suma dependencias.

## Consecuencias

- Mover un archivo de capa o agregar una carpeta en `src/` exige actualizar `docs/architecture.md` y el script en el mismo cambio.
- El núcleo sigue corriendo en Node, lo que mantiene vivos los tests y la simulación de balance.
- Las deudas quedan a la vista hasta que sus tareas las eliminen: eran 7 al empezar; T06 sacó 5 y T09 las 2 últimas. Desde T09 la lista está vacía y cualquier violación nueva hace fallar el chequeo.
