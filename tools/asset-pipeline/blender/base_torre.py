# La base común de las torres (ADR 003): octágono de arena, refuerzos oscuros y sacos.
import math
import random

from pieza import Pieza, anillo

PIVOTE_TORRE = 0.335


def construir_base():
    p = Pieza()
    # Zócalo oscuro, cuerpo de arena en talud y cubierta.
    p.loft([anillo(0.5, 0), anillo(0.5, 0.03), anillo(0.47, 0.055)], 'metalOscuro', 0.006)
    p.loft([anillo(0.455, 0.05), anillo(0.4, 0.2), anillo(0.385, 0.215)], 'arena', 0.004, angulo=12)
    p.loft([anillo(0.385, 0.214), anillo(0.2, 0.245)], 'arena', 0.0)
    p.loft([anillo(0.392, 0.212), anillo(0.392, 0.222), anillo(0.368, 0.226), anillo(0.368, 0.214)], 'metalOscuro', 0.002)
    for i in range(8):
        a = (i + 1) / 8 * math.tau
        rad = (math.sin(a), math.cos(a))
        tan = (math.cos(a), -math.sin(a))
        def placa(afuera, media, y0, y1):
            apotema = lambda y: (0.455 + (0.4 - 0.455) * (y - 0.05) / 0.15) * math.cos(math.pi / 8) + afuera
            esquinas = ((-media, y0), (media, y0), (media * 0.9, y1), (-media * 0.9, y1))
            return [(rad[0] * apotema(y) + tan[0] * lado, y, rad[1] * apotema(y) + tan[1] * lado) for lado, y in esquinas]
        p.loft([placa(-0.01, 0.105, 0.075, 0.185), placa(0.006, 0.105, 0.075, 0.185)], 'arenaClara', 0.004, angulo=20)
    # Cuello donde gira la torreta.
    p.loft([anillo(0.2, 0.245), anillo(0.2, 0.275), anillo(0.15, 0.3), anillo(0.15, PIVOTE_TORRE)], 'metalOscuro', 0.005)
    # Refuerzos oscuros en cada esquina, siguiendo el talud, con su pie.
    for i in range(8):
        a = math.pi / 8 + i / 8 * math.tau
        rad = (math.sin(a), math.cos(a))
        tan = (math.cos(a), -math.sin(a))
        pendiente = (0.15, 0.055)
        largo = math.hypot(*pendiente)
        normal = (pendiente[0] / largo, pendiente[1] / largo)
        def punto(r, y, lado, afuera):
            rr = r + normal[0] * afuera
            yy = y + normal[1] * afuera
            return (rad[0] * rr + tan[0] * lado, yy, rad[1] * rr + tan[1] * lado)
        ancho = 0.038
        def seccion(r, y):
            return [punto(r, y, -ancho, 0.016), punto(r, y, ancho, 0.016), punto(r, y, ancho, -0.02), punto(r, y, -ancho, -0.02)]
        p.loft([seccion(0.47, 0.03), seccion(0.392, 0.225)], 'metalOscuro', 0.006)
        pie = lambda r, y, s: [(rad[0] * r + tan[0] * lado, y, rad[1] * r + tan[1] * lado) for lado, r in ((-s, r + s), (s, r + s), (s, r - s), (-s, r - s))]
        p.loft([pie(0.475, 0, 0.05), pie(0.475, 0.05, 0.05), pie(0.47, 0.075, 0.035)], 'metalOscuro', 0.006)
    # Sacos de arena: tres montones sobre la cubierta.
    azar = random.Random(7)
    def saco(angulo, radio, y, largo=0.145, alto=0.046, fondo=0.085):
        a = angulo + azar.uniform(-0.03, 0.03)
        rad = (math.sin(a), math.cos(a))
        tan = (math.cos(a), -math.sin(a))
        def fila(yy, s):
            return [(rad[0] * (radio + fondo * s * f) + tan[0] * largo * s * t, yy, rad[1] * (radio + fondo * s * f) + tan[1] * largo * s * t) for t, f in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5))]
        p.loft([fila(y, 0.86), fila(y + alto * 0.5, 1.0), fila(y + alto, 0.8)], 'arenaClara', 0.01, segmentos=2, angulo=8)
    for angulo in (0.0, 2.15, -2.15):
        paso = 0.155 / 0.3
        saco(angulo - paso / 2, 0.3, 0.226)
        saco(angulo + paso / 2, 0.3, 0.226)
        saco(angulo, 0.3, 0.226 + 0.043, largo=0.15)
    return p
