# El tanque pesado (ADR 003): bajo y ancho, torreta en cuña y cañón largo. La oruga es una banda abierta:
# las ruedas se ven bajo los faldones y son nodos propios, para que giren. Los puntos `defensa_NN` de la
# torreta son donde el juego monta la defensa activa. Se corre con npm run assets:code.
# Coordenadas del juego: x derecha, y arriba, z adelante.
import math
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pieza import Pieza, blender, bpy, exportar, limpiar, material_paleta, vacio

PIVOTE_TORRETA = (0, 0.214, -0.04)
PIVOTE_CANON = (0, 0.058, 0.25)  # respecto de la torreta
LARGO_TUBO = 0.53
RADIO_RUEDA = 0.058
Y_RUEDA = 0.074
X_ORUGA = (0.205, 0.305)  # de adentro hacia afuera, en cada lado
RUEDAS_Z = [0.33 - i * 0.11 for i in range(7)]
TENSORA = (0.43, 0.115, 0.046)  # z, y, radio: la rueda de adelante
MOTRIZ = (-0.432, 0.122, 0.052)  # la de atrás, más alta
# Montajes de la defensa activa, en coordenadas de la torreta: a los lados y atrás.
DEFENSA = [(0.218, 0.085, -0.06), (-0.218, 0.085, -0.06), (0, 0.112, -0.205)]


def contorno_oruga():
    """El recorrido de la oruga en (z, y), en sentido horario visto desde la derecha."""
    puntos = []
    abajo = RUEDAS_Z[-1] - 0.02, RUEDAS_Z[0] + 0.02
    # Tramo de abajo, apoyado en el suelo.
    for i in range(9):
        puntos.append((abajo[0] + (abajo[1] - abajo[0]) * i / 8, 0.0))
    # Vuelta por la tensora, adelante.
    z, y, r = TENSORA
    r += 0.02
    for i in range(1, 7):
        a = -math.pi / 2 + math.pi * i / 6
        puntos.append((z + r * math.cos(a) * 0.95, y + r * math.sin(a)))
    # Tramo de arriba, de vuelta, apoyado en los rodillos.
    arriba = y + r
    for i in range(1, 8):
        puntos.append((z - (z - MOTRIZ[0]) * i / 8, arriba - 0.004 * math.sin(math.pi * i / 8)))
    # Vuelta por la motriz, atrás.
    z, y, r = MOTRIZ
    r += 0.02
    for i in range(0, 7):
        a = math.pi / 2 + math.pi * i / 6
        puntos.append((z + r * math.cos(a) * 0.95, y + r * math.sin(a)))
    return puntos


def oruga(p, s):
    """Una banda de eslabones alternados alrededor de las ruedas, abierta a los lados."""
    contorno = contorno_oruga()
    centro = sum(z for z, _ in contorno) / len(contorno), sum(y for _, y in contorno) / len(contorno)
    x0, x1 = (s * X_ORUGA[0], s * X_ORUGA[1])
    for i, (a, b) in enumerate(zip(contorno, contorno[1:] + contorno[:1])):
        hacia = lambda q: (q[0] + (centro[0] - q[0]) * 0.09, q[1] + (centro[1] - q[1]) * 0.09)
        adentro_a, adentro_b = hacia(a), hacia(b)
        grosor = [(a[0], a[1]), (b[0], b[1]), adentro_b, adentro_a]
        p.extruir_x(grosor, min(x0, x1), max(x0, x1), 'neumatico' if i % 2 else 'metalOscuro')
    # Guías en el centro de la banda, que asoman entre las ruedas.
    for z in RUEDAS_Z[:-1]:
        p.caja((s * 0.255, 0.03, z - 0.055), 0.012, 0.02, 0.02, 'metal')


def casco():
    p = Pieza()
    for s in (-1, 1):
        oruga(p, s)
    # Cuerpo bajo: glacis largo e inclinado, cubierta del motor casi plana.
    lateral = [(0.5, 0.135), (0.3, 0.198), (-0.38, 0.212), (-0.495, 0.195), (-0.5, 0.1), (-0.42, 0.06), (0.43, 0.06), (0.505, 0.11)]
    p.extruir_x(lateral, -0.2, 0.2, 'arena', 0.006, angulo=8)
    # Guardabarros sobre la oruga, de punta a punta.
    for s in (-1, 1):
        guardabarros = [(0.5, 0.2), (0.485, 0.215), (-0.485, 0.215), (-0.5, 0.2)]
        p.extruir_x([(z, y) for z, y in guardabarros] + [(-0.5, 0.19), (0.5, 0.19)], s * 0.198, s * 0.318, 'arena', 0.003, angulo=15)
        # Faldones: cubren solo el tramo de arriba; las ruedas se ven debajo. Placas de blindaje marcadas.
        faldon = [(0.49, 0.198), (0.47, 0.16), (0.36, 0.13), (-0.44, 0.13), (-0.5, 0.15), (-0.5, 0.198)]
        p.extruir_x(faldon, s * 0.312, s * 0.326, 'arena', 0.003, angulo=15)
        for i in range(6):
            z = 0.3 - i * 0.135
            p.caja((s * 0.328, 0.165, z), 0.004, 0.05, 0.118, 'arenaClara', 0.0015)
        # Luces y ganchos adelante, caja de herramientas atrás.
        p.caja((s * 0.15, 0.178, 0.43), 0.04, 0.02, 0.026, 'metalOscuro', 0.003)
        p.caja((s * 0.12, 0.09, 0.485), 0.03, 0.03, 0.025, 'metalOscuro', 0.004)
        p.caja((s * 0.25, 0.232, -0.38), 0.1, 0.03, 0.16, 'arenaClara', 0.004)
        # Tubos de escape a los lados de atrás.
        p.cilindro_x(s * 0.14, s * 0.2, 0.15, -0.475, 0.016, 'metalOscuro', lados=6)
    # Motor: dos rejillas grandes, con lamas.
    for s in (-1, 1):
        p.caja((s * 0.095, 0.214, -0.38), 0.14, 0.006, 0.17, 'neumatico', 0.001)
        for i in range(7):
            p.caja((s * 0.095, 0.218, -0.31 - i * 0.024), 0.13, 0.004, 0.01, 'metalOscuro')
    # Escotilla del conductor, con sus periscopios, y el bidón de atrás.
    p.cilindro_y(0, 0.33, 0.19, 0.212, 0.04, 'metalOscuro', bisel=0.003)
    for x in (-0.03, 0, 0.03):
        p.caja((x, 0.205, 0.37), 0.018, 0.012, 0.01, 'neumatico')
    p.cilindro_x(-0.15, 0.15, 0.13, -0.47, 0.03, 'arenaClara', lados=8, bisel=0.003)
    # Aro de la torreta.
    p.cilindro_y(0, PIVOTE_TORRETA[2], 0.2, PIVOTE_TORRETA[1] + 0.008, 0.2, 'metalOscuro', lados=16, bisel=0.002)
    return p


def rueda(radio):
    """Rueda de camino de disco, con su llanta de goma y el cubo; el eje en x."""
    r = Pieza()
    medio = 0.04
    r.cilindro_x(-medio, medio, 0, 0, radio, 'neumatico', lados=12, bisel=0.004)
    for s in (-1, 1):
        r.cilindro_x(s * medio * 0.9, s * (medio + 0.004), 0, 0, radio * 0.8, 'metal', lados=12, bisel=0.003)
        r.cilindro_x(s * (medio + 0.002), s * (medio + 0.01), 0, 0, radio * 0.32, 'metalOscuro', lados=6, bisel=0.002)
    return r


def motriz(radio):
    """La rueda motriz, con dientes."""
    r = Pieza()
    lados = 20
    fila = lambda x: [(x, (radio if i % 2 == 0 else radio * 0.84) * math.cos(i / lados * math.tau), (radio if i % 2 == 0 else radio * 0.84) * math.sin(i / lados * math.tau)) for i in range(lados)]
    r.loft([fila(-0.035), fila(0.035)], 'metalOscuro')
    for s in (-1, 1):
        r.cilindro_x(s * 0.03, s * 0.045, 0, 0, radio * 0.45, 'metal', lados=8, bisel=0.003)
    return r


def torreta():
    t = Pieza()
    # Planta en cuña ancha y baja, con el frente en punta de flecha.
    borde = [(-0.07, 0.33), (0.07, 0.33), (0.225, 0.16), (0.245, -0.08), (0.205, -0.25), (-0.205, -0.25), (-0.245, -0.08), (-0.225, 0.16)]
    planta = lambda y, e: [(x * e, y, z * e) for x, z in borde]
    t.loft([planta(0.0, 0.92), planta(0.025, 1.0), planta(0.088, 0.98), planta(0.11, 0.86)], 'arena', 0.006, angulo=10)
    # Placas de blindaje añadido al frente, a cada lado del cañón.
    for s in (-1, 1):
        t.placa([(s * 0.085, 0.02, 0.31), (s * 0.21, 0.02, 0.165), (s * 0.2, 0.09, 0.15), (s * 0.08, 0.09, 0.295)][::s], 0.012, 'arenaClara', 0.003)
    # Cesta de atrás con su carga.
    t.caja((0, 0.04, -0.29), 0.36, 0.01, 0.08, 'metalOscuro', 0.002)
    for s in (-1, 1):
        t.caja((s * 0.18, 0.07, -0.32), 0.01, 0.06, 0.01, 'metalOscuro')
        t.caja((s * 0.085, 0.07, -0.29), 0.11, 0.05, 0.055, 'arenaClara', 0.005)
        # Lanzahumos.
        for i in range(4):
            t.cilindro_z(s * (0.208 + i * 0.006), 0.07 + i * 0.012, 0.12 - i * 0.012, 0.15 - i * 0.012, 0.008, 'metalOscuro', lados=6)
    # Cúpula del comandante, con su mira, y escotilla del cargador.
    t.cilindro_y(0.09, -0.06, 0.105, 0.135, 0.052, 'metalOscuro', bisel=0.004)
    t.cilindro_y(0.09, -0.06, 0.135, 0.145, 0.036, 'metal', bisel=0.002)
    t.caja((0.09, 0.15, -0.02), 0.045, 0.03, 0.035, 'metalOscuro', 0.004)
    t.caja((0.09, 0.152, 0.0), 0.035, 0.016, 0.004, 'neumatico')
    t.cilindro_y(-0.095, -0.07, 0.105, 0.118, 0.045, 'metalOscuro', bisel=0.003)
    # Ametralladora del cargador.
    t.tubo((-0.095, 0.135, -0.05), (-0.095, 0.14, 0.09), 0.006, 0.006, 'metalOscuro', lados=5)
    t.caja((-0.095, 0.132, -0.06), 0.02, 0.025, 0.04, 'metalOscuro', 0.002)
    # Mira principal y antenas.
    t.caja((0.13, 0.11, 0.155), 0.07, 0.03, 0.07, 'arenaClara', 0.004)
    t.caja((0.13, 0.112, 0.191), 0.05, 0.016, 0.004, 'neumatico')
    for s in (-1, 1):
        t.cilindro_y(s * 0.15, -0.21, 0.1, 0.3, 0.0035, 'metalOscuro', lados=5)
    return t


def canon():
    g = Pieza()
    # Mantelete en cuña, que sube y baja con el cañón.
    frente = [(0.09, 0.045), (0.09, -0.035), (-0.02, -0.05), (-0.02, 0.06)]
    g.extruir_x(frente, -0.07, 0.07, 'arena', 0.006, angulo=15)
    g.cilindro_z(0, 0, 0.085, 0.11, 0.028, 'metalOscuro', lados=10, bisel=0.003)
    return g


def tubo():
    b = Pieza()
    secciones = [(0.019, 0.08), (0.019, 0.25), (0.026, 0.262), (0.026, 0.325), (0.019, 0.338), (0.0165, 0.35), (0.0165, LARGO_TUBO - 0.02), (0.02, LARGO_TUBO - 0.015), (0.02, LARGO_TUBO), (0.011, LARGO_TUBO + 0.002)]
    lados = 10
    b.loft([[(r * math.cos(i / lados * math.tau), r * math.sin(i / lados * math.tau), z) for i in range(lados)] for r, z in secciones], 'metalOscuro')
    return b


limpiar()
material = material_paleta()
raiz = vacio('unit_root')
nodo_casco = vacio('hull', raiz)
casco().objeto('casco', material).parent = nodo_casco


def ruedas(malla, nombre, posiciones):
    for lado, s in (('L', -1), ('R', 1)):
        for i, (z, y) in enumerate(posiciones):
            objeto = bpy.data.objects.new(f'wheel_{lado}{nombre}{i + 1}', malla)
            bpy.context.collection.objects.link(objeto)
            objeto.parent = nodo_casco
            objeto.location = blender((s * 0.255, y, z))


def malla(pieza):
    objeto = pieza.objeto('tmp', material)
    datos = objeto.data
    bpy.data.objects.remove(objeto)
    return datos


ruedas(malla(rueda(RADIO_RUEDA)), '', [(z, Y_RUEDA) for z in RUEDAS_Z])
ruedas(malla(rueda(TENSORA[2])), 'T', [(TENSORA[0], TENSORA[1])])
ruedas(malla(motriz(MOTRIZ[2])), 'M', [(MOTRIZ[0], MOTRIZ[1])])
nodo_torreta = torreta().objeto('turret_yaw', material)
nodo_torreta.parent = raiz
nodo_torreta.location = blender(PIVOTE_TORRETA)
for i, punto in enumerate(DEFENSA):
    vacio(f'defensa_{i + 1:02d}', nodo_torreta, punto)
nodo_canon = canon().objeto('gun_pitch', material)
nodo_canon.parent = nodo_torreta
nodo_canon.location = blender(PIVOTE_CANON)
tubo().objeto('barrel', material).parent = nodo_canon
vacio('muzzle_01', nodo_canon, (0, 0, LARGO_TUBO))
exportar('tank-heavy')
