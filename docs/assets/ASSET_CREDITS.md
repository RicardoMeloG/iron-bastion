# Créditos y licencias

Registro del origen y la licencia de cada archivo del juego que no es código. Ningún asset entra al juego sin su entrada aquí (`AGENTS.md`). Revisado el 2026-11-08.

Todos los modelos que el juego usa son diseños propios: por código en Blender o generados con TRELLIS.2 desde conceptos propios. Los modelos de terceros de Sketchfab se retiraron (ver «Retirados»); solo queda el M163, como prueba técnica que no se publica.

## Modelo 3D de terceros

| Archivo | Obra | Autor | Licencia | Estado |
|---|---|---|---|---|
| `assets/source/m163a2-vads.glb` | [M163A2 VADS](https://sketchfab.com/3d-models/m163a2-vads-b519c7ac1af34d5a970b96d59ca0ab1a) | 42manako | Declarada CC BY-NC, pero no válida (ver abajo) | **Solo prueba técnica, no se publica**: su modelo normalizado vive en `assets/test-models/`, fuera del build, y ningún tipo de enemigo lo usa |

**Por qué el M163 no se publica.** Su página dice que el autor extrajo el modelo del videojuego comercial *Combat Mission: Cold War*. Quien lo subió no tiene derechos para licenciarlo, así que la etiqueta CC BY-NC no lo vuelve utilizable. Se conserva solo como caso de prueba del normalizador, porque trae ejes internos Z-up, el caso más difícil. Hay que reemplazarlo antes de publicar (decisión D-5 de la spec 001).

## Modelos 3D por código (ADR 003)

Guiones de Blender en `tools/asset-pipeline/blender/`, que `npm run assets:code` corre y valida. Son del proyecto, bajo su licencia MIT.

| Modelos | Guion |
|---|---|
| Torres MG-7, LM-2 y AA-3, niveles 1 a 5, y su base común | `torres.py`, `base_torre.py` |
| RK-40, niveles 1 a 5 | `rk40.py` |
| Patrulla y sus tres variantes armadas | `patrulla.py` |
| Moto y sus niveles | `moto.py` |
| Tanque pesado | `tanque.py` |
| 8x8, camión de tropas y sus restos | `vehiculos.py` |
| Soldados con ametralladora y con RPG | `soldado.py` |

La fortificación del blindaje (`blindaje-n1`, `blindaje-n2`) también es por código (`tools/asset-pipeline/make-blindaje.mjs`). Los modelos de `assets/models/turrets/mg7_modular/` son una MG-7 anterior, generada con `scripts/blender_build_mg7.py`; solo los usa el laboratorio de modelos.

## Modelos 3D generados con IA (spec 002)

Diseños propios, ficticios, en dos pasos: una imagen de concepto (en `assets/concepts/`), generada con la CLI de Codex o con ChatGPT web (generación de imágenes de OpenAI; la imagen es del usuario según sus condiciones de uso), y el modelo 3D generado desde esa imagen con [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) de Microsoft (licencia MIT), en su demo de Hugging Face o instalado en local. Entran con `npm run assets:import` y el normalizador los parte por volúmenes y les aplica la paleta (`docs/asset-standard.md`). Hoy son los drones y los restos destruidos, donde la imperfección no molesta.

| Archivo | Qué es | Generado |
|---|---|---|
| `assets/source/dron-fpv.glb` y `dron-ala.glb` | Dron FPV y dron de ala delta | 2026-11-06 |
| `assets/source/moto-recon-destruida.glb` | Restos de la moto | 2026-11-05 |
| `assets/source/mg7-destruida.glb` | Restos de la MG-7 | 2026-11-04 |
| `assets/source/lm2-lanza-destruida.glb` | Restos de la LM-2 | 2026-11-04 |
| `assets/source/rk40-brasa-destruida.glb` | Restos de la RK-40 | 2026-11-06 |
| `assets/source/aa3-halcon-destruida.glb` | Restos de la AA-3 | 2026-11-06 |

Las imágenes de los botones de compra (`public/towers/`) son conceptos del nivel 5 de cada torre, sin fondo. Las de los vehículos (`public/vehicles/`) salen de los modelos del juego (`scripts/render-vehicle-icons.mjs`).

## Audio

Las grabaciones son de [Freesound](https://freesound.org/), todas con licencia [CC0](https://creativecommons.org/publicdomain/zero/1.0/) (dominio público: se pueden usar, modificar y redistribuir sin atribución; se mencionan igual). `tools/audio/buscar-sonidos.mjs` las encuentra, la elección está en `tools/audio/seleccion.json` y `tools/audio/procesar.py` las recorta, iguala su volumen y arma los bucles.

| Archivo | Grabación original | Uso |
|---|---|---|
| `assets/audio/sfx/mg7-gatling.mp3` | [minigun.wav](https://freesound.org/people/pgi/sounds/98331/) de pgi | MG-7 nivel 5: ráfaga de gatling |
| `assets/audio/sfx/enemigo-fusil.mp3` | [AK47 Shot](https://freesound.org/people/LeMudCrab/sounds/163457/) de LeMudCrab | Soldados y patrulla: disparo de fusil o ametralladora ligera |
| `assets/audio/sfx/canon-automatico.mp3` | [Autocannon Shot 2](https://freesound.org/people/qubodup/sounds/854184/) de qubodup | 8x8 y AA-3: cañón automático |
| `assets/audio/sfx/tanque-canon.mp3` | [Excalibur Howitzer Shot](https://freesound.org/people/qubodup/sounds/175430/) de qubodup | Tanque: cañonazo |
| `assets/audio/sfx/misil-lanzamiento.mp3` | [Rocket Launch](https://freesound.org/people/Jarusca/sounds/521377/) de Jarusca | LM-2: lanzamiento de misil |
| `assets/audio/sfx/cohete-salva.mp3` | [GUNArtl_69thFieldArtilleryGun01_InMotionAudio_FREESampleSunday.wav](https://freesound.org/people/InMotionAudio/sounds/702245/) de InMotionAudio | RK-40: salva de cohetes |
| `assets/audio/sfx/rpg-disparo.mp3` | [GUNArtl_69thFieldArtilleryGun01_InMotionAudio_FREESampleSunday.wav](https://freesound.org/people/InMotionAudio/sounds/702245/) de InMotionAudio | Soldado y patrulla: disparo de RPG |
| `assets/audio/sfx/interceptor.mp3` | [Rocket Launch](https://freesound.org/people/Jarusca/sounds/521377/) de Jarusca | Defensa activa del tanque: interceptor |
| `assets/audio/sfx/explosion-grande.mp3` | [Explosion004.wav](https://freesound.org/people/klangfabrik/sounds/220062/) de klangfabrik | Vehículo pesado destruido: explosión grande |
| `assets/audio/sfx/explosion-media.mp3` | [Musket Explosion](https://freesound.org/people/Willlewis/sounds/244345/) de Willlewis | Misil o proyectil que estalla |
| `assets/audio/sfx/explosion-lejana.mp3` | [Distant Explosion](https://freesound.org/people/Mr_KeybOred/sounds/372086/) de Mr_KeybOred | Explosiones lejanas (ambiente) |
| `assets/audio/sfx/impacto-blindaje.mp3` | [22 caliber with ricochet.wav](https://freesound.org/people/C-V/sounds/523403/) de C-V | Bala que pega en blindaje |
| `assets/audio/sfx/soldado-cae.mp3` | [Body fall_04.wav](https://freesound.org/people/deleted_user_2104797/sounds/346692/) de deleted_user_2104797 | Soldado que cae |
| `assets/audio/sfx/fuego.mp3` | [Ambiance_Campfire_Loop_Stereo.wav](https://freesound.org/people/Nox_Sound/sounds/558967/) de Nox_Sound | Fuego incendiario de la RK-40 |
| `assets/audio/sfx/moto-motor.mp3` | [Motorbike Idling.wav](https://freesound.org/people/lmbubec/sounds/119455/) de lmbubec | Moto: motor |
| `assets/audio/sfx/patrulla-motor.mp3` | [Motor Loop.wav](https://freesound.org/people/soundjoao/sounds/325808/) de soundjoao | Patrulla y camión: motor diésel |
| `assets/audio/sfx/blindado-motor.mp3` | [AMX-13 Engine.wav](https://freesound.org/people/AdamHarvester/sounds/702456/) de AdamHarvester | 8x8 y tanque: motor pesado |
| `assets/audio/sfx/orugas.mp3` | [t26_moving_01.wav](https://freesound.org/people/greatmganga/sounds/329800/) de greatmganga | Tanque: orugas |
| `assets/audio/sfx/dron-fpv.mp3` | [Dji Mavic Mini 2 take-off UP-DOWN XY mic placement Zoom H5.wav](https://freesound.org/people/Sadiquecat/sounds/683300/) de Sadiquecat | Dron FPV: zumbido de hélices |
| `assets/audio/sfx/mg7-disparo.mp3` | [heavy.burst.wav](https://freesound.org/people/alienbomb/sounds/39071/) de alienbomb | MG-7: disparo de ametralladora pesada (la primera bala de la ráfaga, con un eco corto) |
| `assets/audio/sfx/dron-ala.mp3` | [Lawn tractor loop](https://freesound.org/people/ursenfuns/sounds/440591/) de ursenfuns | Dron de ala delta: motor de dos tiempos que zumba (como un cortacésped o una motoneta volando) |

Sintetizados por el proyecto: el pitido de la cuenta regresiva (`src/audio/beep-synth.js`) y el ambiente del campo (`src/audio/ambience-synth.js`): viento, retumbo, disparos lejanos y pájaros.

## Retirados

Borrados del repositorio el 2026-11-02 (tarea T01). Siguen en el historial de git, lo que pesa en la decisión D-3 (cómo hacer público el repositorio).

- **[Ukrainian modified Humvee](https://sketchfab.com/3d-models/ukrainian-modified-humvee-e804fc759a744e4f9b96348713d5933a)** (`humvee_e804_armed.glb`) y sus derivados `humvee_gunner*.glb`. Los subió el mismo usuario que extrajo el M163, con la nota «Model by BUTTHE4D». Sus texturas (`brdm2_01_co`, `kord`, `nsvt`) y mallas (`.smd`) siguen la nomenclatura de los juegos Arma. No es seguro usarlos.
- **`m163a2_vads_fixed.glb`, `_rxn90.glb` y `_rxp90.glb`:** pruebas de rotación del M163.
- **`car-engine.mp3` y `small-engine-running.mp3`:** audios sin uso y sin origen registrado.
- **`gun-shots-gun-firing.mp3`** (disparo enemigo), retirado el 2026-11-03: Ricardo escuchó una voz de fondo, como marca de agua. Estaba registrado como de Mixkit, pero Mixkit no marca sus sonidos y el archivo había sido recodificado con un ffmpeg antiguo (`Lavf56`): lo más probable es que viniera de la vista previa de otro sitio. Los vehículos usan ahora el disparo de la MG-7, más grave.

## Referencias que no se usaron

- [Army Jeep Hummer Humvee HMMWV](https://sketchfab.com/3d-models/army-jeep-hummer-humvee-hmmwv-484845939c50419cb3a581cc3546fadd): la descarga falló (403).
- [Animated Game-Ready Turret](https://sketchfab.com/3d-models/animated-game-ready-turret-bbe8b20f9a624cdebd48e47a1cc0c585) y [Turret Defense Model](https://sketchfab.com/3d-models/turret-defense-model-game-ready-3d-asset-f0aa10fe8e014db0bdb8824ed7942062): referencias de forma para la MG-7.
- [Poly Haven](https://polyhaven.com/): candidato para materiales CC0.
