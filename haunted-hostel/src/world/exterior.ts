import * as THREE from 'three';
import type { WorldCtx } from './context';
import { Face, at, boxGeo, cable, cbox, rod } from './geom';
import { Door } from './doors';
import { buildWall } from './hostel';
import { OUTER, OUTER_T, ROOF_Y, XMAX, floorY } from './layout';
import { Rng } from '../core/rng';
import {
  bicycle,
  bikeShed,
  compoundGate,
  electricPole,
  garbageBin,
  generator,
  motorcycle,
  securityBooth,
  shrine,
  streetLight,
  tree,
  waterTank,
} from './props/outdoor';
import { bulbLight, glowSprite, registerFixture } from './props/fixtures';
import { clothesLine, plasticChair, ironBed } from './props/furniture';
import { decal, graffiti, label, paintedSign } from './textArt';
import { interactive } from './actions';
import { markDynamic } from './context';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const COMPOUND = { x0: -14, x1: 54, z0: -10, z1: 32, gateX0: 15.5, gateX1: 20.5 };
export const SPAWN = V(18, 0, 37.5);

export interface ExteriorBuild {
  mainDoors: Door[];
  collapsible: { group: THREE.Group; setClosed: (closed: boolean) => void };
  wicket: THREE.Object3D;
  sky: THREE.Mesh;
  skyUniforms: { uTime: { value: number }; uFlash: { value: number } };
  shrineFlame: THREE.Mesh;
  streetLamp: THREE.MeshStandardMaterial;
}

export function buildExterior(ctx: WorldCtx): ExteriorBuild {
  const rng = new Rng(99);
  const { x0, x1, z0, z1 } = COMPOUND;
  // Ground: collision slab plus asphalt path and muddy grass.
  ctx.col.add({ minX: x0 - 30, maxX: x1 + 30, minZ: z0 - 30, maxZ: z1 + 30, minY: -1, maxY: 0, tag: 'ground' });
  const groundAt = (gx0: number, gx1: number, gz0: number, gz1: number, mat: string, y = 0) =>
    ctx.batch.add(boxGeo(gx0, y - 0.05, gz0, gx1, y, gz1, Face.PY), ctx.mats.get(mat), false, true);
  // Asphalt: main path, the road outside, and an apron along the building.
  groundAt(15.5, 20.5, OUTER + OUTER_T, z1 + 0.4, 'asphalt', 0.012);
  groundAt(-4, XMAX + 6, OUTER + OUTER_T, OUTER + 3.4, 'asphalt', 0.01);
  groundAt(x0 - 20, x1 + 20, z1 + 0.4, z1 + 9, 'asphalt', 0.012);
  groundAt(x0, x1, z0, z1, 'mud');
  groundAt(x0 - 30, x1 + 30, z1 + 9, z1 + 40, 'mud');
  groundAt(x0 - 30, x0, z0 - 30, z1 + 0.4, 'mud');
  groundAt(x1, x1 + 30, z0 - 30, z1 + 0.4, 'mud');
  groundAt(x0, x1, z0 - 30, z0, 'mud');
  // Kerb stones along the path.
  for (const x of [15.4, 20.5])
    ctx.batch.add(boxGeo(x, 0, OUTER + 3.4, x + 0.12, 0.12, z1, Face.ALL & ~Face.NY), ctx.mats.get('concrete', 1));

  // Compound wall with a gate in the south side.
  const W = 2.3;
  const wallM = 'facade';
  buildWall(ctx, 'x', z1, z1 + 0.25, x0, COMPOUND.gateX0 - 0.35, 0, W, [], wallM, wallM, 0);
  buildWall(ctx, 'x', z1, z1 + 0.25, COMPOUND.gateX1 + 0.35, x1, 0, W, [], wallM, wallM, 0);
  buildWall(ctx, 'x', z0 - 0.25, z0, x0, x1, 0, W, [], wallM, wallM, 0);
  buildWall(ctx, 'z', x0 - 0.25, x0, z0, z1 + 0.25, 0, W, [], wallM, wallM, 0);
  buildWall(ctx, 'z', x1, x1 + 0.25, z0, z1 + 0.25, 0, W, [], wallM, wallM, 0);
  // Coping and broken glass on top of the wall.
  ctx.batch.add(boxGeo(x0 - 0.3, W, z1 - 0.05, COMPOUND.gateX0 - 0.35, W + 0.08, z1 + 0.3), ctx.mats.get('concrete', 1));
  ctx.batch.add(boxGeo(COMPOUND.gateX1 + 0.35, W, z1 - 0.05, x1 + 0.3, W + 0.08, z1 + 0.3), ctx.mats.get('concrete', 1));
  // Painted wall slogans facing the road.
  const stick = decal(paintedSign(['STICK NO BILLS'], 512, 128, 'rgba(0,0,0,0)', '#2a2a2a', '"Special Elite", monospace'), 2.4, 0.6, {
    transparent: true,
  });
  stick.position.set(8, 1.3, z1 + 0.26);
  ctx.scene.add(stick);
  const ad = decal(
    paintedSign(
      ['SRI SAI XEROX & STATIONERY', 'Spiral binding · Project reports · 24 hrs'],
      1024,
      256,
      '#c9b27a',
      '#3a1d10',
      'Inter, Arial, sans-serif',
    ),
    3.2,
    0.8,
  );
  ad.position.set(30, 1.3, z1 + 0.26);
  ctx.scene.add(ad);
  // Road boundary (outside the gate the player can only walk along the road).
  ctx.col.add({ minX: x0 - 30, maxX: x1 + 30, minZ: z1 + 8.5, maxZ: z1 + 9, minY: 0, maxY: 3, opaque: false, tag: 'bound' });
  ctx.col.add({
    minX: COMPOUND.gateX0 - 9,
    maxX: COMPOUND.gateX0 - 8.5,
    minZ: z1,
    maxZ: z1 + 9,
    minY: 0,
    maxY: 3,
    opaque: false,
    tag: 'bound',
  });
  ctx.col.add({
    minX: COMPOUND.gateX1 + 8.5,
    maxX: COMPOUND.gateX1 + 9,
    minZ: z1,
    maxZ: z1 + 9,
    minY: 0,
    maxY: 3,
    opaque: false,
    tag: 'bound',
  });

  // Gate.
  const gate = compoundGate(ctx);
  gate.group.position.set((COMPOUND.gateX0 + COMPOUND.gateX1) / 2, 0, z1 + 0.12);
  gate.group.updateMatrixWorld(true);
  const wicket = gate.wicket;
  wicket.removeFromParent();
  wicket.position.add(gate.group.position);
  ctx.scene.add(wicket);
  ctx.batch.addObject(gate.group);
  // Gate leaves are closed except the wicket.
  ctx.col.add({
    minX: COMPOUND.gateX0 - 0.35,
    maxX: COMPOUND.gateX0 + 1.5,
    minY: 0,
    maxY: 2.4,
    minZ: z1 + 0.05,
    maxZ: z1 + 0.2,
    opaque: false,
    tag: 'gate',
  });
  ctx.col.add({
    minX: COMPOUND.gateX0 + 2.5,
    maxX: COMPOUND.gateX1 + 0.35,
    minY: 0,
    maxY: 2.4,
    minZ: z1 + 0.05,
    maxZ: z1 + 0.2,
    opaque: false,
    tag: 'gate',
  });
  for (const sx of [-1, 1])
    ctx.col.add({
      minX: 18 + sx * 2.85 - 0.35,
      maxX: 18 + sx * 2.85 + 0.35,
      minY: 0,
      maxY: 3,
      minZ: z1 - 0.23,
      maxZ: z1 + 0.47,
      tag: 'wall',
    });
  const wicketCollider = ctx.col.add({
    minX: COMPOUND.gateX0 + 1.5,
    maxX: COMPOUND.gateX0 + 2.5,
    minY: 0,
    maxY: 2.4,
    minZ: z1 + 0.05,
    maxZ: z1 + 0.2,
    opaque: false,
    tag: 'gate',
    enabled: false,
  });
  ctx.objects.set('wicket', wicket);
  wicket.userData.collider = wicketCollider;
  interactive(ctx, 'gate', wicket, [1.1, 2.2, 0.3], { prompt: 'open' }, [0.5, 1.1, 0]);
  ctx.points.set('gate', V(18, 0, z1 - 1.5));
  ctx.points.set('gateOutside', V(18, 0, z1 + 3));
  // Arch sign over the gate.
  const arch = decal(
    paintedSign(['VIDYANAGAR INSTITUTE OF TECHNOLOGY', 'KAVERI HOSTEL · BLOCK B'], 1400, 220, '#14202c', '#e8dcb8'),
    5.6,
    0.88,
  );
  arch.position.set(18, 3.85, z1 + 0.15);
  ctx.scene.add(arch);
  const archBack = arch.clone();
  archBack.rotation.y = Math.PI;
  archBack.position.z = z1 + 0.09;
  ctx.scene.add(archBack);

  // Security booth just inside the gate.
  const booth = securityBooth(ctx);
  booth.position.set(23.5, 0, z1 - 2.2);
  booth.rotation.y = Math.PI;
  ctx.batch.addObject(booth);
  ctx.col.add({ minX: 22.5, maxX: 24.5, minY: 0, maxY: 2.6, minZ: z1 - 3.1, maxZ: z1 - 1.3, tag: 'wall' });
  bulbLight(ctx, 'booth', 'BATTERY', 0, V(23.5, 2.4, z1 - 2.2), 0xffb060, 2.2, 0.5);
  const chair = plasticChair(ctx, 'plastic_blue');
  chair.position.set(22.2, 0, z1 - 1.0);
  chair.rotation.y = 2.4;
  ctx.batch.addObject(chair);
  const log = new THREE.Group();
  log.add(new THREE.Mesh(cbox(0.3, 0.03, 0.22), ctx.mats.getBasic('book_a')));
  log.position.set(23.1, 0.97, z1 - 1.25);
  ctx.scene.add(markDynamic(log));
  interactive(ctx, 'boothlog', log, [0.4, 0.2, 0.3], { prompt: 'read' }, [0, 0.05, 0]);
  ctx.emitters.push({ id: 'boothRadio', sound: 'radioStatic', pos: V(23.5, 1.1, z1 - 2.0), volume: 0.35, active: () => true });

  // Shrine under a peepal tree, left of the gate.
  const sh = shrine(ctx);
  sh.group.position.set(9, 0, z1 - 2.0);
  sh.group.rotation.y = Math.PI * 0.85;
  sh.group.updateMatrixWorld(true);
  const flame = sh.flame;
  const flameWorld = flame.getWorldPosition(new THREE.Vector3());
  flame.removeFromParent();
  flame.position.copy(flameWorld);
  ctx.scene.add(flame);
  ctx.batch.addObject(sh.group);
  ctx.col.add({ minX: 8.3, maxX: 9.7, minY: 0, maxY: 2.4, minZ: z1 - 2.7, maxZ: z1 - 1.3, tag: 'wall' });
  registerFixture(ctx, {
    id: 'diya',
    pos: flameWorld.clone().add(V(0, 0.2, 0)),
    color: 0xff9a3a,
    intensity: 1.8,
    range: 4,
    circuit: 'BATTERY',
    mats: [flame.material as THREE.MeshStandardMaterial],
    emissiveBase: 6,
    unstable: 0.35,
    floor: 0,
    buzz: false,
  });
  const dg = glowSprite(0xff8a2a, 0.6, 0.6);
  dg.position.copy(flameWorld);
  ctx.scene.add(dg);
  interactive(ctx, 'shrine', flame, [0.4, 0.3, 0.4], { prompt: 'inspect', inspect: 'inspect.shrine' }, [0, 0, 0]);
  ctx.points.set('shrine', V(9, 0, z1 - 3.5));

  // Trees.
  const treeSpots: [number, number, number, number][] = [
    [7.5, z1 - 4, 11, 7],
    [-7, 12, 9, 6],
    [34, 22, 10, 6],
    [46, 14, 8, 5],
    [-9, 26, 9, 6],
    [44, 28, 9, 6],
    [2, 18, 7, 5],
    [27, 14, 7, 4],
    [50, -4, 8, 5],
    [-10, -4, 8, 5],
  ];
  for (const [x, z, h, s] of treeSpots) {
    const t = tree(ctx, rng, h, s);
    t.position.set(x, 0, z);
    t.rotation.y = rng.range(0, 6);
    t.updateMatrixWorld(true);
    // Trunk is static; leaves sway (dynamic).
    const leaves: THREE.Object3D[] = [];
    t.traverse((o) => {
      if (o.userData.dynamic && (o as THREE.Mesh).isMesh) leaves.push(o);
    });
    for (const l of leaves) {
      const wp = new THREE.Matrix4().copy(l.matrixWorld);
      l.removeFromParent();
      l.matrixAutoUpdate = false;
      l.matrix.copy(wp);
      ctx.scene.add(l);
    }
    ctx.batch.addObject(t);
    ctx.col.add({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25, minY: 0, maxY: 4, opaque: false, tag: 'tree' });
  }
  // A ring of distant tree silhouettes beyond the compound.
  ctx.scene.add(treeline(ctx));

  // Bike shed with motorcycles, bicycles by the entrance, bins.
  const shed = bikeShed(ctx, 9);
  shed.position.set(8.5, 0, OUTER + 4.2);
  ctx.batch.addObject(shed);
  for (let i = 0; i < 4; i++) {
    const m = motorcycle(ctx, rng);
    m.position.set(5.2 + i * 2.0, 0, OUTER + 4.2 + rng.range(-0.3, 0.3));
    m.rotation.y = Math.PI / 2 + rng.range(-0.25, 0.25);
    ctx.batch.addObject(m);
    ctx.col.add({
      minX: m.position.x - 0.35,
      maxX: m.position.x + 0.35,
      minZ: m.position.z - 1.0,
      maxZ: m.position.z + 1.0,
      minY: 0,
      maxY: 1.1,
      opaque: false,
      tag: 'prop',
    });
  }
  for (let i = 0; i < 3; i++) {
    const b = bicycle(ctx);
    b.position.set(24 + i * 0.7, 0, OUTER + 2.4);
    b.rotation.y = Math.PI / 2 + rng.range(-0.1, 0.1);
    ctx.batch.addObject(b);
  }
  ctx.col.add({ minX: 23.6, maxX: 25.8, minZ: OUTER + 1.4, maxZ: OUTER + 3.4, minY: 0, maxY: 1.1, opaque: false, tag: 'prop' });
  for (let i = 0; i < 2; i++) {
    const g = garbageBin(ctx, rng);
    g.position.set(36 + i * 1.0, 0, z1 - 3.5);
    ctx.batch.addObject(g);
    ctx.col.add({ minX: 35.6 + i, maxX: 36.4 + i, minZ: z1 - 3.9, maxZ: z1 - 3.1, minY: 0, maxY: 1, opaque: false, tag: 'prop' });
  }
  // Street lights: one working (flickering), one broken.
  const sl1 = streetLight(ctx, false);
  sl1.group.position.set(13.5, 0, 19);
  ctx.batch.addObject(sl1.group);
  registerFixture(ctx, {
    id: 'street1',
    pos: sl1.lamp.clone().add(sl1.group.position),
    color: 0xffa040,
    intensity: 70,
    range: 26,
    circuit: 'STREET',
    mats: [sl1.lampMat],
    emissiveBase: 3,
    unstable: 0.45,
    floor: 0,
    buzz: true,
  });
  const sg = glowSprite(0xffa040, 3, 0.35);
  sg.position.copy(sl1.lamp).add(sl1.group.position);
  ctx.scene.add(sg);
  ctx.fixtures[ctx.fixtures.length - 1]!.glow = sg;
  const sl2 = streetLight(ctx, true);
  sl2.group.position.set(26, 0, 12);
  sl2.group.rotation.y = Math.PI;
  ctx.batch.addObject(sl2.group);
  ctx.points.set(
    'brokenLamp',
    sl2.lamp
      .clone()
      .applyAxisAngle(V(0, 1, 0), Math.PI)
      .add(sl2.group.position),
  );
  // Road light outside the gate.
  const sl3 = streetLight(ctx, false);
  sl3.group.position.set(10, 0, z1 + 6);
  sl3.group.rotation.y = 0;
  ctx.batch.addObject(sl3.group);
  registerFixture(ctx, {
    id: 'street3',
    pos: sl3.lamp.clone().add(sl3.group.position),
    color: 0xffa858,
    intensity: 55,
    range: 24,
    circuit: 'STREET',
    mats: [sl3.lampMat],
    emissiveBase: 3,
    unstable: 0.1,
    floor: 0,
    buzz: true,
  });
  // Porch canopy over the entrance with a caged bulb.
  ctx.batch.add(boxGeo(15.6, 3.0, OUTER + OUTER_T, 20.4, 3.18, OUTER + 3.0), ctx.mats.get('concrete', 1));
  for (const x of [15.85, 20.15]) {
    ctx.batch.add(boxGeo(x - 0.15, 0, OUTER + 2.65, x + 0.15, 3.0, OUTER + 2.95), ctx.mats.get('facade', 3.4));
    ctx.col.add({ minX: x - 0.15, maxX: x + 0.15, minZ: OUTER + 2.65, maxZ: OUTER + 2.95, minY: 0, maxY: 3, tag: 'wall' });
  }
  bulbLight(ctx, 'porch', 'EXT', 0, V(18, 2.95, OUTER + 1.5), 0xffc890, 8, 0.65);
  // Electric poles with sagging wires to the building.
  const poles: { group: THREE.Group; anchors: THREE.Vector3[] }[] = [];
  for (const [px, pz] of [
    [12, z1 + 1.6],
    [26, z1 + 1.6],
    [42, z1 + 1.6],
    [46, 8],
  ] as const) {
    const p = electricPole(ctx);
    p.group.position.set(px, 0, pz);
    p.group.updateMatrixWorld(true);
    ctx.batch.addObject(p.group);
    poles.push({ group: p.group, anchors: p.anchors.map((a) => a.clone().applyMatrix4(p.group.matrixWorld)) });
  }
  const wireM = ctx.mats.getBasic('cable');
  for (let i = 0; i < poles.length - 1; i++) {
    for (let k = 0; k < 4; k++) {
      ctx.batch.add(cable(poles[i]!.anchors[k]!, poles[i + 1]!.anchors[k]!, 0.6 + k * 0.05), wireM, false, false);
    }
  }
  for (let k = 0; k < 3; k++) {
    ctx.batch.add(cable(poles[3]!.anchors[k]!, V(XMAX + 0.25, floorY(1) + 2.5 + k * 0.2, 2 + k), 0.9), wireM, false, false);
    ctx.batch.add(cable(poles[0]!.anchors[k]!, V(14, floorY(1) + 2.8 + k * 0.15, OUTER + OUTER_T + 0.02), 1.1), wireM, false, false);
  }
  // Generator room east of the building.
  const gx = XMAX + 6;
  buildWall(ctx, 'x', -2.25, -2.0, gx - 2, gx + 2, 0, 2.8, [], 'brick', 'brick', 0);
  buildWall(ctx, 'z', gx + 2, gx + 2.25, -2.0, 2.5, 0, 2.8, [], 'brick', 'brick', 0);
  buildWall(ctx, 'z', gx - 2.25, gx - 2, -2.0, 2.5, 0, 2.8, [{ a0: -0.2, a1: 1.0, y0: 0, y1: 2.0 }], 'brick', 'brick', 0);
  buildWall(ctx, 'x', 2.5, 2.75, gx - 2, gx + 2, 0, 2.8, [], 'brick', 'brick', 0);
  const gr = new THREE.Mesh(boxGeo(gx - 2.5, 2.8, -2.5, gx + 2.5, 2.88, 3.0), ctx.mats.get('rust', 2));
  ctx.batch.add(gr.geometry, gr.material as THREE.Material);
  const gen = generator(ctx);
  gen.position.set(gx + 0.4, 0, 0.3);
  gen.rotation.y = Math.PI / 2;
  ctx.batch.addObject(gen);
  ctx.col.add({ minX: gx - 0.3, maxX: gx + 1.1, minZ: -0.9, maxZ: 1.5, minY: 0, maxY: 1.5, tag: 'prop' });
  const gsign = decal(label('GENERATOR ROOM', 512, 96, '#d9b21c', '#111'), 1.0, 0.19);
  gsign.position.set(gx - 2.26, 2.3, 0.4);
  gsign.rotation.y = -Math.PI / 2;
  ctx.scene.add(gsign);
  ctx.points.set('generator', V(gx - 3, 0, 0.4));

  // Terrace: water tanks, clothes lines, old mattresses, a TV antenna.
  const T = ROOF_Y;
  for (const tx of [30, 33]) {
    const tk = waterTank(ctx);
    tk.position.set(tx, T, -3.0);
    ctx.batch.addObject(tk);
    ctx.col.add({ minX: tx - 0.95, maxX: tx + 0.95, minZ: -3.95, maxZ: -2.05, minY: T, maxY: T + 2.2, tag: 'prop' });
  }
  ctx.points.set('tanks', V(31.5, T, -1.2));
  const tline = clothesLine(ctx, V(12, T + 1.9, -3.5), V(24, T + 1.9, -3.6), rng, 6, true);
  ctx.scene.add(markDynamic(tline));
  for (const x of [12, 24]) ctx.batch.add(rod(V(x, T, -3.5), V(x, T + 2.0, -3.5), 0.03), ctx.mats.get('rust', 1));
  const mat1 = ironBed(ctx, rng, { bare: false });
  mat1.position.set(20, T, 3.2);
  mat1.rotation.set(0, 1.4, 0);
  ctx.batch.addObject(mat1);
  const ant = new THREE.Group();
  ant.add(new THREE.Mesh(rod(V(0, 0, 0), V(0, 3, 0), 0.02), ctx.mats.get('rust', 1)));
  for (let i = 0; i < 5; i++)
    ant.add(new THREE.Mesh(rod(V(-0.5 + i * 0.05, 2.6 - i * 0.2, 0), V(0.5 - i * 0.05, 2.6 - i * 0.2, 0), 0.008), ctx.mats.get('rust', 1)));
  ant.position.set(8, T, 3);
  ctx.batch.addObject(ant);
  // Her dupatta snagged on the tank pipe (environmental clue).
  const dupGeo = new THREE.PlaneGeometry(0.4, 1.6, 4, 16);
  const dp = dupGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < dp.count; i++) dp.setZ(i, Math.sin(dp.getY(i) * 5) * 0.05);
  dupGeo.computeVertexNormals();
  const dup = new THREE.Mesh(dupGeo, new THREE.MeshStandardMaterial({ color: 0x5a2a4a, roughness: 0.9, side: THREE.DoubleSide }));
  dup.position.set(31.5, T + 1.4, -1.98);
  dup.castShadow = true;
  ctx.scene.add(markDynamic(dup));
  ctx.animated.push({ update: (_dt, t) => (dup.rotation.x = Math.sin(t * 2.1) * 0.3 + Math.sin(t * 5.3) * 0.08) });
  interactive(ctx, 'dupatta', dup, [0.5, 1.6, 0.4], { prompt: 'inspect', inspect: 'inspect.dupatta' }, [0, 0, 0]);
  bulbLight(ctx, 'terraceBulb', 'SF', 2, V(BAY_EAST() + 0.4, T + 2.5, -0.7), 0xffd8a0, 5, 0.6);
  // Graffiti on the mumty wall facing the terrace.
  const gtex = graffiti('A.R. 2016', 31, 'rgba(30,30,30,0.7)', 512, 160);
  const gd = decal(gtex, 1.2, 0.38, { transparent: true });
  gd.position.set(BAY_EAST() + 0.16, T + 1.4, 2.4);
  gd.rotation.y = Math.PI / 2;
  ctx.scene.add(gd);

  // Main entrance: double doors + collapsible grille gate.
  const left = new Door(ctx, {
    id: 'mainL',
    axis: 'x',
    a: 17.0,
    c: OUTER + OUTER_T / 2,
    width: 1.0,
    floorY: 0,
    wallT: OUTER_T,
    swing: -1,
    material: 'wood_door_brown',
    height: 2.55,
    plateSide: 1,
    openAtStart: 1,
  });
  const right = new Door(ctx, {
    id: 'mainR',
    axis: 'x',
    a: 18.0,
    c: OUTER + OUTER_T / 2,
    width: 1.0,
    floorY: 0,
    wallT: OUTER_T,
    swing: -1,
    hingeAtEnd: true,
    material: 'wood_door_brown',
    height: 2.55,
    plateSide: 1,
  });
  const coll = collapsibleGate(ctx, 17.0, 19.0, OUTER + OUTER_T + 0.08);
  // Sky dome.
  const sky = skyDome();
  ctx.scene.add(sky.mesh);
  return {
    mainDoors: [left, right],
    collapsible: coll,
    wicket,
    sky: sky.mesh,
    skyUniforms: sky.uniforms,
    shrineFlame: flame,
    streetLamp: sl1.lampMat,
  };
}

const BAY_EAST = () => 3.75;

/** Collapsible (scissor) grille gate across the entrance; folds to the sides when open. */
function collapsibleGate(ctx: WorldCtx, xa: number, xb: number, z: number): { group: THREE.Group; setClosed: (closed: boolean) => void } {
  const g = new THREE.Group();
  const iron = ctx.mats.get('metal_black', 1);
  const halves: THREE.Group[] = [];
  const half = (xLeft: number, dir: 1 | -1) => {
    const h = new THREE.Group();
    h.position.set(xLeft, 0, z);
    const n = 8;
    const span = (xb - xa) / 2;
    for (let i = 0; i <= n; i++) {
      const bar = new THREE.Mesh(cbox(0.03, 2.4, 0.03), iron);
      bar.position.set((dir * (i * span)) / n, 1.2, 0);
      h.add(bar);
    }
    for (let i = 0; i < n; i++) {
      for (const y of [0.5, 1.2, 1.9]) {
        const a = rod(V((dir * i * span) / n, y - 0.3, 0.02), V((dir * (i + 1) * span) / n, y + 0.3, 0.02), 0.008, 4);
        h.add(new THREE.Mesh(a, iron));
        const b = rod(V((dir * i * span) / n, y + 0.3, 0.02), V((dir * (i + 1) * span) / n, y - 0.3, 0.02), 0.008, 4);
        h.add(new THREE.Mesh(b, iron));
      }
    }
    h.add(at(new THREE.Mesh(cbox(span + 0.05, 0.05, 0.06), iron), (dir * span) / 2, 2.42, 0));
    g.add(h);
    halves.push(h);
    return h;
  };
  half(xa, 1);
  half(xb, -1);
  markDynamic(g);
  ctx.scene.add(g);
  const coll = ctx.col.add({
    minX: xa,
    maxX: xb,
    minY: 0,
    maxY: 2.4,
    minZ: z - 0.05,
    maxZ: z + 0.05,
    opaque: false,
    tag: 'gate',
    enabled: false,
  });
  let target = 0.12;
  let cur = 0.12;
  const apply = () => {
    for (const h of halves) h.scale.x = cur;
  };
  apply();
  ctx.animated.push({
    update: (dt) => {
      if (cur === target) return;
      cur += Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * 1.5);
      apply();
    },
  });
  return {
    group: g,
    setClosed: (closed: boolean) => {
      target = closed ? 1 : 0.12;
      coll.enabled = closed;
    },
  };
}

/** Night sky: dense monsoon clouds with drifting noise and a lightning flash uniform. */
function skyDome(): { mesh: THREE.Mesh; uniforms: { uTime: { value: number }; uFlash: { value: number } } } {
  const uniforms = { uTime: { value: 0 }, uFlash: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w * 0.99999;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uFlash;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0; float a = 0.5;
        for (int i = 0; i < 5; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec2 uv = d.xz / (d.y + 0.25) * 1.6;
        float c = fbm(uv + vec2(uTime * 0.01, uTime * 0.004));
        float c2 = fbm(uv * 2.3 - vec2(uTime * 0.02, 0.0));
        vec3 base = mix(vec3(0.035, 0.045, 0.06), vec3(0.012, 0.016, 0.024), smoothstep(0.0, 0.6, h));
        // Faint orange city glow on the horizon.
        base += vec3(0.07, 0.04, 0.02) * pow(1.0 - h, 6.0);
        vec3 cloud = vec3(0.05, 0.06, 0.075) * (0.5 + c * 1.1) + vec3(0.02) * c2;
        vec3 col = mix(base, cloud, smoothstep(0.2, 0.75, c) * smoothstep(-0.05, 0.25, d.y));
        // Moon glow behind the clouds.
        vec3 moonDir = normalize(vec3(-0.4, 0.55, -0.7));
        float m = max(dot(d, moonDir), 0.0);
        col += vec3(0.12, 0.14, 0.18) * pow(m, 40.0) * (1.0 - c * 0.8);
        col += uFlash * (vec3(0.55, 0.6, 0.75) * (0.4 + c * 1.2));
        if (d.y < 0.0) col = mix(col, vec3(0.01, 0.012, 0.016), smoothstep(0.0, -0.1, d.y));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), mat);
  mesh.userData.dynamic = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}

/** Billboard ring of distant trees and rooftops beyond the compound walls. */
function treeline(ctx: WorldCtx): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 256;
  const g = c.getContext('2d')!;
  const rng = new Rng(5);
  g.clearRect(0, 0, 2048, 256);
  g.fillStyle = '#05070a';
  for (let x = 0; x < 2048; x += rng.range(20, 60)) {
    const h = rng.range(60, 200);
    if (rng.chance(0.2)) {
      // A building roof with a water tank.
      g.fillRect(x, 256 - h * 0.6, rng.range(60, 140), h);
      g.fillRect(x + 20, 256 - h * 0.6 - 18, 22, 18);
      if (rng.chance(0.5)) {
        g.fillStyle = 'rgba(255,190,110,0.5)';
        g.fillRect(x + 30, 256 - h * 0.4, 6, 8);
        g.fillStyle = '#05070a';
      }
    } else {
      // Irregular canopy from many overlapping blobs.
      const r = rng.range(25, 55);
      for (let k = 0; k < 14; k++) {
        g.beginPath();
        g.arc(x + rng.range(-r, r), 256 - h + rng.range(-r * 0.6, r * 0.5), rng.range(r * 0.3, r * 0.6), 0, Math.PI * 2);
        g.fill();
      }
      g.fillRect(x - 3, 256 - h, 6, h);
    }
  }
  g.fillRect(0, 230, 2048, 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = 3;
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(95, 95, 26, 48, 1, true),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.BackSide, depthWrite: false, fog: true, color: 0x9aa4b0 }),
  );
  m.position.set(20, 11, 10);
  m.userData.dynamic = true;
  void ctx;
  return m;
}
