# La RK-40 modelada por código (ADR 003): piezas exactas, biseles reales y pivotes definidos desde
# el principio. Cada nivel cambia solo las filas y columnas de cohetes. Se corre con npm run assets:code.
# Coordenadas del juego: x derecha, y arriba, z adelante.
import math
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base_torre import PIVOTE_TORRE, construir_base
from pieza import Pieza, anillo, blender, bpy, exportar, limpiar, material_paleta, vacio, SALIDA

NIVELES = {1: (2, 2), 2: (3, 2), 3: (3, 3), 4: (4, 3), 5: (4, 4)}


def construir_arriba(columnas, filas):
    paso = 0.08
    ancho = columnas * paso + 0.06
    alto = filas * paso + 0.05
    media_x = ancho / 2
    media_y = alto / 2
    z_frente = 0.095
    z_atras = -0.14
    brazo = 0.04
    afuera = media_x + 0.024 + brazo
    adentro = media_x + 0.024
    pivote_y = 0.07 + media_y + 0.03
    arriba = pivote_y + 0.045

    torreta = Pieza()
    torreta.loft([anillo(0.1, 0), anillo(0.1, 0.018), anillo(0.075, 0.03), anillo(0.075, 0.045)], 'metalOscuro', 0.004)
    # El yugo en U, de una sola pieza.
    perfil = [
        (-afuera, arriba - 0.012), (-afuera, 0.085), (-afuera + 0.04, 0.035), (afuera - 0.04, 0.035), (afuera, 0.085), (afuera, arriba - 0.012), (afuera - 0.012, arriba),
        (adentro + 0.012, arriba), (adentro, arriba - 0.012), (adentro, 0.098), (adentro - 0.026, 0.07), (-adentro + 0.026, 0.07), (-adentro, 0.098), (-adentro, arriba - 0.012), (-adentro - 0.012, arriba), (-afuera + 0.012, arriba),
    ]
    torreta.extruir_z(perfil, -0.045, 0.045, 'metalOscuro', 0.006, angulo=20)
    for lado in (-1, 1):
        torreta.cilindro_x(lado * afuera, lado * (afuera + 0.012), pivote_y, 0, 0.034, 'metal', bisel=0.003)
        torreta.cilindro_x(lado * (afuera + 0.012), lado * (afuera + 0.02), pivote_y, 0, 0.017, 'metalOscuro', lados=6, bisel=0.002)

    bloque = Pieza()
    # Cuerpo: perfil lateral con la espalda achaflanada, como en el concepto.
    lateral = [(z_frente, media_y), (z_frente, -media_y), (z_atras + 0.065, -media_y), (z_atras, -media_y + 0.05), (z_atras, media_y - 0.03), (z_atras + 0.03, media_y)]
    bloque.extruir_x(lateral, -media_x, media_x, 'arena', 0.007, angulo=15)
    # La espalda, que es lo que se ve cuando la torre apunta lejos de la cámara.
    bloque.caja((0, media_y * 0.14, z_atras - 0.002), ancho - 0.07, alto * 0.42, 0.012, 'metalOscuro', 0.003)
    for sx in (-1, 1):
        bloque.caja((sx * (media_x - 0.05), media_y * 0.14, z_atras - 0.012), 0.022, alto * 0.3, 0.012, 'metal', 0.003)
    # Fondo oscuro del frente y marco de arena con divisiones entre filas.
    bloque.caja((0, 0, z_frente + 0.001), ancho - 0.03, alto - 0.03, 0.004, 'neumatico')
    prof = 0.014
    for s in (-1, 1):
        bloque.caja((0, s * (media_y - 0.012), z_frente + prof / 2 - 0.001), ancho - 0.004, 0.024, prof, 'arena', 0.003)
        bloque.caja((s * (media_x - 0.012), 0, z_frente + prof / 2 - 0.001), 0.024, alto - 0.004, prof, 'arena', 0.003)
    for f in range(1, filas):
        bloque.caja((0, media_y - 0.025 - f * paso, z_frente + prof / 2 - 0.003), ancho - 0.02, 0.012, prof - 0.003, 'arena', 0.002)
    # Esquinas con pernos, asas y ventilación.
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (media_x - 0.012), sy * (media_y - 0.012)
            bloque.caja((x, y, z_frente + 0.012), 0.03, 0.03, 0.012, 'metalOscuro', 0.003)
            bloque.cilindro_z(x, y, z_frente + 0.017, z_frente + 0.024, 0.009, 'metal', lados=6, bisel=0.0015)
        bloque.extruir_x([(z_frente - 0.012, media_y - 0.002), (z_frente - 0.012, media_y + 0.02), (z_frente - 0.03, media_y + 0.03), (z_frente - 0.078, media_y + 0.03), (z_frente - 0.1, media_y - 0.002)], sx * (media_x - 0.075), sx * (media_x - 0.03), 'metalOscuro', 0.003)
        for v in range(4):
            bloque.caja((sx * (media_x + 0.0005), media_y - 0.022, z_atras + 0.07 + v * 0.018), 0.004, 0.012, 0.01, 'neumatico')
        # El eje entre el bloque y el brazo.
        bloque.cilindro_x(sx * media_x, sx * (adentro + 0.004), 0, 0, 0.019, 'metalOscuro', bisel=0.002)
        bloque.cilindro_x(sx * media_x, sx * (media_x + 0.008), 0, 0, 0.03, 'metal', bisel=0.002)

    # Tubos: un collar con su fondo negro, que queda a la vista cuando el cohete ya salió.
    radio = 0.03
    posiciones = []
    for f in range(filas):
        for c in range(columnas):
            x = (c - (columnas - 1) / 2) * paso
            y = media_y - 0.025 - (f + 0.5) * paso
            posiciones.append((x, y))
            bloque.loft([[(x + r * math.cos(a), y + r * math.sin(a), z) for a in [i / 8 * math.tau + math.pi / 8 for i in range(8)]] for r, z in ((radio + 0.006, z_frente), (radio + 0.006, z_frente + 0.012), (radio + 0.0015, z_frente + 0.012))], 'metalOscuro', tapas=False)
            bloque.cilindro_z(x, y, z_frente, z_frente + 0.004, radio + 0.002, 'neumatico', giro=math.pi / 8)

    # El cohete: cuerpo, banda blanca y ojiva roja, una sola malla compartida.
    cohete = Pieza()
    largo = 0.1
    seccion = lambda r, z: [(r * math.cos(a), r * math.sin(a), z) for a in [i / 8 * math.tau + math.pi / 8 for i in range(8)]]
    cohete.loft([seccion(radio, -largo), seccion(radio, -largo * 0.62)], 'metalOscuro', tapas=False)
    cohete.loft([seccion(radio, -largo * 0.62), seccion(radio, -largo * 0.46)], 'luzBlanca', tapas=False)
    cohete.loft([seccion(radio, -largo * 0.46), seccion(radio * 0.8, -largo * 0.46)], 'luzBlanca', tapas=False)
    cohete.loft([seccion(radio * 0.8, -largo * 0.46), seccion(radio * 0.46, -largo * 0.17), seccion(0.0015, 0)], 'ojiva', tapas=False)
    punta_z = z_frente + largo - 0.012
    return torreta, bloque, cohete, posiciones, pivote_y, punta_z


os.makedirs(SALIDA, exist_ok=True)
for nivel, (columnas, filas) in NIVELES.items():
    limpiar()
    material = material_paleta()
    raiz = vacio('unit_root')
    casco = vacio('hull', raiz)
    base = construir_base()
    base.ajustar_planta(0.5)
    base.objeto('casco', material).parent = casco
    torreta_p, bloque_p, cohete_p, posiciones, pivote_y, punta_z = construir_arriba(columnas, filas)
    torreta = torreta_p.objeto('turret_yaw', material)
    torreta.parent = raiz
    torreta.location = blender((0, PIVOTE_TORRE, 0))
    bloque = bloque_p.objeto('gun_pitch', material)
    bloque.parent = torreta
    bloque.location = blender((0, pivote_y, 0))
    malla_cohete = cohete_p.objeto('cohete_tmp', material).data
    malla_cohete.name = 'cohete'
    bpy.data.objects.remove(bpy.data.objects['cohete_tmp'])
    for indice, (x, y) in enumerate(posiciones, start=1):
        vacio(f'muzzle_{indice:02d}', bloque, (x, y, punta_z))
        cohete = bpy.data.objects.new(f'rocket_{indice:02d}', malla_cohete)
        bpy.context.collection.objects.link(cohete)
        cohete.parent = bloque
        cohete.location = blender((x, y, punta_z))
    exportar(f'rk40-brasa-n{nivel}')
