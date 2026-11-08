# La patrulla (ADR 003): un solo vehículo propio. Su veteranía es lo que lleva en el techo: nada,
# ametralladora, un misil o dos.
# Las ruedas son nodos propios, para que puedan girar. Se corre con npm run assets:code.
# Coordenadas del juego: x derecha, y arriba, z adelante.
import math
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pieza import Pieza, blender, bpy, exportar, limpiar, material_paleta, vacio

RADIO_RUEDA = 0.128
ANCHO_RUEDA = 0.105
EJE_X = 0.2
EJE_Z = (0.285, -0.285)
TECHO = 0.402
PIVOTE_TORRETA = (0, TECHO, -0.03)


def rueda():
    """Neumático de tacos con su cubo, con el eje en x."""
    p = Pieza()
    lados = 16
    def fila(x, afuera, adentro):
        return [(x, (afuera if i % 2 == 0 else adentro) * math.cos(i / lados * math.tau), (afuera if i % 2 == 0 else adentro) * math.sin(i / lados * math.tau)) for i in range(lados)]
    medio = ANCHO_RUEDA / 2
    r = RADIO_RUEDA
    p.loft([fila(-medio, r * 0.8, r * 0.8), fila(-medio * 0.72, r, r * 0.88), fila(medio * 0.72, r, r * 0.88), fila(medio, r * 0.8, r * 0.8)], 'neumatico')
    for s in (-1, 1):
        p.cilindro_x(s * medio * 0.8, s * (medio + 0.006), 0, 0, r * 0.5, 'metal', lados=8, bisel=0.004)
        p.cilindro_x(s * (medio + 0.004), s * (medio + 0.011), 0, 0, r * 0.2, 'metalOscuro', lados=6, bisel=0.002)
    return p


def casco(escotilla):
    """Carrocería clásica: baja y ancha, capó corto, cabina cerrada de cuatro puertas."""
    p = Pieza()
    ancho = 0.215
    # Cuerpo bajo: frente recto, capó casi plano que sube un poco hasta el parabrisas.
    lateral = [(0.455, 0.16), (0.455, 0.268), (0.435, 0.287), (0.16, 0.302), (-0.465, 0.302), (-0.47, 0.285), (-0.47, 0.16)]
    p.extruir_x(lateral, -ancho, ancho, 'arena', 0.007, angulo=8)
    # Cabina: parabrisas casi vertical, techo plano, costados apenas inclinados.
    def planta(y, media, adelante, atras):
        return [(-media, y, atras), (media, y, atras), (media, y, adelante), (-media, y, adelante)]
    p.loft([planta(0.3, 0.205, 0.15, -0.44), planta(TECHO, 0.19, 0.115, -0.43)], 'arena', 0.007, angulo=8)
    frente = lambda y: 0.15 - (y - 0.3) / (TECHO - 0.3) * 0.035
    # Parabrisas partido en dos.
    for x0, x1 in ((-0.175, -0.012), (0.012, 0.175)):
        p.placa([(x0, 0.32, frente(0.32)), (x1, 0.32, frente(0.32)), (x1, 0.39, frente(0.39)), (x0, 0.39, frente(0.39))], 0.003, 'vidrio')
    for s in (-1, 1):
        # Dos ventanas por lado, con las puertas marcadas.
        for z0, z1 in ((0.095, -0.085), (-0.115, -0.29)):
            esquinas = [(s * 0.204, 0.32, z0), (s * 0.204, 0.32, z1), (s * 0.196, 0.385, z1), (s * 0.196, 0.385, z0)]
            p.placa(esquinas if s > 0 else esquinas[::-1], 0.003, 'vidrio')
        for z in (0.118, -0.1, -0.305):
            p.caja((s * 0.217, 0.27, z), 0.004, 0.2, 0.006, 'metalOscuro')
        for z in (0.02, -0.19):
            p.caja((s * 0.219, 0.28, z), 0.006, 0.012, 0.035, 'metalOscuro')
        # Espejo en su brazo.
        p.caja((s * 0.24, 0.345, 0.125), 0.012, 0.055, 0.035, 'metalOscuro', 0.003)
        p.caja((s * 0.218, 0.33, 0.125), 0.04, 0.01, 0.01, 'metalOscuro')
        # Guardabarros negros delgados: una banda en arco que sigue la rueda. Y estribo entre ellas.
        for z in EJE_Z:
            adentro, afuera, tramos = RADIO_RUEDA + 0.012, RADIO_RUEDA + 0.024, 8
            for i in range(tramos):
                a0 = math.radians(35 + 110 * i / tramos)
                a1 = math.radians(35 + 110 * (i + 1) / tramos)
                punto = lambda r, ang: (z + r * math.cos(ang), RADIO_RUEDA + r * math.sin(ang))
                tramo = [punto(afuera, a0), punto(afuera, a1), punto(adentro, a1), punto(adentro, a0)]
                p.extruir_x(tramo, s * 0.19, s * 0.24, 'metalOscuro')
        p.caja((s * 0.225, 0.165, 0), 0.04, 0.026, 0.22, 'metalOscuro', 0.004)
        # Faros con su luz de posición, y luces de atrás.
        p.caja((s * 0.155, 0.225, 0.456), 0.05, 0.035, 0.008, 'luzBlanca', 0.002)
        p.caja((s * 0.2, 0.225, 0.456), 0.016, 0.025, 0.008, 'luzAmbar')
        p.caja((s * 0.18, 0.25, -0.47), 0.03, 0.04, 0.006, 'luzRoja')
    # Parrilla negra con barras verticales entre los faros.
    p.caja((0, 0.225, 0.457), 0.2, 0.075, 0.006, 'metalOscuro')
    for i in range(7):
        p.caja((-0.075 + i * 0.025, 0.225, 0.461), 0.01, 0.06, 0.004, 'arena')
    # Tomas de aire en el capó.
    for z in (0.345, 0.315, 0.285):
        p.caja((0, 0.291 + (0.435 - z) * 0.05, z), 0.13, 0.006, 0.014, 'metalOscuro')
    # Parachoques negros con ganchos de remolque.
    p.caja((0, 0.15, 0.475), 0.5, 0.07, 0.05, 'metalOscuro', 0.006)
    p.caja((0, 0.16, -0.485), 0.46, 0.06, 0.03, 'metalOscuro', 0.005)
    for s in (-1, 1):
        p.caja((s * 0.1, 0.105, 0.488), 0.03, 0.025, 0.02, 'metal', 0.004)
    # Barras en el techo y antena atrás.
    for s in (-1, 1):
        for z in (0.06, -0.36):
            p.tubo((s * 0.15, TECHO, z), (s * 0.15, TECHO + 0.035, z), 0.009, 0.009, 'metalOscuro', lados=6)
        p.tubo((s * 0.15, TECHO + 0.035, 0.06), (s * 0.15, TECHO + 0.035, -0.36), 0.01, 0.01, 'metalOscuro', lados=6)
    p.cilindro_y(0.15, -0.4, TECHO, TECHO + 0.2, 0.004, 'metalOscuro', lados=5)
    if escotilla:
        p.cilindro_y(0, -0.03, TECHO - 0.004, TECHO + 0.016, 0.075, 'metalOscuro', lados=14, bisel=0.003)
    return p


def artillero(p, manos):
    """El soldado en la escotilla, de la cintura para arriba. `manos`: dónde agarra el arma."""
    z = -0.055
    p.loft([[(-0.04, 0.01, z - 0.028), (0.04, 0.01, z - 0.028), (0.04, 0.01, z + 0.028), (-0.04, 0.01, z + 0.028)], [(-0.05, 0.11, z - 0.03), (0.05, 0.11, z - 0.03), (0.05, 0.11, z + 0.03), (-0.05, 0.11, z + 0.03)]], 'arenaClara', 0.006)
    # Chaleco con sus bolsillos.
    p.caja((0, 0.07, z), 0.094, 0.082, 0.068, 'arenaOscura', 0.006)
    for s in (-1, 1):
        p.caja((s * 0.024, 0.052, z + 0.037), 0.03, 0.03, 0.01, 'metalOscuro', 0.002)
    # Cuello, cara y casco.
    p.cilindro_y(0, z, 0.105, 0.125, 0.018, 'piel', lados=6)
    p.loft([[(-0.03, 0.122, z - 0.028), (0.03, 0.122, z - 0.028), (0.03, 0.122, z + 0.03), (-0.03, 0.122, z + 0.03)], [(-0.033, 0.16, z - 0.03), (0.033, 0.16, z - 0.03), (0.033, 0.16, z + 0.034), (-0.033, 0.16, z + 0.034)]], 'piel', 0.005)
    p.loft([p.circulo(0, 0.148, z + 0.002, 0.05, 10), p.circulo(0, 0.162, z + 0.002, 0.047, 10), p.circulo(0, 0.186, z, 0.033, 10)], 'arenaOscura', 0.003)
    # Brazos hasta el arma, con codos abiertos.
    for s, mano in zip((-1, 1), manos):
        hombro = (s * 0.058, 0.1, z)
        codo = (s * 0.075, 0.06, z + 0.045)
        p.tubo(hombro, codo, 0.02, 0.017, 'arenaClara', lados=6, bisel=0.002)
        p.tubo(codo, mano, 0.017, 0.014, 'arenaClara', lados=6, bisel=0.002)
        p.caja(mano, 0.022, 0.022, 0.022, 'piel', 0.004)


def aro(p):
    p.cilindro_y(0, 0, -0.004, 0.012, 0.102, 'metalOscuro', lados=16, bisel=0.003)
    p.loft([p.circulo(0, 0.012, 0, 0.102, 16), p.circulo(0, 0.022, 0, 0.09, 16), p.circulo(0, 0.022, 0, 0.074, 16), p.circulo(0, 0.012, 0, 0.072, 16)], 'metal')


def con_ametralladora():
    torreta = Pieza()
    aro(torreta)
    torreta.cilindro_y(0, 0.05, 0.015, 0.09, 0.016, 'metalOscuro', lados=8, bisel=0.002)
    artillero(torreta, ((-0.03, 0.07, 0.025), (0.03, 0.07, 0.025)))
    arma = Pieza()
    arma.caja((0, 0.0, 0.02), 0.046, 0.05, 0.12, 'metalOscuro', 0.005)
    arma.caja((-0.04, -0.005, 0.03), 0.04, 0.05, 0.065, 'arena', 0.005)
    arma.caja((0, 0.03, 0.02), 0.02, 0.012, 0.07, 'metal', 0.002)
    for s in (-1, 1):
        arma.caja((s * 0.024, -0.016, -0.045), 0.012, 0.03, 0.012, 'metal', 0.002)
    arma.cilindro_z(0, 0.002, 0.08, 0.255, 0.009, 'metalOscuro', lados=8)
    arma.cilindro_z(0, 0.002, 0.2, 0.232, 0.013, 'metal', lados=8, bisel=0.002)
    arma.cilindro_z(0, 0.002, 0.255, 0.3, 0.015, 'metalOscuro', lados=8, bisel=0.002)
    # Escudo anguloso.
    escudo = [(-0.07, -0.045), (0.07, -0.045), (0.082, 0.01), (0.05, 0.048), (0.016, 0.048), (0.016, 0.022), (-0.016, 0.022), (-0.016, 0.048), (-0.05, 0.048), (-0.082, 0.01)]
    arma.extruir_z(escudo, 0.082, 0.094, 'arena', 0.004, angulo=20)
    return torreta, arma, [(0, 0.002, 0.298)], None, (0, 0.1, 0.05)


def con_un_misil():
    return lanzador((0,))


def con_misiles():
    return lanzador((-1, 1))


def lanzador(lados):
    torreta = Pieza()
    aro(torreta)
    torreta.cilindro_y(0, 0.05, 0.015, 0.1, 0.018, 'metalOscuro', lados=8, bisel=0.002)
    artillero(torreta, ((-0.042, 0.072, 0.025), (0.042, 0.072, 0.025)))
    arma = Pieza()
    arma.caja((0, -0.012, 0), 0.05, 0.026, 0.04, 'metalOscuro', 0.004)
    bocas = []
    for s in lados:
        x = s * 0.047
        arma.caja((x, 0.03, 0.05), 0.084, 0.078, 0.2, 'metalOscuro', 0.006)
        arma.caja((x, 0.03, 0.148), 0.09, 0.084, 0.012, 'metal', 0.003)
        arma.caja((x, 0.03, -0.048), 0.09, 0.084, 0.012, 'metal', 0.003)
        arma.cilindro_z(x, 0.03, 0.15, 0.158, 0.03, 'neumatico', lados=8, giro=math.pi / 8)
        bocas.append((x, 0.03, 0.2))
    # Mira a un costado.
    mira = -0.106 if len(lados) > 1 else -0.06
    arma.caja((mira, 0.04, 0.02), 0.03, 0.03, 0.05, 'arena', 0.004)
    arma.caja((mira, 0.04, 0.047), 0.022, 0.018, 0.004, 'neumatico')
    for s in (-1, 1):
        arma.caja((s * 0.042, -0.016, -0.03), 0.012, 0.04, 0.012, 'metal', 0.002)
    # El misil: cuerpo, banda blanca y ojiva roja.
    misil = Pieza()
    seccion = lambda r, z: [(r * math.cos(i / 8 * math.tau + math.pi / 8), r * math.sin(i / 8 * math.tau + math.pi / 8), z) for i in range(8)]
    misil.loft([seccion(0.027, -0.05), seccion(0.027, -0.035), seccion(0.021, -0.035)], 'luzBlanca', tapas=False)
    misil.loft([seccion(0.021, -0.035), seccion(0.013, -0.012), seccion(0.001, 0)], 'ojiva', tapas=False)
    return torreta, arma, bocas, misil, (0, 0.1, 0.05)


def construir(id_modelo, variante):
    limpiar()
    material = material_paleta()
    raiz = vacio('unit_root')
    nodo_casco = vacio('hull', raiz)
    casco(variante is None).objeto('casco', material).parent = nodo_casco
    malla_rueda = rueda().objeto('rueda_tmp', material).data
    malla_rueda.name = 'rueda'
    bpy.data.objects.remove(bpy.data.objects['rueda_tmp'])
    for lado, s in (('L', -1), ('R', 1)):
        for fila, z in zip(('F', 'B'), EJE_Z):
            nodo = bpy.data.objects.new(f'wheel_{lado}{fila}', malla_rueda)
            bpy.context.collection.objects.link(nodo)
            nodo.parent = nodo_casco
            nodo.location = blender((s * EJE_X, RADIO_RUEDA, z))
    if variante:
        torreta_p, arma_p, bocas, misil_p, pivote_arma = variante()
        torreta = torreta_p.objeto('turret_yaw', material)
        torreta.parent = raiz
        torreta.location = blender(PIVOTE_TORRETA)
        arma = arma_p.objeto('gun_pitch', material)
        arma.parent = torreta
        arma.location = blender(pivote_arma)
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


construir('patrulla', None)
construir('patrulla-ametralladora', con_ametralladora)
construir('patrulla-misil', con_un_misil)
construir('patrulla-misiles', con_misiles)
