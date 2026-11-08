# El 8x8 y el camión de tropas (ADR 003), con los restos del camión. Las ruedas son nodos propios,
# para que giren. Se corre con npm run assets:code. Coordenadas del juego: x derecha, y arriba, z adelante.
import math
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pieza import Pieza, blender, bpy, exportar, limpiar, material_paleta, vacio


def rueda(radio, ancho, reventada=False):
    """Neumático de tacos con su llanta; el eje en x. Reventada, queda chata y sin tacos."""
    p = Pieza()
    lados = 16
    afuera = radio * (0.9 if reventada else 1)

    def fila(x, a, b):
        return [(x, (a if i % 2 == 0 else b) * math.cos(i / lados * math.tau), (a if i % 2 == 0 else b) * math.sin(i / lados * math.tau)) for i in range(lados)]

    medio = ancho / 2
    tacos = afuera * (1 if reventada else 0.9)
    p.loft([fila(-medio, afuera * 0.82, afuera * 0.82), fila(-medio * 0.7, afuera, tacos), fila(medio * 0.7, afuera, tacos), fila(medio, afuera * 0.82, afuera * 0.82)], 'neumatico')
    for s in (-1, 1):
        p.cilindro_x(s * medio * 0.8, s * (medio + 0.006), 0, 0, radio * 0.52, 'metalOscuro' if reventada else 'metal', lados=8, bisel=0.003)
        p.cilindro_x(s * (medio + 0.004), s * (medio + 0.011), 0, 0, radio * 0.2, 'metalOscuro', lados=6, bisel=0.002)
    return p


def montar_ruedas(casco, material, radio, ancho, ejes, x, alto=None, reventada=False):
    datos = rueda(radio, ancho, reventada).objeto('rueda_tmp', material).data
    bpy.data.objects.remove(bpy.data.objects['rueda_tmp'])
    for lado, s in (('L', -1), ('R', 1)):
        for i, z in enumerate(ejes):
            nodo = bpy.data.objects.new(f'wheel_{lado}{i + 1}', datos)
            bpy.context.collection.objects.link(nodo)
            nodo.parent = casco
            nodo.location = blender((s * x, radio if alto is None else alto, z))


# ---------- 8x8 ----------
APC_EJES = [0.335, 0.135, -0.115, -0.315]
APC_RUEDA = 0.088
APC_TECHO = 0.31
APC_TORRETA = (0, APC_TECHO, -0.05)


def apc_casco():
    p = Pieza()
    # Cuerpo: nariz en cuña con el glacis largo, techo plano y cola recta.
    lateral = [(0.5, 0.135), (0.4, 0.262), (0.27, APC_TECHO - 0.005), (-0.46, APC_TECHO), (-0.5, 0.29), (-0.5, 0.13), (-0.44, 0.085), (0.42, 0.085)]
    p.extruir_x(lateral, -0.2, 0.2, 'arena', 0.006, angulo=8)
    # Flancos sobre las ruedas, inclinados hacia adentro arriba.
    for s in (-1, 1):
        flanco = [(0.43, 0.255), (0.46, 0.2), (0.44, 0.175), (-0.47, 0.175), (-0.49, 0.2), (-0.48, 0.29), (0.3, 0.29)]
        p.extruir_x(flanco, s * 0.2, s * 0.285, 'arena', 0.005, angulo=12)
        # Placas de blindaje añadido y cajas de herramientas.
        for i in range(4):
            p.caja((s * 0.288, 0.232, 0.3 - i * 0.22), 0.006, 0.07, 0.19, 'arenaClara', 0.002)
        p.caja((s * 0.24, APC_TECHO + 0.018, -0.33), 0.08, 0.035, 0.18, 'arenaOscura', 0.004)
        # Luces adelante y escapes al costado.
        p.caja((s * 0.15, 0.215, 0.445), 0.04, 0.025, 0.02, 'metalOscuro', 0.003)
        p.caja((s * 0.15, 0.218, 0.457), 0.026, 0.014, 0.004, 'luzBlanca')
    p.cilindro_x(0.285, 0.3, 0.255, -0.2, 0.014, 'metalOscuro', lados=6)
    # Tabla rompeolas en el glacis y gancho.
    p.placa([(-0.17, 0.2, 0.47), (0.17, 0.2, 0.47), (0.17, 0.24, 0.43), (-0.17, 0.24, 0.43)], 0.008, 'arenaClara', 0.002)
    p.caja((0, 0.11, 0.5), 0.06, 0.03, 0.02, 'metalOscuro', 0.004)
    # Escotilla del conductor con periscopios, del jefe de tropa y del motor.
    p.cilindro_y(-0.12, 0.27, APC_TECHO - 0.01, APC_TECHO + 0.012, 0.042, 'metalOscuro', bisel=0.003)
    for x in (-0.15, -0.12, -0.09):
        p.caja((x, APC_TECHO + 0.006, 0.31), 0.02, 0.014, 0.012, 'neumatico')
    for z in (-0.25, -0.4):
        p.caja((0, APC_TECHO + 0.005, z), 0.14, 0.012, 0.1, 'metalOscuro', 0.003)
    p.caja((0.13, APC_TECHO + 0.004, 0.24), 0.1, 0.01, 0.12, 'neumatico', 0.001)  # rejilla del motor
    # Rampa de atrás.
    p.placa([(0.16, 0.12, -0.5), (-0.16, 0.12, -0.5), (-0.16, 0.29, -0.5), (0.16, 0.29, -0.5)], 0.01, 'arenaOscura', 0.003)
    # Aro de la torreta.
    p.cilindro_y(0, APC_TORRETA[2], APC_TECHO - 0.005, APC_TECHO + 0.008, 0.11, 'metalOscuro', lados=14, bisel=0.002)
    return p


def apc_torreta():
    t = Pieza()
    borde = [(-0.05, 0.13), (0.05, 0.13), (0.11, 0.06), (0.115, -0.07), (0.09, -0.12), (-0.09, -0.12), (-0.115, -0.07), (-0.11, 0.06)]
    planta = lambda y, e: [(x * e, y, z * e) for x, z in borde]
    t.loft([planta(0.0, 0.95), planta(0.02, 1.0), planta(0.07, 0.88)], 'arena', 0.005, angulo=10)
    # Mira, lanzahumos y antena.
    t.caja((-0.075, 0.085, 0.02), 0.04, 0.03, 0.05, 'arenaClara', 0.004)
    t.caja((-0.075, 0.087, 0.046), 0.03, 0.016, 0.004, 'neumatico')
    for s in (-1, 1):
        for i in range(2):
            t.cilindro_z(s * (0.1 + i * 0.004), 0.04 + i * 0.014, 0.04, 0.07, 0.008, 'metalOscuro', lados=6)
    t.cilindro_y(0.07, -0.1, 0.06, 0.24, 0.0035, 'metalOscuro', lados=5)
    return t


def apc_canon():
    g = Pieza()
    g.extruir_x([(0.03, 0.03), (0.03, -0.025), (-0.03, -0.03), (-0.03, 0.035)], -0.045, 0.045, 'arena', 0.004, angulo=15)
    g.cilindro_z(0, 0, 0.03, 0.12, 0.018, 'metalOscuro', lados=8, bisel=0.002)
    g.cilindro_z(0, 0, 0.12, 0.33, 0.01, 'metalOscuro', lados=8)
    g.cilindro_z(0, 0, 0.31, 0.345, 0.015, 'metal', lados=8, bisel=0.002)
    return g


def construir_apc():
    limpiar()
    material = material_paleta()
    raiz = vacio('unit_root')
    casco = vacio('hull', raiz)
    apc_casco().objeto('casco', material).parent = casco
    montar_ruedas(casco, material, APC_RUEDA, 0.07, APC_EJES, 0.24)
    torreta = apc_torreta().objeto('turret_yaw', material)
    torreta.parent = raiz
    torreta.location = blender(APC_TORRETA)
    canon = apc_canon().objeto('gun_pitch', material)
    canon.parent = torreta
    canon.location = blender((0, 0.04, 0.12))
    vacio('muzzle_01', canon, (0, 0, 0.345))
    exportar('apc-8x8')


# ---------- Camión ----------
CAMION_EJES = [0.315, -0.155, -0.34]
CAMION_RUEDA = 0.095


def camion(restos):
    """Camión clásico: parrilla grande, capó corto, cabina de dos ventanas y caja con lona alta.
    En `restos`, quemado: sin lona ni vidrios, la cabina hundida y la caja rota."""
    p = Pieza()
    pintura, oscura = ('metalOscuro', 'neumatico') if restos else ('arena', 'arenaOscura')
    baja = 0.025 if restos else 0  # sobre las ruedas reventadas
    y = lambda v: v - baja
    vidrio = 'neumatico' if restos else 'vidrio'
    # Chasis negro y parachoques con ganchos.
    for s in (-1, 1):
        p.caja((s * 0.11, y(0.14), -0.05), 0.045, 0.045, 0.88, 'metalOscuro', 0.003)
    p.caja((0, y(0.15), 0.475), 0.48, 0.065, 0.05, 'metalOscuro', 0.006)
    for s in (-1, 1):
        p.caja((s * 0.11, y(0.105), 0.488), 0.03, 0.025, 0.02, 'metal', 0.004)
    # Capó corto, con la parrilla negra grande de barras horizontales.
    capo = [(0.455, y(0.18)), (0.455, y(0.345)), (0.435, y(0.362)), (0.27, y(0.37)), (0.27, y(0.18))]
    p.extruir_x(capo, -0.165, 0.165, pintura, 0.007, angulo=10)
    p.caja((0, y(0.26), 0.457), 0.24, 0.14, 0.008, 'metalOscuro', 0.002)
    for i in range(5):
        p.caja((0, y(0.205 + i * 0.027), 0.462), 0.22, 0.008, 0.006, 'neumatico')
    for s in (-1, 1):
        # Guardabarros de adelante, cuadrados, con los faros.
        guarda = [(0.455, y(0.19)), (0.455, y(0.29)), (0.43, y(0.305)), (0.19, y(0.305)), (0.17, y(0.29)), (0.17, y(0.19)), (0.2, y(0.19)), (0.24, y(0.265)), (0.395, y(0.265)), (0.43, y(0.19))]
        p.extruir_x(guarda, s * 0.16, s * 0.275, pintura, 0.005, angulo=12)
        p.caja((s * 0.21, y(0.25), 0.457), 0.045, 0.035, 0.008, 'metalOscuro' if restos else 'luzBlanca', 0.002)
    # Cabina; destruida, con el techo hundido.
    techo = 0.46 if restos else 0.52
    cabina = [(0.27, y(0.18)), (0.27, y(0.375)), (0.245, y(techo)), (0.05, y(techo)), (0.05, y(0.18))]
    p.extruir_x(cabina, -0.205, 0.205, pintura, 0.007, angulo=8)
    frente = lambda v: 0.27 - (v - 0.375) / (techo - 0.375) * 0.025
    for x0, x1 in ((-0.18, -0.012), (0.012, 0.18)):
        a, b = 0.39, techo - 0.025
        p.placa([(x0, y(a), frente(a)), (x1, y(a), frente(a)), (x1, y(b), frente(b)), (x0, y(b), frente(b))], 0.003, vidrio)
    for s in (-1, 1):
        esquinas = [(s * 0.207, y(0.38), 0.235), (s * 0.207, y(0.38), 0.1), (s * 0.207, y(techo - 0.03), 0.1), (s * 0.207, y(techo - 0.03), 0.235)]
        p.placa(esquinas if s > 0 else esquinas[::-1], 0.003, vidrio)
        p.caja((s * 0.209, y(0.28), 0.25), 0.004, 0.19, 0.006, 'metalOscuro')  # puerta
        p.caja((s * 0.21, y(0.33), 0.08), 0.006, 0.012, 0.03, 'metalOscuro')
        if not restos:
            p.caja((s * 0.245, y(0.42), 0.26), 0.014, 0.075, 0.04, 'metalOscuro', 0.003)  # espejo
            p.caja((s * 0.222, y(0.4), 0.26), 0.04, 0.01, 0.01, 'metalOscuro')
            p.caja((s * 0.07, y(techo + 0.012), 0.2), 0.05, 0.022, 0.04, 'metalOscuro', 0.003)  # luces del techo
        # Peldaño y caja de baterías bajo la puerta, tanque de combustible detrás.
        p.caja((s * 0.2, y(0.155), 0.15), 0.07, 0.025, 0.08, 'metalOscuro', 0.003)
        p.caja((s * 0.185, y(0.2), 0.0), 0.08, 0.09, 0.13, 'metalOscuro', 0.006)
    # Caja: piso, barandas con sus postes y guardabarros de atrás.
    p.caja((0, y(0.205), -0.235), 0.44, 0.025, 0.53, oscura, 0.003)
    for s in (-1, 1):
        if restos:
            p.caja((s * 0.215, y(0.245), -0.32 if s > 0 else -0.15), 0.015, 0.06, 0.26, pintura, 0.002)
        else:
            p.caja((s * 0.216, y(0.26), -0.235), 0.012, 0.085, 0.53, pintura, 0.003)
            for i in range(5):
                p.caja((s * 0.224, y(0.26), 0.01 - i * 0.12), 0.006, 0.09, 0.012, 'metalOscuro')
        arco = [(-0.07, y(0.2)), (-0.1, y(0.235)), (-0.43, y(0.235)), (-0.46, y(0.2))]
        p.extruir_x(arco, s * 0.2, s * 0.27, 'metalOscuro', 0.003, angulo=12)
    p.caja((0, y(0.26), -0.495), 0.44, 0.085, 0.012, pintura, 0.002)
    if restos:
        # Solo quedan arcos torcidos.
        for i, z in enumerate((0.0, -0.32, -0.48)):
            inclinado = 0.05 * (i - 1)
            for s in (-1, 1):
                p.tubo((s * 0.21, y(0.3), z), (s * 0.19, y(0.48), z + inclinado), 0.007, 0.007, 'metalOscuro', lados=4)
            p.tubo((-0.19, y(0.48), z + inclinado), (0.19, y(0.48), z + inclinado), 0.007, 0.007, 'metalOscuro', lados=4)
    else:
        # Lona alta y cuadrada, más alta que la cabina, en tres paños.
        lona = lambda z: [(-0.222, 0.298, z), (-0.222, 0.51, z), (-0.19, 0.55, z), (0.19, 0.55, z), (0.222, 0.51, z), (0.222, 0.298, z)]
        p.loft([lona(0.035), lona(-0.5)], 'arena', 0.008, angulo=15)
        for z in (0.035, -0.145, -0.325, -0.5):
            p.loft([[(x * 1.025, yy + (0.006 if yy > 0.5 else 0), z - 0.008) for x, yy, _ in lona(0)], [(x * 1.025, yy + (0.006 if yy > 0.5 else 0), z + 0.008) for x, yy, _ in lona(0)]], 'arenaOscura', tapas=False)
        # Amarras negras abajo.
        for s in (-1, 1):
            for i in range(6):
                p.caja((s * 0.226, 0.31, -0.02 - i * 0.09), 0.006, 0.02, 0.012, 'metalOscuro')
    return p


def construir_camion(nombre, restos):
    limpiar()
    material = material_paleta()
    raiz = vacio('unit_root')
    casco = vacio('hull', raiz)
    camion(restos).objeto('casco', material).parent = casco
    montar_ruedas(casco, material, CAMION_RUEDA, 0.08, CAMION_EJES, 0.22, alto=CAMION_RUEDA * 0.9 if restos else None, reventada=restos)
    exportar(nombre)


construir_apc()
construir_camion('camion-tropas', False)
construir_camion('camion-tropas-destruido', True)
