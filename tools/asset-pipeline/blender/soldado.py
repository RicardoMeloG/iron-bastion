# Los soldados (ADR 003): una misma figura con ametralladora o con RPG. Se lee desde arriba: casco
# grande, chaleco y colores separados. El chasis son las piernas (pierna_izq y pierna_der, que el juego
# hace caminar), la torreta es el tronco, que gira en la cadera, y el cañón son los brazos con el arma,
# que suben en el hombro. La ojiva del RPG es `rocket_01`: desaparece al disparar.
# Se dibuja con 1 de alto y después se escala para que las piernas midan 1 de fondo, como pide el
# estándar. Se corre con npm run assets:code. Coordenadas del juego: x derecha, y arriba, z adelante.
import math
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pieza import Pieza, blender, bpy, exportar, limpiar, material_paleta, vacio

CADERA = 0.43
HOMBRO = 0.67
PIE_Z = 0.055  # el izquierdo adelante, el derecho atrás: postura de avance
PIE_X = 0.065
BOTA = (0.082, 0.065, 0.14)  # ancho, alto, largo


def pierna(x, z_pie):
    p = Pieza()
    rodilla = (x, 0.235, z_pie * 0.55 + 0.02)
    tobillo = (x, BOTA[1], z_pie)
    p.tubo((x, CADERA + 0.02, 0), rodilla, 0.06, 0.05, 'arena', lados=8)
    p.tubo(rodilla, tobillo, 0.048, 0.04, 'arena', lados=8)
    # Rodillera y bota.
    p.caja((x, rodilla[1], rodilla[2] + 0.042), 0.058, 0.055, 0.022, 'arenaOscura', 0.006)
    p.caja((x, BOTA[1] / 2, z_pie), BOTA[0], BOTA[1], BOTA[2], 'neumatico', 0.01)
    return p


def tronco(con_rpg):
    t = Pieza()
    # En coordenadas de la torreta, que está en la cadera.
    # Cadera y cinturón.
    t.caja((0, 0.02, 0), 0.18, 0.08, 0.12, 'arena', 0.012)
    t.caja((0, 0.055, 0), 0.19, 0.022, 0.125, 'arenaOscura', 0.004)
    # Torso, que se ensancha hacia el pecho.
    def planta(y, ancho, fondo):
        return [(-ancho / 2, y, -fondo / 2), (ancho / 2, y, -fondo / 2), (ancho / 2, y, fondo / 2), (-ancho / 2, y, fondo / 2)]
    t.loft([planta(0.04, 0.2, 0.12), planta(0.2, 0.245, 0.13), planta(0.26, 0.27, 0.13)], 'arena', 0.014, angulo=10)
    # Chaleco con placas y bolsillos al frente.
    t.loft([planta(0.08, 0.225, 0.15), planta(0.25, 0.26, 0.155)], 'arenaOscura', 0.01, angulo=10)
    for x in (-0.06, 0, 0.06):
        t.caja((x, 0.13, 0.083), 0.05, 0.055, 0.02, 'oliva', 0.005)
    # Hombreras.
    for s in (-1, 1):
        t.caja((s * 0.13, 0.25, 0), 0.065, 0.045, 0.11, 'arenaOscura', 0.01)
    # Mochila: caja de munición o los cohetes de repuesto.
    t.caja((0, 0.17, -0.1), 0.17, 0.17, 0.07, 'oliva', 0.012)
    if con_rpg:
        for s in (-1, 1):
            t.tubo((s * 0.05, 0.12, -0.14), (s * 0.05, 0.36, -0.14), 0.022, 0.022, 'metalOscuro', lados=8)
            t.tubo((s * 0.05, 0.36, -0.14), (s * 0.05, 0.42, -0.14), 0.022, 0.003, 'arenaOscura', lados=8)
    else:
        t.caja((0, 0.12, -0.14), 0.1, 0.07, 0.03, 'metalOscuro', 0.005)
    # Cuello, cabeza y casco grande, que es lo que más se ve desde arriba.
    t.cilindro_y(0, 0, 0.27, 0.3, 0.035, 'piel', lados=8)
    t.caja((0, 0.345, 0.008), 0.1, 0.1, 0.105, 'piel', 0.02)
    t.caja((0, 0.345, 0.062), 0.085, 0.022, 0.006, 'neumatico')  # anteojos
    casco = [Pieza.circulo(0, 0.36, 0, 0.082, 10), Pieza.circulo(0, 0.4, 0, 0.078, 10), Pieza.circulo(0, 0.43, 0, 0.058, 10), Pieza.circulo(0, 0.445, 0, 0.025, 10)]
    t.loft(casco, 'oliva', 0.004, angulo=20)
    t.loft([Pieza.circulo(0, 0.352, 0, 0.09, 10), Pieza.circulo(0, 0.364, 0, 0.088, 10)], 'arenaOscura')
    return t


def brazos_y_arma(con_rpg):
    """Brazos y arma, con el origen en el hombro."""
    g = Pieza()
    if con_rpg:
        # El tubo va sobre el hombro derecho; la mano izquierda adelante, la derecha en la empuñadura.
        x, y = 0.1, 0.045
        g.cilindro_z(x, y, -0.2, 0.25, 0.03, 'oliva', lados=10, bisel=0.002)
        g.cilindro_z(x, y, -0.23, -0.2, 0.038, 'metalOscuro', lados=10)
        g.cilindro_z(x, y, 0.06, 0.12, 0.034, 'metalOscuro', lados=10)
        g.caja((x - 0.04, y + 0.02, 0.05), 0.03, 0.035, 0.05, 'metalOscuro', 0.004)  # mira
        g.caja((x, y - 0.05, 0.02), 0.022, 0.05, 0.03, 'metalOscuro', 0.004)  # empuñadura
        manos = [(x, y - 0.06, 0.02), (x - 0.03, y - 0.04, 0.15)]
    else:
        # Ametralladora a la altura del pecho, con la culata en el hombro derecho.
        x, y = 0.06, -0.06
        g.caja((x, y, 0.07), 0.058, 0.075, 0.25, 'metalOscuro', 0.007)
        g.caja((x, y - 0.008, -0.1), 0.05, 0.065, 0.12, 'metalOscuro', 0.007)  # culata
        g.cilindro_z(x, y + 0.01, 0.19, 0.3, 0.027, 'metal', lados=8)  # guardamanos
        g.cilindro_z(x, y + 0.01, 0.3, 0.46, 0.014, 'metalOscuro', lados=6)
        g.caja((x - 0.045, y - 0.035, 0.07), 0.045, 0.065, 0.075, 'oliva', 0.005)  # caja de cinta
        g.caja((x, y + 0.05, 0.09), 0.014, 0.025, 0.06, 'metalOscuro')  # mira
        for s in (-1, 1):  # bípode plegado bajo el cañón
            g.tubo((x + s * 0.012, y - 0.018, 0.4), (x + s * 0.012, y - 0.022, 0.29), 0.006, 0.006, 'metalOscuro', lados=4)
        manos = [(x + 0.005, y - 0.05, 0.0), (x - 0.01, y - 0.02, 0.22)]
    # Brazos: del hombro a la mano, con el codo afuera y abajo.
    for s, mano in zip((1, -1), manos):
        hombro = (s * 0.135, -0.01, 0)
        codo = ((hombro[0] + mano[0]) / 2 + s * 0.035, min(hombro[1], mano[1]) - 0.05, (hombro[2] + mano[2]) / 2 - 0.02)
        g.tubo(hombro, codo, 0.042, 0.037, 'arena', lados=7)
        g.tubo(codo, mano, 0.036, 0.031, 'arena', lados=7)
        g.caja(mano, 0.04, 0.045, 0.045, 'metalOscuro', 0.008)  # guante
    return g


def ojiva():
    o = Pieza()
    x, y = 0.1, 0.045
    o.tubo((x, y, 0.25), (x, y, 0.29), 0.018, 0.045, 'oliva', lados=10)
    o.tubo((x, y, 0.29), (x, y, 0.35), 0.045, 0.04, 'oliva', lados=10)
    o.tubo((x, y, 0.35), (x, y, 0.42), 0.04, 0.006, 'arenaOscura', lados=10)
    return o


def escalar(pieza, k):
    pieza.vertices = [(v[0] * k, v[1] * k, v[2] * k) for v in pieza.vertices]
    return pieza


def soldado(nombre, con_rpg):
    limpiar()
    material = material_paleta()
    piernas = {'pierna_izq': pierna(-PIE_X, PIE_Z), 'pierna_der': pierna(PIE_X, -PIE_Z)}
    # Las piernas deben medir 1 de fondo: de ahí sale la escala de todo.
    zs = [v[1] for p in piernas.values() for v in p.vertices]  # en Blender, y es -z del juego
    k = 1 / (max(zs) - min(zs))
    raiz = vacio('unit_root')
    casco = vacio('hull', raiz)
    for nodo, p in piernas.items():
        escalar(p, k).objeto(nodo, material).parent = casco
    cintura = escalar(tronco(con_rpg), k).objeto('turret_yaw', material)
    cintura.parent = raiz
    cintura.location = blender((0, CADERA * k, 0))
    arma = escalar(brazos_y_arma(con_rpg), k).objeto('gun_pitch', material)
    arma.parent = cintura
    arma.location = blender((0, (HOMBRO - CADERA) * k, 0))
    if con_rpg:
        cohete = escalar(ojiva(), k).objeto('rocket_01', material)
        cohete.parent = arma
        vacio('muzzle_01', arma, (0.1 * k, 0.045 * k, 0.42 * k))
    else:
        vacio('muzzle_01', arma, (0.06 * k, -0.05 * k, 0.46 * k))
    exportar(nombre)


soldado('infanteria-ametralladora', False)
soldado('infanteria-rpg', True)
