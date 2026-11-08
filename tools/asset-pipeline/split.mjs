// Corte por volúmenes (spec 002): separa en casco, torreta y cañón un modelo que llega como
// una sola malla, como los que genera TRELLIS a partir de una imagen de concepto.
//
// Cada triángulo va al grupo donde cae su centro, en coordenadas del original:
//   1. cañón: dentro de uno de sus tubos (eje y radio) o de una de sus cajas (mantelete, visor);
//   2. torreta: sobre la altura del aro (`above`) y dentro de su planta (círculo o caja);
//   3. casco: todo lo demás, más una tapa plana sobre el hueco que deja la torreta al girar.
//
// En un soldado (`legs`), el casco son sus dos piernas, en nodos aparte para que caminen: lo que
// queda bajo la cadera se reparte a cada lado de `center`. Tronco y brazos van como torreta.
//
// Deja nodos con nombre, como los de un modelo que ya traía las piezas: `torreta` en el
// pivote, `canon` en los muñones y una `boca_NN` en la punta de cada tubo. El normalizador
// sigue desde ahí como con cualquier otro modelo. Los volúmenes se miden una vez por modelo
// y quedan en su manifiesto (campo "split"; ver docs/asset-standard.md).
import { Matrix4, Vector3 } from 'three';
import { worldMatrix } from './rig.mjs';

export const SPLIT_NAMES = { hull: 'casco', turret: 'torreta', gun: 'canon', rotor: 'rotor', muzzle: 'boca', cap: 'tapa', legs: ['pierna_izq', 'pierna_der'] };

const inside = (value, [min, max]) => value >= min && value <= max;
const inBox = (p, box) => inside(p.x, box.x) && inside(p.y, box.y) && inside(p.z, box.z);

/** Lee la única malla del original con sus atributos ya llevados a coordenadas de mundo. */
function readSingleMesh(document) {
  const meshNodes = document.getRoot().listNodes().filter((node) => node.getMesh());
  const primitives = meshNodes.flatMap((node) => node.getMesh().listPrimitives().map((primitive) => ({ node, primitive })));
  if (primitives.length !== 1) throw new Error(`el corte por volúmenes espera una sola malla y hay ${primitives.length}`);
  const [{ node, primitive }] = primitives;
  const matrix = worldMatrix(node);
  const source = primitive.getAttribute('POSITION').getArray();
  const positions = new Float32Array(source.length);
  const v = new Vector3();
  for (let i = 0; i < source.length; i += 3) {
    v.set(source[i], source[i + 1], source[i + 2]).applyMatrix4(matrix);
    positions[i] = v.x; positions[i + 1] = v.y; positions[i + 2] = v.z;
  }
  const indices = primitive.getIndices()?.getArray() ?? Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
  return { primitive, positions, indices };
}

export function splitByVolumes(document, split) {
  const { primitive, positions, indices } = readSingleMesh(document);
  const uvs = primitive.getAttribute('TEXCOORD_0')?.getArray() ?? null;
  const material = primitive.getMaterial();
  const tubes = (split.gun.tubes ?? []).map((tube) => ({
    root: new Vector3(...tube.root),
    direction: new Vector3(...tube.direction).normalize(),
    radius: tube.radius,
    from: tube.from ?? 0,
  }));
  const boxes = split.gun.boxes ?? [];
  const turret = split.turret;
  const pivot = new Vector3(turret.pivot[0], turret.above, turret.pivot[1]);
  const trunnion = new Vector3(...split.gun.trunnion);
  // Si la IA dejó el arma muy grande para su base, torreta y cañón se achican juntos desde el pivote,
  // para que el cañón no se separe de lo que lo sostiene.
  const armScale = turret.scale ?? 1;

  const center = new Vector3();
  const offset = new Vector3();
  const tubeOf = (point) => tubes.findIndex((tube) => {
    offset.subVectors(point, tube.root);
    const along = offset.dot(tube.direction);
    return along > tube.from && offset.addScaledVector(tube.direction, -along).length() < tube.radius;
  });
  // El conjunto que gira con su propio eje, como los cañones de una gatling: un cilindro en el original.
  const rotor = split.gun.rotor;
  const rotorRoot = rotor && new Vector3(...rotor.root);
  const rotorAxis = rotor && new Vector3(...rotor.direction).normalize();
  const inRotor = (point) => {
    if (!rotor) return false;
    offset.subVectors(point, rotorRoot);
    const along = offset.dot(rotorAxis);
    return along > 0 && offset.addScaledVector(rotorAxis, -along).length() < rotor.radius;
  };
  const inTurret = (point) => {
    const radius = turret.wide && point.y > turret.wide.above ? turret.wide.radius : turret.radius;
    return radius
      ? Math.hypot(point.x - pivot.x, point.z - pivot.z) < radius
      : inside(point.x, turret.box.x) && inside(point.z, turret.box.z);
  };

  const groups = { hull: [], turret: [], gun: [], rotor: [], legs: [[], []] };
  const tubeTriangles = new Map();
  for (let t = 0; t < indices.length / 3; t++) {
    center.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const i = indices[t * 3 + k];
      center.x += positions[i * 3] / 3; center.y += positions[i * 3 + 1] / 3; center.z += positions[i * 3 + 2] / 3;
    }
    const tube = tubeOf(center);
    if (tube >= 0) {
      (inRotor(center) ? groups.rotor : groups.gun).push(t);
      if (!boxes.some((box) => inBox(center, box))) tubeTriangles.set(t, tube);
    } else if (inRotor(center)) {
      groups.rotor.push(t);
    } else if (boxes.some((box) => inBox(center, box))) {
      groups.gun.push(t);
    } else if (center.y > turret.above && inTurret(center)) {
      groups.turret.push(t);
    } else if (split.legs) {
      groups.legs[center.x < split.legs.center ? 0 : 1].push(t);
    } else {
      groups.hull.push(t);
    }
  }
  if (!groups.turret.length || !groups.gun.length) throw new Error('el corte dejó la torreta o el cañón sin triángulos: revisar los volúmenes');

  // Enderezar cada tubo: la IA a veces deja el cañón girado respecto de su torreta. Se gira
  // en torno a la vertical de su raíz hasta que apunte al frente (+Z) del original.
  const straighten = tubes.map((tube) => {
    const yaw = split.gun.straighten === false ? 0 : Math.atan2(tube.direction.x, tube.direction.z);
    return {
      yaw,
      matrix: new Matrix4().makeTranslation(tube.root.x, tube.root.y, tube.root.z)
        .multiply(new Matrix4().makeRotationY(-yaw))
        .multiply(new Matrix4().makeTranslation(-tube.root.x, -tube.root.y, -tube.root.z)),
      direction: tube.direction.clone().applyMatrix4(new Matrix4().makeRotationY(-yaw)),
      tip: 0,
    };
  });
  const v = new Vector3();
  for (const [t, tube] of tubeTriangles) {
    for (let k = 0; k < 3; k++) {
      const i = indices[t * 3 + k];
      v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).applyMatrix4(straighten[tube].matrix);
      straighten[tube].tip = Math.max(straighten[tube].tip, v.sub(tubes[tube].root).dot(straighten[tube].direction));
    }
  }

  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const build = (triangles, origin, scale = 1) => {
    const remap = new Map();
    const outPositions = [];
    const outUvs = [];
    const outIndices = [];
    for (const t of triangles) {
      const tube = tubeTriangles.get(t);
      for (let k = 0; k < 3; k++) {
        const i = indices[t * 3 + k];
        const key = tube === undefined ? i : `${i}:${tube}`;
        if (!remap.has(key)) {
          remap.set(key, outPositions.length / 3);
          v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
          if (tube !== undefined) v.applyMatrix4(straighten[tube].matrix);
          outPositions.push((v.x - origin.x) * scale, (v.y - origin.y) * scale, (v.z - origin.z) * scale);
          if (uvs) outUvs.push(uvs[i * 2], uvs[i * 2 + 1]);
        }
        outIndices.push(remap.get(key));
      }
    }
    const part = document.createPrimitive()
      .setAttribute('POSITION', accessor('VEC3', new Float32Array(outPositions)))
      .setIndices(accessor('SCALAR', new Uint32Array(outIndices)))
      .setMaterial(material);
    if (uvs) part.setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(outUvs)));
    return part;
  };

  const hullMesh = groups.hull.length ? document.createMesh(SPLIT_NAMES.hull).addPrimitive(build(groups.hull, new Vector3())) : null;
  if (split.cap) {
    // Tapa del hueco que la torreta deja en el techo del casco al girar.
    const { x, z, y } = split.cap;
    const capMaterial = document.createMaterial(SPLIT_NAMES.cap).setBaseColorFactor([0.5, 0.45, 0.35, 1]).setDoubleSided(true);
    hullMesh.addPrimitive(document.createPrimitive()
      .setAttribute('POSITION', accessor('VEC3', new Float32Array([x[0], y, z[0], x[1], y, z[0], x[1], y, z[1], x[0], y, z[1]])))
      .setIndices(accessor('SCALAR', new Uint32Array([0, 2, 1, 0, 3, 2])))
      .setMaterial(capMaterial));
  }

  const oldNodes = document.getRoot().listNodes();
  const root = document.createNode('raiz');
  const hull = document.createNode(SPLIT_NAMES.hull);
  if (hullMesh) hull.setMesh(hullMesh);
  if (split.legs) {
    SPLIT_NAMES.legs.forEach((name, index) => {
      root.addChild(document.createNode(name).setMesh(document.createMesh(name).addPrimitive(build(groups.legs[index], new Vector3()))));
    });
  }
  const turretNode = document.createNode(SPLIT_NAMES.turret)
    .setMesh(document.createMesh(SPLIT_NAMES.turret).addPrimitive(build(groups.turret, pivot, armScale)))
    .setTranslation(pivot.toArray());
  const gunNode = document.createNode(SPLIT_NAMES.gun)
    .setMesh(document.createMesh(SPLIT_NAMES.gun).addPrimitive(build(groups.gun, trunnion, armScale)))
    .setTranslation(new Vector3().subVectors(trunnion, pivot).multiplyScalar(armScale).toArray());
  const muzzles = straighten.map((tube, index) => {
    // La boca queda un poco dentro de la punta, en el eje del tubo ya enderezado.
    const tip = tubes[index].root.clone().addScaledVector(tube.direction, tube.tip - 0.01);
    const name = `${SPLIT_NAMES.muzzle}_${String(index + 1).padStart(2, '0')}`;
    gunNode.addChild(document.createNode(name).setTranslation(new Vector3().subVectors(tip, trunnion).multiplyScalar(armScale).toArray()));
    return name;
  });
  if (groups.rotor.length) {
    gunNode.addChild(document.createNode(SPLIT_NAMES.rotor).setMesh(document.createMesh(SPLIT_NAMES.rotor).addPrimitive(build(groups.rotor, trunnion, armScale))));
  }
  turretNode.addChild(gunNode);
  root.addChild(hull).addChild(turretNode);
  for (const node of oldNodes) node.dispose();
  primitive.dispose();
  for (const scene of document.getRoot().listScenes()) scene.dispose();
  document.getRoot().setDefaultScene(document.createScene().addChild(root));

  const log = [`corte por volúmenes: casco ${groups.hull.length}, torreta ${groups.turret.length}, cañón ${groups.gun.length} triángulos`];
  straighten.forEach((tube, index) => {
    if (Math.abs(tube.yaw) > 1e-3) log.push(`tubo ${index + 1} enderezado ${((tube.yaw * 180) / Math.PI).toFixed(1)}° respecto de su torreta`);
  });
  return { turret: SPLIT_NAMES.turret, gun: SPLIT_NAMES.gun, muzzles, log };
}
