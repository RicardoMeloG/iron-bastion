# Torres por código (ADR 003): MG-7, LM-2 y AA-3 sobre la base común. Lo que sube de nivel es el arma;
# los cañones de la gatling y los misiles son piezas propias, para que giren y salgan. Se corre con
# npm run assets:code. Coordenadas del juego: x derecha, y arriba, z adelante.
import math
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from base_torre import PIVOTE_TORRE, construir_base
from pieza import Pieza, anillo, blender, bpy, exportar, limpiar, material_paleta, vacio

ALTO_ARMA = 0.17


def seccion(z, media, alto, y=0.0):
    """Corte de un cuerpo blindado: hexágono de techo angosto, a lo largo de z."""
    return [(-media, y - alto * 0.62, z), (media, y - alto * 0.62, z), (media, y + alto * 0.2, z), (media * 0.56, y + alto, z), (-media * 0.56, y + alto, z), (-media, y + alto * 0.2, z)]


def perno_z(p, x, y, z, radio=0.01):
    p.cilindro_z(x, y, z, z + 0.008, radio, 'metal', lados=6, bisel=0.002)


def perno_x(p, x, y, z, s, radio=0.01):
    p.cilindro_x(x, x + s * 0.008, y, z, radio, 'metal', lados=6, bisel=0.002)


def piston(p, abajo, arriba):
    """Camisa oscura abajo y vástago de metal arriba, con collares."""
    a = [abajo[i] + (arriba[i] - abajo[i]) * 0.56 for i in range(3)]
    p.tubo(abajo, a, 0.021, 0.021, 'metalOscuro', lados=8, bisel=0.002)
    p.tubo(a, arriba, 0.012, 0.012, 'metal', lados=8)
    p.tubo(arriba, [arriba[i] + (arriba[i] - abajo[i]) * 0.1 for i in range(3)], 0.02, 0.02, 'metalOscuro', lados=8, bisel=0.002)


def soporte(ancho=0.09):
    """Lo que gira sobre la base: aro, pedestal y dos pistones hacia el arma."""
    t = Pieza()
    t.loft([anillo(0.11, 0), anillo(0.11, 0.016), anillo(0.085, 0.03), anillo(0.075, 0.075)], 'metalOscuro', 0.004)
    for s in (-1, 1):
        piston(t, (s * 0.07, 0.03, 0.035), (s * ancho, ALTO_ARMA - 0.045, 0.02))
    return t


def tubo_cerrojo(p, x, y, z0, largo, radio):
    """Un cañón con camisa y apagallamas ranurado. Devuelve la punta."""
    punta = z0 + largo
    apagallamas = punta - largo * 0.34
    p.cilindro_z(x, y, z0, apagallamas, radio, 'metalOscuro', lados=10)
    p.cilindro_z(x, y, z0, z0 + largo * 0.12, radio * 1.32, 'metal', lados=10, bisel=0.002)
    p.cilindro_z(x, y, apagallamas, punta, radio * 1.55, 'metalOscuro', lados=10, bisel=0.002)
    for i in range(3):
        z = apagallamas + (i + 0.6) * (punta - apagallamas) / 3.2
        p.caja((x, y + radio * 1.5, z), radio * 1.2, 0.004, (punta - apagallamas) * 0.16, 'neumatico')
        for s in (-1, 1):
            p.caja((x + s * radio * 1.5, y, z), 0.004, radio * 1.1, (punta - apagallamas) * 0.16, 'neumatico')
    p.cilindro_z(x, y, punta - 0.002, punta + 0.001, radio * 0.95, 'neumatico', lados=10)
    return (x, y, punta)


def cuerpo_ametralladora(ancho):
    """La cabeza en cuña de la MG-7, con su frente oscuro, hombros y sensor."""
    g = Pieza()
    w = ancho
    g.loft([seccion(0.17, w * 0.62, 0.062), seccion(0.095, w * 0.95, 0.09), seccion(-0.1, w, 0.095), seccion(-0.175, w * 0.7, 0.068)], 'arena', 0.006, angulo=9)
    # Frente oscuro con sus pernos.
    g.loft([seccion(0.168, w * 0.66, 0.066), seccion(0.178, w * 0.62, 0.06)], 'metalOscuro', 0.003)
    for sx in (-1, 1):
        for sy in (-1, 1):
            perno_z(g, sx * w * 0.52, 0.004 + sy * 0.033, 0.176, 0.007)
    # Sensor del techo.
    g.loft([[(-0.05, 0.08, -0.08), (0.05, 0.08, -0.08), (0.05, 0.08, 0.075), (-0.05, 0.08, 0.075)], [(-0.04, 0.122, -0.055), (0.04, 0.122, -0.055), (0.04, 0.122, 0.03), (-0.04, 0.122, 0.03)]], 'metalOscuro', 0.004)
    g.caja((0, 0.125, -0.012), 0.05, 0.008, 0.05, 'metal', 0.002)
    for s in (-1, 1):
        # Hombros en ángulo, con el borde oscuro debajo.
        x = s * w
        g.placa(_orden(s, [(x, -0.045, -0.13), (x, -0.045, 0.085), (x * 0.82, 0.085, 0.045), (x * 0.76, 0.085, -0.115)]), 0.018, 'arenaClara', 0.004)
        g.placa(_orden(s, [(x * 1.03, -0.06, -0.09), (x * 1.03, -0.06, 0.045), (x * 1.03, -0.025, 0.05), (x * 1.03, -0.025, -0.095)]), 0.012, 'metalOscuro', 0.002)
        perno_x(g, x * 1.03 + s * 0.01, -0.043, -0.06, s, 0.007)
        perno_x(g, x * 1.03 + s * 0.01, -0.043, 0.015, s, 0.007)
    return g


def _orden(s, puntos):
    """Las placas de un lado se recorren al revés que las del otro, para mirar hacia afuera."""
    return puntos if s > 0 else list(reversed(puntos))


def cinta(g, desde, hasta, alto, eslabones=9, radio=0.013):
    """La cinta de munición: eslabones en arco entre dos puntos."""
    previo = desde
    for i in range(1, eslabones + 1):
        t = i / eslabones
        punto = tuple(desde[k] + (hasta[k] - desde[k]) * t for k in range(3))
        punto = (punto[0], punto[1] + alto * 4 * t * (1 - t), punto[2])
        g.tubo(previo, punto, radio, radio, 'arenaClara' if i % 2 else 'metalOscuro', lados=4)
        previo = punto


def caja_municion(g, x, ancho):
    g.caja((x, -0.012, -0.03), 0.09, 0.105, 0.145, 'arena', 0.005)
    g.caja((x, 0.044, -0.03), 0.098, 0.012, 0.15, 'metalOscuro', 0.002)
    for sz in (-1, 1):
        g.caja((x, -0.012, -0.03 + sz * 0.04), 0.098, 0.116, 0.014, 'metalOscuro', 0.002)
    for sy in (-1, 1):
        for sz in (-1, 1):
            perno_x(g, x - 0.047, -0.012 + sy * 0.03, -0.03 + sz * 0.042, -1, 0.006)
    cinta(g, (x + 0.01, 0.05, -0.03), (-ancho * 0.3, 0.09, -0.04), 0.05)


def mg7(nivel):
    torreta = soporte(0.1)
    rotor = None
    if nivel == 5:
        ancho = 0.145
        g = cuerpo_ametralladora(ancho)
        # Tambor grande atrás, con costillas, y conducto curvo hasta el cuerpo.
        x = -ancho - 0.085
        g.cilindro_x(x - 0.05, x + 0.05, -0.005, -0.065, 0.098, 'arena', lados=14, bisel=0.006)
        for i in range(8):
            a = i / 8 * math.tau
            g.caja((x, -0.005 + 0.096 * math.sin(a), -0.065 + 0.096 * math.cos(a)), 0.104, 0.018, 0.018, 'metalOscuro', 0.002)
        g.cilindro_x(x - 0.056, x - 0.048, -0.005, -0.065, 0.06, 'metalOscuro', lados=12, bisel=0.002)
        g.cilindro_x(x - 0.062, x - 0.054, -0.005, -0.065, 0.03, 'metal', lados=6, bisel=0.002)
        cinta(g, (x + 0.03, 0.09, -0.06), (-ancho * 0.28, 0.095, -0.03), 0.05, eslabones=11, radio=0.017)
        # Cubo fijo donde entran los cañones.
        g.cilindro_z(0, 0, 0.17, 0.23, 0.066, 'metalOscuro', lados=12, bisel=0.004)
        # Lo que gira, sobre el eje z del arma.
        rotor = Pieza()
        radio_giro = 0.04
        bocas = []
        for i in range(6):
            a = i / 6 * math.tau
            x_b, y_b = radio_giro * math.cos(a), radio_giro * math.sin(a)
            rotor.cilindro_z(x_b, y_b, 0.22, 0.49, 0.0125, 'metalOscuro', lados=8)
            rotor.cilindro_z(x_b, y_b, 0.485, 0.5, 0.016, 'metal', lados=8, bisel=0.002)
            rotor.cilindro_z(x_b, y_b, 0.499, 0.501, 0.009, 'neumatico', lados=8)
            bocas.append((x_b, y_b, 0.498))
        for z in (0.285, 0.39, 0.47):
            rotor.cilindro_z(0, 0, z, z + 0.022, 0.06, 'metalOscuro', lados=12, bisel=0.003)
        rotor.cilindro_z(0, 0, 0.226, 0.285, 0.018, 'metal', lados=8)
        # Una marca asimétrica, para que el giro se note a la distancia.
        rotor.caja((0, 0.058, 0.3), 0.024, 0.012, 0.03, 'arena', 0.002)
        rotor.caja((0, -0.058, 0.405), 0.024, 0.012, 0.03, 'arena', 0.002)
        return torreta, g, rotor, bocas, None
    ancho = 0.115 + 0.012 * (nivel - 1)
    g = cuerpo_ametralladora(ancho)
    caja_municion(g, -ancho - 0.058, ancho)
    posiciones = {1: [(0, 0)], 2: [(-0.042, 0), (0.042, 0)], 3: [(-0.066, 0), (0, 0), (0.066, 0)], 4: [(-0.081, 0), (-0.027, 0), (0.027, 0), (0.081, 0)]}[nivel]
    radio = 0.022 if nivel == 1 else 0.018
    bocas = [tubo_cerrojo(g, x, y, 0.172, 0.28 if nivel == 1 else 0.26, radio) for x, y in posiciones]
    return torreta, g, None, bocas, None


def lm2(nivel):
    torreta = soporte(0.085)
    g = Pieza()
    # Cabeza con visor: un cuerpo chico, que apunta.
    g.loft([seccion(0.115, 0.046, 0.05), seccion(0.045, 0.078, 0.078), seccion(-0.095, 0.074, 0.074), seccion(-0.145, 0.05, 0.05)], 'arena', 0.006, angulo=9)
    g.loft([[(-0.058, -0.02, 0.097), (0.058, -0.02, 0.097), (0.066, 0.034, 0.07), (-0.066, 0.034, 0.07)], [(-0.05, -0.02, 0.118), (0.05, -0.02, 0.118), (0.058, 0.03, 0.09), (-0.058, 0.03, 0.09)]], 'metalOscuro', 0.003)
    for x in (-0.032, 0, 0.032):
        g.cilindro_z(x, 0.008, 0.103, 0.116, 0.012, 'metal', lados=8, bisel=0.002)
        g.cilindro_z(x, 0.008, 0.115, 0.118, 0.007, 'neumatico', lados=8)
    g.loft([[(-0.036, 0.068, -0.08), (0.036, 0.068, -0.08), (0.036, 0.068, 0.03), (-0.036, 0.068, 0.03)], [(-0.026, 0.092, -0.06), (0.026, 0.092, -0.06), (0.026, 0.092, 0.0), (-0.026, 0.092, 0.0)]], 'metalOscuro', 0.003)
    # Cuántos tubos por lado.
    por_lado = {1: (1, 1), 2: (2, 1), 3: (2, 2), 4: (3, 2), 5: (3, 3)}[nivel]
    paso = 0.088
    alto_max = max(por_lado) * paso + 0.04
    bocas = []
    for s, tubos in zip((-1, 1), por_lado):
        x = s * 0.235
        # Hombro: articulación y brazo oscuro hasta el contenedor.
        g.cilindro_x(s * 0.07, s * 0.135, 0, -0.01, 0.046, 'metalOscuro', lados=10, bisel=0.004)
        g.cilindro_x(s * 0.098, s * 0.14, 0, -0.01, 0.024, 'metal', lados=8, bisel=0.002)
        perfil = [(z, y) for z, y in ((0.03, -0.042), (0.03, 0.042), (-0.04, 0.05), (-0.09, 0.03), (-0.09, -0.03), (-0.04, -0.05))]
        g.extruir_x(perfil, s * 0.125, s * 0.17, 'metalOscuro', 0.005)
        # Contenedor blindado, achaflanado, del alto de sus tubos.
        alto = tubos * paso + 0.04
        medio = alto / 2
        perfil = [(x - 0.066, -medio + 0.018), (x - 0.048, -medio), (x + 0.048, -medio), (x + 0.066, -medio + 0.018), (x + 0.066, medio - 0.018), (x + 0.048, medio), (x - 0.048, medio), (x - 0.066, medio - 0.018)]
        g.loft([[(px * 0.98 + x * 0.02, py * 0.92, -0.125) for px, py in perfil], [(px, py, -0.07) for px, py in perfil], [(px, py, 0.135) for px, py in perfil]], 'arena', 0.006, angulo=12)
        # Placa de refuerzo con pernos en la cara de afuera y un filo oscuro abajo.
        g.placa(_orden(s, [(x + s * 0.0665, -medio * 0.6, -0.08), (x + s * 0.0665, -medio * 0.6, 0.09), (x + s * 0.0665, medio * 0.6, 0.09), (x + s * 0.0665, medio * 0.6, -0.08)]), 0.006, 'arenaClara', 0.002)
        for sy in (-1, 1):
            perno_x(g, x + s * 0.0725, sy * medio * 0.45, 0.005, s, 0.007)
        # Frente oscuro con una boca por tubo.
        g.caja((x, 0, 0.137), 0.11, alto - 0.018, 0.008, 'metalOscuro', 0.002)
        for i in range(tubos):
            y = (i - (tubos - 1) / 2) * paso
            lados = 8
            giro = math.pi / 8
            fila = lambda r, z: [(x + r * math.cos(k / lados * math.tau + giro), y + r * math.sin(k / lados * math.tau + giro), z) for k in range(lados)]
            g.loft([fila(0.04, 0.14), fila(0.04, 0.15), fila(0.033, 0.15)], 'metal', tapas=False)
            g.cilindro_z(x, y, 0.14, 0.144, 0.034, 'neumatico', lados=8, giro=giro)
            bocas.append((x, y, 0.2))
        for sy in (-1, 1):
            perno_z(g, x + 0.042, sy * (medio - 0.018), 0.14, 0.006)
            perno_z(g, x - 0.042, sy * (medio - 0.018), 0.14, 0.006)
    # El misil asoma con su ojiva: banda blanca y punta roja.
    misil = Pieza()
    corte = lambda r, z: [(r * math.cos(i / 8 * math.tau + math.pi / 8), r * math.sin(i / 8 * math.tau + math.pi / 8), z) for i in range(8)]
    misil.loft([corte(0.03, -0.065), corte(0.03, -0.05), corte(0.024, -0.05)], 'luzBlanca', tapas=False)
    misil.loft([corte(0.024, -0.05), corte(0.018, -0.022), corte(0.001, 0)], 'ojiva', tapas=False)
    return torreta, g, None, bocas, misil


def aa3(nivel):
    t = soporte(0.06)
    g = Pieza()
    # Carro estrecho y largo, para un cañón muy fino.
    g.loft([seccion(0.13, 0.038, 0.04), seccion(0.05, 0.06, 0.066), seccion(-0.09, 0.066, 0.075), seccion(-0.15, 0.044, 0.05)], 'arena', 0.005, angulo=9)
    # Escudo en ángulo adelante.
    g.placa([(-0.082, -0.04, 0.075), (0.082, -0.04, 0.075), (0.066, 0.075, 0.03), (-0.066, 0.075, 0.03)], 0.012, 'arenaClara', 0.004)
    # Tambor al costado.
    g.cilindro_x(-0.135, -0.066, 0.0, -0.05, 0.066, 'arena', lados=12, bisel=0.004)
    for i in range(6):
        a = i / 6 * math.tau
        g.caja((-0.1, 0.064 * math.sin(a), -0.05 + 0.064 * math.cos(a)), 0.074, 0.012, 0.012, 'metalOscuro', 0.002)
    g.cilindro_x(-0.141, -0.132, 0.0, -0.05, 0.03, 'metal', lados=6, bisel=0.002)
    # Mira de anillo sobre el arma.
    centro = (0, 0.125, 0.0)
    segmentos = 12
    for i in range(segmentos):
        a0 = i / segmentos * math.tau
        a1 = (i + 1) / segmentos * math.tau
        g.tubo((0.038 * math.cos(a0), centro[1] + 0.038 * math.sin(a0), 0), (0.038 * math.cos(a1), centro[1] + 0.038 * math.sin(a1), 0), 0.0035, 0.0035, 'metalOscuro', lados=4)
    g.tubo((-0.038, centro[1], 0), (0.038, centro[1], 0), 0.0025, 0.0025, 'metalOscuro', lados=4)
    g.tubo((0, centro[1] - 0.038, 0), (0, centro[1] + 0.038, 0), 0.0025, 0.0025, 'metalOscuro', lados=4)
    g.tubo((0, 0.06, 0), (0, centro[1] - 0.036, 0), 0.005, 0.005, 'metalOscuro', lados=4)
    posiciones = {1: [(0, 0.012)], 2: [(-0.024, 0.012), (0.024, 0.012)], 3: [(-0.024, 0.036), (0.024, 0.036), (-0.024, -0.012), (0.024, -0.012)]}[min(nivel, 3)]
    if nivel >= 3:
        for s in (-1, 1):
            g.placa(_orden(s, [(s * 0.066, -0.04, -0.11), (s * 0.066, -0.04, 0.05), (s * 0.052, 0.06, 0.02), (s * 0.048, 0.06, -0.09)]), 0.012, 'arenaClara', 0.003)
    if nivel >= 4:
        for s in (-1, 1):
            g.caja((s * 0.083, -0.012, -0.03), 0.012, 0.075, 0.12, 'metalOscuro', 0.003)
            perno_x(g, s * 0.089, -0.012, -0.03, s, 0.008)
    if nivel == 5:
        # Radar plano en un mástil, sobre lo que gira.
        t.tubo((0.09, 0.03, -0.075), (0.09, 0.21, -0.075), 0.01, 0.008, 'metalOscuro', lados=6)
        t.caja((0.09, 0.26, -0.073), 0.13, 0.11, 0.012, 'metalOscuro', 0.003)
        t.caja((0.09, 0.26, -0.066), 0.104, 0.086, 0.004, 'arena', 0.001)
        for i in range(3):
            t.caja((0.09, 0.232 + i * 0.028, -0.063), 0.09, 0.006, 0.003, 'metalOscuro')
    bocas = []
    largo = 0.4
    for x, y in posiciones:
        g.cilindro_z(x, y, 0.1, 0.1 + largo, 0.0075, 'metalOscuro', lados=8)
        g.cilindro_z(x, y, 0.1, 0.17, 0.012, 'metal', lados=8, bisel=0.002)
        g.cilindro_z(x, y, 0.1 + largo - 0.03, 0.1 + largo, 0.0125, 'metalOscuro', lados=8, bisel=0.002)
        g.cilindro_z(x, y, 0.1 + largo - 0.001, 0.1 + largo + 0.001, 0.006, 'neumatico', lados=8)
        bocas.append((x, y, 0.1 + largo))
    return t, g, None, bocas, None


def construir(id_modelo, partes):
    limpiar()
    material = material_paleta()
    raiz = vacio('unit_root')
    casco = vacio('hull', raiz)
    base = construir_base()
    base.ajustar_planta(0.5)
    base.objeto('casco', material).parent = casco
    torreta_p, arma_p, rotor_p, bocas, misil_p = partes
    torreta = torreta_p.objeto('turret_yaw', material)
    torreta.parent = raiz
    torreta.location = blender((0, PIVOTE_TORRE, 0))
    arma = arma_p.objeto('gun_pitch', material)
    arma.parent = torreta
    arma.location = blender((0, ALTO_ARMA, 0))
    if rotor_p:
        rotor_p.objeto('rotor', material).parent = arma
    for indice, boca in enumerate(bocas, start=1):
        vacio(f'muzzle_{indice:02d}', arma, boca)
    if misil_p:
        malla = misil_p.objeto('misil_tmp', material).data
        malla.name = 'misil'
        bpy.data.objects.remove(bpy.data.objects['misil_tmp'])
        for indice, boca in enumerate(bocas, start=1):
            nodo = bpy.data.objects.new(f'rocket_{indice:02d}', malla)
            bpy.context.collection.objects.link(nodo)
            nodo.parent = arma
            nodo.location = blender(boca)
    exportar(id_modelo)


for nivel in range(1, 6):
    construir(f'mg7-n{nivel}', mg7(nivel))
    construir(f'lm2-lanza-n{nivel}', lm2(nivel))
    construir(f'aa3-halcon-n{nivel}', aa3(nivel))
