# ADR 001: Un estándar propio de modelos, sin calibración por modelo

- **Estado:** aceptada (2026-11-02)
- **Decide:** Ricardo Melo
- **Contrato resultante:** `docs/asset-standard.md`

## Contexto

Entre el 22 y el 27 de marzo de 2026 el juego pasó de modelos geométricos simples a modelos de Sketchfab. Desde ahí, casi todo el trabajo se fue en las torretas, y el proyecto se detuvo el 27 de marzo:

- Se cambiaron unas 1.700 líneas solo en vehículos y torretas. Quedaron 12 archivos de vehículos, de los que el juego usa 4; el M163 tiene variantes `fixed`, `rxn90` y `rxp90` (pruebas rotándolo ±90°), y hay unas 15 capturas de depuración y dos documentos de arreglos de ejes.
- Cada modelo traía su convención: ejes internos Z-up de Blender (M163), Y-up nativo (A331) o piezas agregadas sobre otro modelo (Humvee armado). El juego lo compensaba con hasta 12 ajustes por vehículo: `assetRotation`, `headingOffset`, `headingOffsetAdjust`, `autoHeadingFromMuzzle`, `turretYawOffset`, `yawPivotMode`, `pitchPivotFromMuzzle`, `pitchAxis`, `pitchSign`, `pitchMin`, `pitchMax` y `skipWeaponNodeValidation`.
- Los ajustes se encontraron a prueba y error. El documento de arreglos dice que el M163 usa eje de elevación `z` y signo `+1`, y el código usa `x`, `-1` y un giro de −90° que no aparece en ningún documento. Tres de los cuatro modelos tienen apagada la validación que habría detectado una torreta mal armada.
- La bala no sale del modelo: el núcleo la calcula aparte, desde números fijos. Si un ajuste queda mal, el cañón mira a un lado y la bala igual llega a la torre.

Medición del 2026-11-02: una oleada con los 8 vehículos armados, midiendo el desvío entre el cañón dibujado y la torre en cada momento en que el núcleo daba el arma por apuntada y lista para disparar.

| Vehículo | Desvío típico | Disparos con más de 20° de desvío |
|---|---|---|
| Humvee A331 | 95° | 100 % |
| Scout Buggy MG | 7° | 25 % |
| M163 | 9° | 1 % |
| Los otros 5 | ~6° | 0 % |

La MG-7, la torre del jugador, es el único modelo que funciona bien. No viene de Sketchfab: su geometría la genera código propio con las piezas que el juego espera (`turret_yaw`, `gun_pitch`, `muzzle_*`).

## Decisión

Todo modelo entra al juego a través de un **normalizador** que lo convierte, una sola vez, a un estándar propio (`docs/asset-standard.md`): mismos ejes, mismo origen, misma escala, una jerarquía con nombres fijos y pivotes en identidad. El normalizador también escribe los metadatos del rig (bocas y pivotes), que leen tanto el núcleo como render.

Un **validador** comprueba cada modelo girando la torreta y elevando el cañón. Si no pasa, el modelo no entra.

**El código del juego no tiene ajustes por modelo.** El chequeo de fronteras prohíbe los nombres de esos ajustes en `src/` y `tools/`.

El normalizador se hace con `gltf-transform` (JavaScript, vía npm), sin depender de Blender ni de saber modelar.

## Consecuencias

- Agregar un vehículo es declarar qué pieza es la torreta y cuál el cañón; los números los calcula el script.
- Las torretas se mueven con un solo código para todos (dos líneas).
- La bala nace en la boca real y sale en la dirección del cañón, porque núcleo y render leen el mismo dato.
- Un modelo cuya torreta y cañón vienen fundidos en una sola malla no sirve, y hay que buscar otro.
- Se borra el código de calibración de `enemy-renderer.js` y `vehicle-lab.js`, y las 8 variantes de modelos sin uso.

## Alternativas descartadas

- **Seguir calibrando por modelo.** Es lo que frenó el proyecto: cada vehículo nuevo es otra ronda de prueba y error, y un ajuste rompe otro.
- **Aprender Blender y rehacer los modelos.** Ricardo no modela, y el proyecto es de portafolio: el costo no se justifica.
- **Vehículos 100 % generados por código, como la MG-7.** Elimina el problema, pero baja la calidad visual y exige diseñar cada vehículo. Queda como plan B si el normalizador falla en la puerta de la etapa 1.

## Puerta

Si el normalizador no deja al M163 y al A331 apuntando bien, sin ajustes a mano y pasando el validador, se revisa esta decisión. La opción por defecto en ese caso es abandonar el proyecto (`specs/001-mvp/spec.md`).
