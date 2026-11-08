# Matriz de Armaduras y Municiones

## Objetivo

Definir una base simple pero extensible para diferenciar vehiculos por blindaje y hacer que la eleccion de torres/armas importe realmente.

## Clases de armadura

- `light`
  - Vehiculos ligeros con ruedas.
  - Ejemplos: motos, humvee, pickups artilladas, camiones de misiles.
  - Rasgos: alta movilidad, HP bajos o medios, poca proteccion.

- `medium`
  - Vehiculos blindados con ruedas de mayor tamaño o 8x8.
  - Ejemplos: APC, IFV, transporte de personal blindado.
  - Rasgos: equilibrio entre velocidad, HP y resistencia.

- `heavy`
  - Vehiculos blindados de orugas.
  - Ejemplos: carros pesados, asalto blindado, plataformas pesadas.
  - Rasgos: muy lentos, mucho HP, obligan a usar anti-blindaje.

## Tipos de municion

- `light-ballistic`
  - Ametralladoras, minigun, armas ligeras de saturacion.

- `area-incendiary`
  - Lanzallamas, splash, napalm, dano de area ligero.

- `heavy-ballistic`
  - Autocannon, canones pesados, dano cinetico fuerte.

- `piercing`
  - AP, sabot, rail, proyectiles perforantes.

- `shaped-charge`
  - HEAT, cohetes AT, misiles de carga hueca.

## Multiplicadores base

| Municion | Light | Medium | Heavy |
|---|---:|---:|---:|
| `light-ballistic` | 100% | 75% | 50% |
| `area-incendiary` | 100% | 75% | 0% |
| `heavy-ballistic` | 100% | 100% | 100% |
| `piercing` | 100% | 125% | 150% |
| `shaped-charge` | 100% | 125% | 150% |

## Lectura de gameplay

- `light` debe morir con casi cualquier cosa, pero compensa con numero y velocidad.
- `medium` empieza a castigar el spam de armas ligeras.
- `heavy` invalida soluciones de saturacion y fuerza a invertir en anti-blindaje real.

## Reglas de implementacion recomendadas

- Mantener solo 3 clases de armadura en la primera iteracion.
- Mantener solo 5 tipos de municion en la primera iteracion.
- Evitar subtipos hasta que exista una segunda torre y al menos 3 enemigos funcionales.
- Reusar chasis por clase y variar solamente el arma/modulo superior.
