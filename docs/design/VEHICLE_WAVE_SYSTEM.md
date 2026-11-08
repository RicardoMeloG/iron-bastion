# Sistema Modular de Vehiculos y Oleadas

## Objetivo

Reducir el costo de produccion visual y de balance separando cada vehiculo enemigo en tres capas reutilizables:

- movilidad
- chasis
- torreta o modulo de arma

La combinacion de estas capas define un enemigo jugable y permite generar oleadas variadas sin modelar un vehiculo totalmente nuevo para cada caso.

## Capas modulares

### 1. Movilidad

- `wheels-light`
  - 4 ruedas
  - pensado para humvee, pickups, camionetas artilladas

- `wheels-medium`
  - 8 ruedas
  - pensado para APC e IFV

- `tracks-heavy`
  - orugas
  - pensado para tanques o blindados pesados

### 2. Chasis

- `recon`
  - ligero, perfil bajo, rapido

- `utility`
  - ligero, mas alto y utilitario

- `apc`
  - voluminoso, blindado medio

- `assault`
  - pesado, blindado frontal marcado

### 3. Modulo de arma

- `pintle-mg`
  - ametralladora simple

- `autocannon`
  - canion automatico medio

- `missile-rack`
  - lanzamisiles o cohetera ligera

- `heavy-cannon`
  - canion pesado para chasis de orugas

## Progresion de oleadas

La mezcla debe ser aleatoria pero controlada por tier.

### Fase 1: oleadas tempranas

- Solo vehiculos `light`
- Objetivo: introducir lectura visual y velocidad

### Fase 2: oleadas medias

- Mayormente `light`
- Empiezan a entrar `medium`
- Objetivo: obligar al jugador a mezclar dano

### Fase 3: oleadas tardias

- `medium` frecuentes
- `heavy` ocasionales y luego regulares
- Objetivo: exigir anti-blindaje real

## Regla de generacion

- La oleada se genera con semilla fija por indice de oleada.
- Asi cada build es reproducible.
- La composicion es aleatoria solo dentro del pool permitido por fase.

## Estado actual implementado

- Catalogo modular de enemigos basado en movilidad + chasis + torreta.
- Generador de oleadas por tier:
  - primeras oleadas: solo ligeros
  - medias: ligeros + medios
  - finales: medios + pesados
- Render modular simple reutilizando la misma logica de ruedas/orugas y modulo de arma.

## Siguiente paso recomendado

- Anadir combate enemigo contra torres.
- Dar HP y clase de armadura a torres.
- Reusar esta misma base modular para introducir un Humvee artillado como primer enemigo ofensivo real.

## Veteranía

Los vehículos de tierra salen con veteranía de 0 a 3, y los galones sobre la barra de vida lo muestran. Sin galones no tiene veteranía. Los números están en `GAMEPLAY_CONFIG.veterancy`.

- **Ascenso:** quien destruye una torre gana un nivel, hasta el 3, con su arma y su modelo. Conserva la parte de vida que tenía.
- **Sin aumentos genéricos:** cada nivel trae una capacidad que se ve, no más vida ni más daño sin motivo.
- **Tanque:** defensa activa. Intercepta 1, 2 o 3 misiles según su nivel, y cada carga tarda en volver. Lanza un interceptor contra misiles y cohetes de la RK-40, que estallan en el aire, y las balas pasan.
- **8x8:** sin veteranía no lleva a nadie. Después lleva 3, 6 o 9 soldados, menos que un camión.
- **Moto:** nivel 0, sin arma; 1, el pasajero dispara con fusil; 2, con un misil; 3, con dos.
- **Patrulla:** nivel 0, sin arma; 1, ametralladora; 2, un misil; 3, dos misiles. Cada nivel tiene más vida y paga más.
- **Camión:** no dispara. Desde el nivel 2 baja una escuadra más, y en el nivel 3, dos.
- **Unidades de soldados:** son 3, y llevan tantos misileros como su nivel: 0, las 3 ametralladoras; 1, un misilero; 2, dos; 3, todos. Las que salen de la niebla siguen su propia tabla, `squadOdds`, y son las primeras veteranas.
- **Tripulación:** quienes bajan de un vehículo forman unidades con el nivel de su vehículo. A la de la moto le falta un soldado: son 2, y una regeneración futura podría devolverlo.
- **Cobertura:** un nivel por roca, árbol o arbusto, y otro por estar cuerpo a tierra. Sin ninguno, un disparo mata; con alguno, un disparo no mata a quien está entero.
- **Cuerpo a tierra:** desde el nivel 1, el disparo a un soldado tira al suelo a toda su unidad. Quien baja de un vehículo empieza así, aunque sea de nivel 0. Dispara igual y se arrastra más lento. No hay inmunidad al bajar.
- **Misiles:** un soldado los dispara solo de rodilla, tirado o no: se arrodilla, queda quieto y pierde la cobertura del suelo mientras tanto.
- **Granadas:** los soldados las lanzan a los 2 segundos de entrar en combate, a torres cercanas. Sus números están en `infantryCombat`.
- **Camión:** con veteranía va más rápido.
- **La unidad es lo que cuenta:** tiene la veteranía, con un solo emblema, y vale un punto, pase un soldado o pasen todos.
- **Ascenso de una unidad:** si uno de sus soldados destruye una torre, sube toda la unidad, y uno más toma un lanzamisiles: quien la destruyó, si aún no lo tenía.
- **Drones:** no tienen veteranía.

Los números son provisionales hasta calibrar con partidas reales.
