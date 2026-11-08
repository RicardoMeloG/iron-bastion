# ADR 003: Modelos mecánicos por código en Blender

- **Estado:** aceptada (2026-11-07)
- **Decide:** Ricardo Melo
- **Detalle vigente:** `docs/asset-standard.md`

## Contexto

Los modelos de TRELLIS llegan como una sola malla, con textura. Eso dejaba dos defectos en la RK-40 que no se arreglaban retocando:

- **Dientes de sierra:** cada triángulo lleva un solo color, así que el borde entre dos colores sigue los lados de los triángulos.
- **Piezas soldadas:** un cohete es parte del bloque, así que no puede desaparecer al salir.

Se probó limpiar la malla sobre la base de la LM-2: textura de pocos colores, textura nueva sobre una malla de 4 mil triángulos y un color por cara plana. Ninguna dio un avance real, porque el defecto está en la forma que entrega TRELLIS, no en cómo se pinta. Las capturas se compararon con la misma cámara.

## Decisión

Las piezas mecánicas se modelan con un guion de Blender (`tools/asset-pipeline/blender/`), que `npm run assets:code` corre y pasa por el mismo validador que un modelo normalizado. Ya están así las cuatro torres, con su base común, y la patrulla, un vehículo propio con tres variantes que reemplaza a los tres Humvee de terceros. Codex dibuja el concepto y el guion lo construye.

TRELLIS sigue para lo irregular, donde la imperfección no molesta: restos, rocas y lo que aún no se rehace.

## Consecuencias

- Nivel 2 de la RK-40: de 42.688 triángulos y 1.020 KB a unos 6.500 y 116 KB. Con la base común, `dist/` baja de 34,2 MB a 24,7 MB, bajo el límite de 25.
- Los pivotes y las bocas salen definidos desde el guion, sin medir un corte por modelo.
- Cada pieza móvil o que desaparece es un nodo propio. El render oculta los cohetes por número, sin tocar la simulación.
- Rehacer un modelo exige Blender y escribir su guion: lo que se ahorra en limpieza se paga en diseño. Los GLB generados se versionan, así que el juego y `npm run check` no necesitan Blender.
- El tanque pesado también es por código desde el 2026-11-07: oruga abierta con ruedas que giran según su radio, y puntos `defensa_NN` en la torreta para la defensa activa.
- Los soldados también, desde el 2026-11-07: una figura con dos armas. Las piernas son el chasis y caminan, el tronco gira en la cadera y los brazos con el arma suben en el hombro; la ojiva del RPG es `rocket_01`.
- El 8x8, el camión de tropas y sus restos, también desde el 2026-11-07. Siguen de TRELLIS los drones, los restos de la moto y los de las torres.
