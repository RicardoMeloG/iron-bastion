# Herramientas para modelar por código (ADR 003): primitivas con bisel, un color por cara y los nodos
# del estándar. Coordenadas del juego: x derecha, y arriba, z adelante. Cada guion recibe, después de
# "--", la carpeta de salida y la paleta en JSON (tools/asset-pipeline/build-code-models.mjs).
import json
import math
import sys

import bmesh
import bpy
from mathutils import Vector

SALIDA, _paleta = sys.argv[sys.argv.index('--') + 1:][:2]
PALETA = json.loads(_paleta)


def lineal(nombre):
    salida = []
    for corrimiento in (16, 8, 0):
        v = ((PALETA[nombre] >> corrimiento) & 255) / 255
        salida.append(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)
    return salida + [1.0]


def blender(p):
    return (p[0], -p[2], p[1])


class Pieza:
    """Una malla con un color por cara, armada con primitivas biseladas."""

    def __init__(self):
        self.vertices = []
        self.caras = []
        self.colores = []

    def agregar(self, bm, color, bisel=0.0, segmentos=1, angulo=25):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bisel > 0:
            aristas = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(angulo)]
            bmesh.ops.bevel(bm, geom=aristas, offset=bisel, offset_type='OFFSET', segments=segmentos, profile=0.5, affect='EDGES', clamp_overlap=True)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        base = len(self.vertices)
        bm.verts.index_update()
        self.vertices.extend(tuple(v.co) for v in bm.verts)
        for cara in bm.faces:
            self.caras.append(tuple(base + v.index for v in cara.verts))
            self.colores.append(color)
        bm.free()

    def loft(self, anillos, color, bisel=0.0, segmentos=1, angulo=25, tapas=True):
        bm = bmesh.new()
        filas = [[bm.verts.new(blender(p)) for p in anillo] for anillo in anillos]
        for a, b in zip(filas, filas[1:]):
            n = len(a)
            for i in range(n):
                bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
        if tapas:
            bm.faces.new(filas[0])
            bm.faces.new(filas[-1])
        self.agregar(bm, color, bisel, segmentos, angulo)

    def caja(self, centro, ancho, alto, fondo, color, bisel=0.0, **extra):
        cx, cy, cz = centro
        x, y, z = ancho / 2, alto / 2, fondo / 2
        anillo = lambda yy: [(cx - x, yy, cz - z), (cx + x, yy, cz - z), (cx + x, yy, cz + z), (cx - x, yy, cz + z)]
        self.loft([anillo(cy - y), anillo(cy + y)], color, bisel, **extra)

    def extruir_z(self, perfil, z0, z1, color, bisel=0.0, **extra):
        """Perfil en (x, y) extruido a lo largo de z."""
        self.loft([[(x, y, z0) for x, y in perfil], [(x, y, z1) for x, y in perfil]], color, bisel, **extra)

    def extruir_x(self, perfil, x0, x1, color, bisel=0.0, **extra):
        """Perfil en (z, y) extruido a lo largo de x."""
        self.loft([[(x0, y, z) for z, y in perfil], [(x1, y, z) for z, y in perfil]], color, bisel, **extra)

    def cilindro_x(self, x0, x1, y, z, radio, color, lados=8, bisel=0.0):
        anillo = lambda x: [(x, y + radio * math.cos(a), z + radio * math.sin(a)) for a in [i / lados * math.tau for i in range(lados)]]
        self.loft([anillo(x0), anillo(x1)], color, bisel)

    def cilindro_z(self, x, y, z0, z1, radio, color, lados=8, bisel=0.0, giro=0.0):
        anillo = lambda z: [(x + radio * math.cos(a + giro), y + radio * math.sin(a + giro), z) for a in [i / lados * math.tau for i in range(lados)]]
        self.loft([anillo(z0), anillo(z1)], color, bisel)

    def cilindro_y(self, x, z, y0, y1, radio, color, lados=8, bisel=0.0):
        self.loft([self.circulo(x, y0, z, radio, lados), self.circulo(x, y1, z, radio, lados)], color, bisel)

    @staticmethod
    def circulo(x, y, z, radio, lados=8):
        """Anillo horizontal, con una cara de frente."""
        fase = math.pi / lados
        return [(x + radio * math.sin(fase + i / lados * math.tau), y, z + radio * math.cos(fase + i / lados * math.tau)) for i in range(lados)]

    def tubo(self, p0, p1, r0, r1, color, lados=8, bisel=0.0):
        """Tubo facetado entre dos puntos cualesquiera."""
        a, b = Vector(p0), Vector(p1)
        d = (b - a).normalized()
        u = d.cross(Vector((0, 1, 0)))
        if u.length < 0.01:
            u = d.cross(Vector((1, 0, 0)))
        u.normalize()
        v = d.cross(u)
        fila = lambda c, r: [tuple(c + (u * math.cos(i / lados * math.tau) + v * math.sin(i / lados * math.tau)) * r) for i in range(lados)]
        self.loft([fila(a, r0), fila(b, r1)], color, bisel)

    def placa(self, esquinas, grosor, color, bisel=0.0):
        """Una placa sobre una cara: `esquinas` en sentido antihorario visto desde afuera."""
        a, b, c = (Vector(p) for p in esquinas[:3])
        n = (b - a).cross(c - a).normalized()
        self.loft([list(esquinas), [tuple(Vector(p) + n * grosor) for p in esquinas]], color, bisel)

    def ajustar_planta(self, medio):
        """Escala en planta para que la pieza mida `medio` desde el centro: la base llena su celda."""
        factor = medio / max(max(abs(v[0]), abs(v[1])) for v in self.vertices)
        self.vertices = [(v[0] * factor, v[1] * factor, v[2]) for v in self.vertices]

    def objeto(self, nombre, material):
        malla = bpy.data.meshes.new(nombre)
        malla.from_pydata(self.vertices, [], self.caras)
        malla.update()
        atributo = malla.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
        for poligono in malla.polygons:
            color = lineal(self.colores[poligono.index])
            for loop in poligono.loop_indices:
                atributo.data[loop].color = color
        malla.materials.append(material)
        objeto = bpy.data.objects.new(nombre, malla)
        bpy.context.collection.objects.link(objeto)
        return objeto


def anillo(radio, y, lados=8, fase=math.pi / 8):
    return [(radio * math.sin(fase + i / lados * math.tau), y, radio * math.cos(fase + i / lados * math.tau)) for i in range(lados)]


def limpiar():
    for objeto in list(bpy.data.objects):
        bpy.data.objects.remove(objeto)
    for malla in list(bpy.data.meshes):
        bpy.data.meshes.remove(malla)


def material_paleta():
    material = bpy.data.materials.new('paleta')
    color = material.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Color'
    bsdf = material.node_tree.nodes['Principled BSDF']
    material.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    bsdf.inputs['Metallic'].default_value = 0.05
    return material


def vacio(nombre, padre=None, posicion=(0, 0, 0)):
    objeto = bpy.data.objects.new(nombre, None)
    bpy.context.collection.objects.link(objeto)
    if padre:
        objeto.parent = padre
    objeto.location = blender(posicion)
    return objeto


def exportar(nombre):
    """Escribe el GLB sin normales, para que el juego sombree plano."""
    bpy.ops.export_scene.gltf(filepath=f'{SALIDA}/{nombre}.glb', export_format='GLB', use_selection=False, export_yup=True, export_normals=False, export_tangents=False, export_animations=False, export_vertex_color='MATERIAL')
