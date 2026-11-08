# La moto (ADR 003), con sus cuatro niveles de veteranía: solo cambia el arma del pasajero. Del nivel 1
# en adelante, el tronco del pasajero es la torreta, para que apunte mientras la moto sigue derecho.
# Se corre con npm run assets:code. Coordenadas del juego: x derecha, y arriba, z adelante.
import math
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pieza import Pieza, blender, bpy, exportar, limpiar, material_paleta, vacio

RADIO_RUEDA = 0.15
EJE_Z = (0.35, -0.35)
CADERA_PASAJERO = (0, 0.44, -0.165)
ALTO_HOMBRO = 0.2  # sobre la cadera


def rueda():
    p = Pieza()
    lados = 18
    r = RADIO_RUEDA
    fila = lambda x, afuera, adentro: [(x, (afuera if i % 2 == 0 else adentro) * math.cos(i / lados * math.tau), (afuera if i % 2 == 0 else adentro) * math.sin(i / lados * math.tau)) for i in range(lados)]
    p.loft([fila(-0.036, r * 0.84, r * 0.84), fila(-0.026, r, r * 0.89), fila(0.026, r, r * 0.89), fila(0.036, r * 0.84, r * 0.84)], 'neumatico')
    for s in (-1, 1):
        p.cilindro_x(s * 0.03, s * 0.04, 0, 0, r * 0.52, 'metalOscuro', lados=10, bisel=0.003)
        p.cilindro_x(s * 0.038, s * 0.046, 0, 0, r * 0.22, 'metal', lados=6, bisel=0.002)
    return p


def pierna(p, cadera, rodilla, pie):
    """Muslo, canilla y bota de un soldado sentado."""
    p.tubo(cadera, rodilla, 0.038, 0.03, 'arena', lados=6, bisel=0.002)
    p.tubo(rodilla, (pie[0], pie[1] + 0.03, pie[2]), 0.03, 0.024, 'arena', lados=6, bisel=0.002)
    p.caja((rodilla[0], rodilla[1], rodilla[2] + 0.018), 0.042, 0.042, 0.014, 'arenaOscura', 0.003)
    p.caja((pie[0], pie[1] + 0.008, pie[2] + 0.018), 0.042, 0.042, 0.082, 'neumatico', 0.006)


def tronco(p, x, y, z, inclinacion=0.0):
    """Tronco con chaleco, cabeza y casco, desde la cadera (x, y, z). `inclinacion`: cuánto se echa adelante."""
    hombro = (x, y + ALTO_HOMBRO, z + inclinacion)
    corte = lambda yy, zz, medio, fondo: [(x - medio, yy, zz - fondo), (x + medio, yy, zz - fondo), (x + medio, yy, zz + fondo), (x - medio, yy, zz + fondo)]
    p.loft([corte(y - 0.01, z, 0.056, 0.036), corte(y + 0.12, z + inclinacion * 0.6, 0.066, 0.038), corte(hombro[1], hombro[2], 0.074, 0.038)], 'arena', 0.006, angulo=12)
    # Chaleco oscuro con tres bolsillos.
    p.loft([corte(y + 0.04, z + inclinacion * 0.2, 0.069, 0.044), corte(y + 0.175, z + inclinacion * 0.88, 0.075, 0.044)], 'metalOscuro', 0.004)
    for i in (-1, 0, 1):
        p.caja((x + i * 0.031, y + 0.082, z + inclinacion * 0.4 + 0.047), 0.027, 0.046, 0.013, 'arenaOscura', 0.002)
    # Cuello, cabeza y casco.
    cabeza_y = hombro[1] + 0.022
    zc = hombro[2] + 0.008
    p.cilindro_y(x, zc, hombro[1] - 0.004, cabeza_y, 0.024, 'arena', lados=6)
    p.loft([corte(cabeza_y - 0.004, zc, 0.034, 0.038), corte(cabeza_y + 0.056, zc, 0.04, 0.043)], 'piel', 0.006)
    p.loft([p.circulo(x, cabeza_y + 0.034, zc, 0.06, 10), p.circulo(x, cabeza_y + 0.058, zc, 0.058, 10), p.circulo(x, cabeza_y + 0.092, zc, 0.034, 10)], 'arena', 0.003)
    p.caja((x, cabeza_y + 0.072, zc + 0.047), 0.03, 0.022, 0.012, 'metalOscuro', 0.002)
    return hombro


def brazo(p, hombro, codo, mano):
    p.tubo(hombro, codo, 0.028, 0.023, 'arena', lados=6, bisel=0.002)
    p.tubo(codo, mano, 0.023, 0.02, 'arena', lados=6, bisel=0.002)
    p.caja(mano, 0.034, 0.034, 0.034, 'metalOscuro', 0.005)


def casco(pasajero_entero):
    """Moto, conductor y piernas del pasajero; el pasajero entero si no lleva arma."""
    p = Pieza()
    # Cuadro y motor.
    p.tubo((0, 0.36, 0.2), (0, 0.22, -0.16), 0.024, 0.024, 'metalOscuro', lados=6)
    p.tubo((0, 0.38, 0.17), (0, 0.38, -0.27), 0.022, 0.022, 'metalOscuro', lados=6)
    p.tubo((0, 0.33, -0.25), (0, RADIO_RUEDA, EJE_Z[1]), 0.02, 0.02, 'metalOscuro', lados=6)
    p.caja((0, 0.235, 0.03), 0.105, 0.14, 0.225, 'metalOscuro', 0.012)
    p.cilindro_x(-0.062, 0.062, 0.215, 0.0, 0.056, 'metal', lados=10, bisel=0.005)
    # Protector de abajo, con sus ranuras.
    p.loft([[(-0.058, 0.13, -0.075), (0.058, 0.13, -0.075), (0.058, 0.13, 0.12), (-0.058, 0.13, 0.12)], [(-0.066, 0.165, -0.09), (0.066, 0.165, -0.09), (0.066, 0.165, 0.16), (-0.066, 0.165, 0.16)]], 'metal', 0.004)
    # Tanque y laterales de arena, angulosos.
    p.loft([[(-0.05, 0.33, -0.01), (0.05, 0.33, -0.01), (0.05, 0.33, 0.2), (-0.05, 0.33, 0.2)], [(-0.075, 0.385, 0.005), (0.075, 0.385, 0.005), (0.07, 0.385, 0.21), (-0.07, 0.385, 0.21)], [(-0.04, 0.43, 0.03), (0.04, 0.43, 0.03), (0.035, 0.43, 0.18), (-0.035, 0.43, 0.18)]], 'arena', 0.006, angulo=10)
    for s in (-1, 1):
        p.placa([(s * 0.058, 0.22, -0.1), (s * 0.058, 0.22, 0.0), (s * 0.058, 0.33, 0.015), (s * 0.058, 0.33, -0.085)][::s], 0.008, 'arena', 0.002)
    # Asiento, parrilla y caja de atrás.
    p.caja((0, 0.402, -0.12), 0.092, 0.03, 0.27, 'neumatico', 0.008)
    p.caja((0, 0.412, -0.335), 0.13, 0.014, 0.14, 'metalOscuro', 0.003)
    for s in (-1, 1):
        p.tubo((s * 0.07, 0.4, -0.24), (s * 0.07, 0.42, -0.42), 0.007, 0.007, 'metalOscuro', lados=5)
        p.tubo((s * 0.07, 0.42, -0.42), (s * 0.07, 0.465, -0.42), 0.007, 0.007, 'metalOscuro', lados=5)
    p.tubo((-0.07, 0.465, -0.42), (0.07, 0.465, -0.42), 0.007, 0.007, 'metalOscuro', lados=5)
    p.caja((0, 0.463, -0.335), 0.12, 0.09, 0.13, 'metalOscuro', 0.01)
    p.caja((0, 0.463, -0.335), 0.126, 0.012, 0.136, 'neumatico')
    # Guardabarros de atrás y escape.
    p.placa([(-0.04, 0.33, -0.3), (0.04, 0.33, -0.3), (0.035, 0.3, -0.18), (-0.035, 0.3, -0.18)], 0.008, 'arena', 0.002)
    p.tubo((0.062, 0.2, 0.05), (0.07, 0.25, -0.28), 0.017, 0.022, 'metal', lados=6)
    # Horquilla, faro, guardabarros y manubrio.
    zf = EJE_Z[0]
    for s in (-1, 1):
        p.tubo((s * 0.044, 0.45, 0.215), (s * 0.044, RADIO_RUEDA, zf), 0.015, 0.015, 'metalOscuro', lados=6)
    p.loft([[(-0.05, 0.41, 0.245), (0.05, 0.41, 0.245), (0.05, 0.41, 0.285), (-0.05, 0.41, 0.285)], [(-0.04, 0.485, 0.22), (0.04, 0.485, 0.22), (0.04, 0.485, 0.262), (-0.04, 0.485, 0.262)]], 'arena', 0.005)
    p.placa([(-0.034, 0.423, 0.285), (0.034, 0.423, 0.285), (0.028, 0.466, 0.268), (-0.028, 0.466, 0.268)], 0.003, 'luzBlanca')
    p.placa([(-0.045, 0.325, 0.2), (0.045, 0.325, 0.2), (0.042, 0.315, 0.31), (-0.042, 0.315, 0.31)], 0.01, 'arena', 0.002)
    p.placa([(-0.042, 0.315, 0.31), (0.042, 0.315, 0.31), (0.026, 0.272, 0.45), (-0.026, 0.272, 0.45)], 0.01, 'arena', 0.002)
    p.tubo((-0.135, 0.505, 0.195), (0.135, 0.505, 0.195), 0.01, 0.01, 'metalOscuro', lados=6)
    p.tubo((0, 0.45, 0.215), (0, 0.505, 0.195), 0.012, 0.012, 'metalOscuro', lados=6)
    for s in (-1, 1):
        p.caja((s * 0.125, 0.505, 0.2), 0.044, 0.042, 0.054, 'neumatico', 0.006)
    # Conductor, inclinado sobre el manubrio.
    cadera = (0, 0.43, -0.012)
    hombro = tronco(p, cadera[0], cadera[1], cadera[2], inclinacion=0.075)
    for s in (-1, 1):
        pierna(p, (s * 0.05, cadera[1] - 0.006, cadera[2]), (s * 0.072, 0.4, 0.135), (s * 0.074, 0.14, 0.06))
        brazo(p, (s * 0.082, hombro[1] - 0.015, hombro[2]), (s * 0.112, hombro[1] - 0.09, hombro[2] + 0.05), (s * 0.12, 0.505, 0.19))
    # Pasajero: las piernas siempre son de la moto.
    cx, cy, cz = CADERA_PASAJERO
    for s in (-1, 1):
        pierna(p, (s * 0.05, cy - 0.006, cz), (s * 0.073, 0.415, cz + 0.13), (s * 0.08, 0.19, cz + 0.045))
        p.caja((s * 0.09, 0.185, cz + 0.05), 0.075, 0.016, 0.022, 'metalOscuro', 0.002)
    if pasajero_entero:
        hombro_p = tronco(p, cx, cy, cz, inclinacion=0.015)
        for s in (-1, 1):
            brazo(p, (s * 0.08, hombro_p[1] - 0.015, hombro_p[2]), (s * 0.104, hombro_p[1] - 0.1, hombro_p[2] + 0.02), (s * 0.078, 0.47, cz + 0.112))
    return p


def fusil(g):
    """Fusil al hombro, apuntando al frente. Devuelve la boca, en coordenadas del arma."""
    g.caja((0.02, 0, 0.09), 0.026, 0.044, 0.2, 'metalOscuro', 0.004)
    g.caja((0.02, -0.042, 0.1), 0.02, 0.06, 0.032, 'metal', 0.002)
    g.cilindro_z(0.02, 0.006, 0.19, 0.335, 0.008, 'metalOscuro', lados=8)
    g.cilindro_z(0.02, 0.006, 0.325, 0.355, 0.012, 'metal', lados=8, bisel=0.002)
    return [(0.02, 0.006, 0.353)]


def lanzador(g, x):
    """Un tubo lanzacohetes al hombro. Devuelve la boca."""
    g.cilindro_z(x, 0.01, -0.13, 0.25, 0.031, 'metalOscuro', lados=10)
    g.cilindro_z(x, 0.01, -0.145, -0.1, 0.04, 'arena', lados=10, bisel=0.003)
    g.cilindro_z(x, 0.01, 0.2, 0.25, 0.038, 'arena', lados=10, bisel=0.003)
    g.caja((x, -0.042, 0.05), 0.02, 0.06, 0.024, 'metal', 0.002)
    g.caja((x - 0.038, 0.03, 0.05), 0.016, 0.03, 0.05, 'neumatico', 0.003)
    return (x, 0.01, 0.29)


def arma(nivel):
    g = Pieza()
    if nivel == 1:
        bocas = fusil(g)
    elif nivel == 2:
        bocas = [lanzador(g, 0.02)]
    else:
        bocas = [lanzador(g, -0.052), lanzador(g, 0.052)]
    # Brazos hasta el arma, en coordenadas del arma: el origen está a la altura de los hombros.
    manos = (((-0.086, -0.018, 0), (-0.09, -0.08, 0.06), (-0.018, -0.052, 0.155)), ((0.086, -0.018, 0), (0.098, -0.09, 0.03), (0.032, -0.062, 0.06)))
    for hombro, codo, mano in manos:
        brazo(g, hombro, codo, mano)
    return g, bocas


def cohete():
    m = Pieza()
    corte = lambda r, z: [(r * math.cos(i / 8 * math.tau + math.pi / 8), r * math.sin(i / 8 * math.tau + math.pi / 8), z) for i in range(8)]
    m.loft([corte(0.024, -0.05), corte(0.024, -0.038)], 'luzBlanca', tapas=False)
    m.loft([corte(0.024, -0.038), corte(0.014, -0.014), corte(0.001, 0)], 'ojiva', tapas=False)
    return m


def construir(id_modelo, nivel):
    limpiar()
    material = material_paleta()
    raiz = vacio('unit_root')
    nodo_casco = vacio('hull', raiz)
    casco(nivel == 0).objeto('casco', material).parent = nodo_casco
    malla = rueda().objeto('rueda_tmp', material).data
    malla.name = 'rueda'
    bpy.data.objects.remove(bpy.data.objects['rueda_tmp'])
    for nombre, z in zip(('F', 'B'), EJE_Z):
        nodo = bpy.data.objects.new(f'wheel_{nombre}', malla)
        bpy.context.collection.objects.link(nodo)
        nodo.parent = nodo_casco
        nodo.location = blender((0, RADIO_RUEDA, z))
    if nivel:
        t = Pieza()
        tronco(t, 0, 0, 0, inclinacion=0.015)
        torreta = t.objeto('turret_yaw', material)
        torreta.parent = raiz
        torreta.location = blender(CADERA_PASAJERO)
        g, bocas = arma(nivel)
        canon = g.objeto('gun_pitch', material)
        canon.parent = torreta
        canon.location = blender((0, ALTO_HOMBRO + 0.005, 0.015))
        for indice, boca in enumerate(bocas, start=1):
            vacio(f'muzzle_{indice:02d}', canon, boca)
        if nivel >= 2:
            malla_cohete = cohete().objeto('cohete_tmp', material).data
            malla_cohete.name = 'cohete'
            bpy.data.objects.remove(bpy.data.objects['cohete_tmp'])
            for indice, boca in enumerate(bocas, start=1):
                nodo = bpy.data.objects.new(f'rocket_{indice:02d}', malla_cohete)
                bpy.context.collection.objects.link(nodo)
                nodo.parent = canon
                nodo.location = blender(boca)
    exportar(id_modelo)


construir('moto-recon', 0)
for nivel in (1, 2, 3):
    construir(f'moto-recon-n{nivel}', nivel)
