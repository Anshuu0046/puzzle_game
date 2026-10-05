import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { WorldCtx } from '../context';
import { cbox, normalizeUv, rod } from '../geom';
import { Rng } from '../../core/rng';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = cast;
  me.receiveShadow = true;
  return me;
}

/**
 * Tree with a branching trunk (tapered tubes) and leaf-card clusters that sway in the wind.
 * Leaves are a single merged dynamic mesh with a vertex-shader sway to stay cheap.
 */
export function tree(ctx: WorldCtx, rng: Rng, height: number, spread: number): THREE.Group {
  const g = new THREE.Group();
  const barkM = ctx.mats.get('bark', 1);
  const leafGeos: THREE.BufferGeometry[] = [];
  const branch = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len);
    const mid = from
      .clone()
      .lerp(to, 0.5)
      .add(V(rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15)).multiplyScalar(len * 0.3));
    const curve = new THREE.CatmullRomCurve3([from, mid, to]);
    const tg = new THREE.TubeGeometry(curve, 6, r, 7, false);
    // Taper the tube towards its end.
    const pos = tg.getAttribute('position') as THREE.BufferAttribute;
    const segs = 7;
    for (let i = 0; i < pos.count; i++) {
      const ring = Math.floor(i / (segs + 1));
      const t = ring / 6;
      const c = curve.getPoint(t);
      const k = 1 - t * 0.55;
      pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k);
    }
    tg.computeVertexNormals();
    normalizeUv(tg, 2);
    g.add(mesh(tg, barkM));
    if (depth <= 0) {
      for (let i = 0; i < 4; i++) {
        const s = rng.range(1.4, 2.4) * spread * 0.35;
        const p = new THREE.PlaneGeometry(s, s);
        p.rotateX(rng.range(-1.2, 1.2));
        p.rotateY(rng.range(0, Math.PI));
        p.translate(to.x + rng.range(-0.6, 0.6), to.y + rng.range(-0.3, 0.5), to.z + rng.range(-0.6, 0.6));
        leafGeos.push(p);
      }
      return;
    }
    const kids = depth === 3 ? 3 : 2 + rng.int(0, 1);
    for (let i = 0; i < kids; i++) {
      const nd = dir
        .clone()
        .add(V(rng.range(-0.9, 0.9), rng.range(0.1, 0.6), rng.range(-0.9, 0.9)))
        .normalize();
      branch(to, nd, len * rng.range(0.55, 0.75), r * 0.6, depth - 1);
    }
  };
  branch(V(0, -0.2, 0), V(0, 1, 0), height * 0.42, 0.18 * (height / 8), 3);
  if (leafGeos.length) {
    const merged = mergeGeometries(leafGeos)!;
    const leafMat = ctx.mats.get('leaves', 1).clone();
    const uTime = { value: 0 };
    leafMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
           float sway = sin(uTime * 1.7 + position.x * 0.8 + position.z * 0.6) * 0.12 + sin(uTime * 4.3 + position.y) * 0.04;
           transformed.x += sway * (position.y * 0.12);
           transformed.z += sway * 0.6 * (position.y * 0.12);`,
      );
    };
    const leavesMesh = new THREE.Mesh(merged, leafMat);
    leavesMesh.castShadow = true;
    leavesMesh.receiveShadow = true;
    leavesMesh.userData.dynamic = true;
    g.add(leavesMesh);
    ctx.animated.push({ update: (_dt, t) => (uTime.value = t) });
  }
  return g;
}

function wheel(ctx: WorldCtx, r: number, w: number, spokes: number): THREE.Group {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(r, w, 10, 28), ctx.mats.getBasic('tyre'));
  tyre.castShadow = true;
  g.add(tyre);
  g.add(new THREE.Mesh(new THREE.TorusGeometry(r - w, w * 0.25, 6, 28), ctx.mats.getBasic('chrome')));
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    g.add(new THREE.Mesh(rod(V(0, 0, 0), V(Math.cos(a) * (r - w), Math.sin(a) * (r - w), 0), 0.003, 4), ctx.mats.getBasic('steel')));
  }
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 10).rotateX(Math.PI / 2), ctx.mats.getBasic('steel')));
  return g;
}

/** Commuter motorcycle on its side stand. Local: length along X. */
export function motorcycle(ctx: WorldCtx, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const paint = ctx.mats.getBasic(rng.pick(['bike_red', 'bike_blue', 'bike_black']));
  const chrome = ctx.mats.getBasic('chrome');
  const black = ctx.mats.getBasic('black_plastic');
  const fw = wheel(ctx, 0.3, 0.045, 0);
  fw.position.set(0.68, 0.3, 0);
  const rw = wheel(ctx, 0.3, 0.05, 0);
  rw.position.set(-0.62, 0.3, 0);
  g.add(fw, rw);
  for (const w of [fw, rw]) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const s = new THREE.Mesh(cbox(0.03, 0.2, 0.02), ctx.mats.getBasic('steel'));
      s.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0);
      s.rotation.z = a + Math.PI / 2;
      w.add(s);
    }
  }
  // Fuel tank.
  const tank = mesh(new RoundedBoxGeometry(0.48, 0.2, 0.3, 3, 0.09), paint, 0.15, 0.82, 0);
  tank.rotation.z = -0.12;
  g.add(tank);
  // Seat.
  const seat = mesh(new RoundedBoxGeometry(0.62, 0.09, 0.26, 3, 0.04), black, -0.35, 0.8, 0);
  seat.rotation.z = 0.04;
  g.add(seat);
  // Side panel and engine block.
  g.add(mesh(new RoundedBoxGeometry(0.26, 0.18, 0.28, 2, 0.04), paint, -0.25, 0.62, 0));
  g.add(mesh(new RoundedBoxGeometry(0.34, 0.26, 0.22, 2, 0.05), ctx.mats.get('metal_black', 1), 0.05, 0.42, 0));
  for (let i = 0; i < 4; i++) g.add(mesh(cbox(0.3, 0.012, 0.24), ctx.mats.getBasic('steel'), 0.05, 0.36 + i * 0.04, 0, false));
  // Exhaust.
  g.add(mesh(rod(V(0.1, 0.3, 0.14), V(-0.75, 0.38, 0.16), 0.035, 10), chrome));
  // Front forks + handlebar + headlamp.
  g.add(mesh(rod(V(0.68, 0.3, 0.07), V(0.5, 1.0, 0.07), 0.02), chrome));
  g.add(mesh(rod(V(0.68, 0.3, -0.07), V(0.5, 1.0, -0.07), 0.02), chrome));
  g.add(mesh(rod(V(0.47, 1.04, -0.35), V(0.47, 1.04, 0.35), 0.013), chrome));
  for (const s of [-1, 1]) g.add(mesh(rod(V(0.47, 1.04, s * 0.33), V(0.47, 1.04, s * 0.4), 0.02), black));
  const lamp = mesh(new THREE.SphereGeometry(0.09, 14, 10, 0, Math.PI), chrome, 0.58, 0.95, 0);
  lamp.rotation.y = Math.PI / 2;
  g.add(lamp);
  g.add(mesh(new THREE.CircleGeometry(0.085, 14).rotateY(Math.PI / 2), ctx.mats.getBasic('glass'), 0.585, 0.95, 0, false));
  // Mudguards.
  g.add(mesh(new THREE.TorusGeometry(0.33, 0.04, 4, 12, Math.PI * 0.8).rotateZ(Math.PI * 0.15), paint, 0.68, 0.3, 0));
  g.add(mesh(new THREE.TorusGeometry(0.34, 0.06, 4, 12, Math.PI * 0.7).rotateZ(Math.PI * 0.2), black, -0.62, 0.3, 0));
  // Mirrors and number plate.
  for (const s of [-1, 1]) {
    g.add(mesh(rod(V(0.45, 1.04, s * 0.25), V(0.42, 1.25, s * 0.3), 0.006), chrome));
    g.add(mesh(new THREE.CircleGeometry(0.05, 12).rotateY(-Math.PI / 2), chrome, 0.42, 1.27, s * 0.3, false));
  }
  g.add(mesh(cbox(0.02, 0.1, 0.2), ctx.mats.getBasic('white_plastic'), -0.98, 0.55, 0, false));
  g.rotation.x = 0.1; // leaning on side stand
  return g;
}

/** Old roadster bicycle with a carrier. Local: length along X. */
export function bicycle(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const f = ctx.mats.get('metal_black', 1);
  const fw = wheel(ctx, 0.34, 0.018, 18);
  fw.position.set(0.55, 0.35, 0);
  const rw = wheel(ctx, 0.34, 0.018, 18);
  rw.position.set(-0.52, 0.35, 0);
  g.add(fw, rw);
  const p = {
    bb: V(-0.02, 0.32, 0),
    seat: V(-0.2, 0.92, 0),
    head: V(0.42, 0.95, 0),
    rear: V(-0.52, 0.35, 0),
    front: V(0.55, 0.35, 0),
  };
  const tube = (a: THREE.Vector3, b: THREE.Vector3, r = 0.016) => g.add(mesh(rod(a, b, r), f));
  tube(p.bb, p.seat);
  tube(p.bb, p.head);
  tube(p.seat, p.head);
  tube(p.bb, p.rear);
  tube(p.seat, p.rear);
  tube(p.head, p.front, 0.014);
  tube(p.head, V(0.4, 1.08, 0));
  tube(V(0.4, 1.08, -0.28), V(0.4, 1.08, 0.28), 0.012);
  g.add(mesh(new RoundedBoxGeometry(0.24, 0.06, 0.14, 2, 0.03), ctx.mats.getBasic('black_plastic'), -0.22, 0.97, 0));
  // Carrier.
  g.add(mesh(cbox(0.36, 0.015, 0.14), ctx.mats.getBasic('steel'), -0.45, 0.72, 0));
  tube(V(-0.3, 0.72, 0), V(-0.52, 0.35, 0), 0.008);
  g.rotation.x = 0.12;
  return g;
}

/** Overflowing municipal-style garbage bin. */
export function garbageBin(ctx: WorldCtx, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const m = ctx.mats.get(rng.chance(0.5) ? 'plastic_green' : 'plastic_blue', 1);
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.28, 0),
    new THREE.Vector2(0.34, 0.85),
    new THREE.Vector2(0.36, 0.88),
    new THREE.Vector2(0.32, 0.88),
    new THREE.Vector2(0.26, 0.02),
    new THREE.Vector2(0, 0.02),
  ];
  g.add(mesh(new THREE.LatheGeometry(pts, 18), m));
  for (let i = 0; i < 6; i++) {
    const bag = mesh(
      new THREE.IcosahedronGeometry(rng.range(0.12, 0.2), 1),
      ctx.mats.getBasic('black_plastic'),
      rng.range(-0.15, 0.15),
      0.85 + rng.range(0, 0.15),
      rng.range(-0.15, 0.15),
    );
    bag.scale.y = 0.7;
    g.add(bag);
  }
  for (let i = 0; i < 3; i++) {
    const bag = mesh(
      new THREE.IcosahedronGeometry(rng.range(0.15, 0.22), 1),
      ctx.mats.getBasic('black_plastic'),
      rng.range(0.4, 0.8),
      0.12,
      rng.range(-0.4, 0.4),
    );
    bag.scale.y = 0.6;
    g.add(bag);
  }
  return g;
}

/** Street light pole with a curved arm and a sodium lamp head. Returns group and the lamp position. */
export function streetLight(
  ctx: WorldCtx,
  broken: boolean,
): { group: THREE.Group; lamp: THREE.Vector3; lampMat: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const m = ctx.mats.get('rust', 1);
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.1, 6.5, 10), m, 0, 3.25, 0));
  const arm = new THREE.CatmullRomCurve3([V(0, 6.3, 0), V(0.4, 6.75, 0), V(1.3, 6.85, 0)]);
  g.add(mesh(new THREE.TubeGeometry(arm, 10, 0.04, 6), m));
  g.add(mesh(new RoundedBoxGeometry(0.6, 0.14, 0.26, 2, 0.05), ctx.mats.get('metal_black', 1), 1.45, 6.82, 0));
  const lampMat = ctx.mats.emissive(0xffa040, broken ? 0 : 3);
  const lens = mesh(cbox(0.48, 0.02, 0.18), lampMat, 1.45, 6.74, 0, false);
  if (broken) lens.rotation.z = 0.15;
  g.add(lens);
  return { group: g, lamp: V(1.45, 6.6, 0), lampMat };
}

/** Big iron compound gate with spear-head bars, a wicket gate and masonry pillars. Opening 5 m. */
export function compoundGate(ctx: WorldCtx): { group: THREE.Group; wicket: THREE.Object3D } {
  const g = new THREE.Group();
  const iron = ctx.mats.get('metal_black', 1);
  const pillarM = ctx.mats.get('facade', 3.4);
  for (const sx of [-1, 1]) {
    g.add(mesh(cbox(0.7, 2.9, 0.7), pillarM, sx * 2.85, 1.45, 0));
    g.add(mesh(cbox(0.85, 0.12, 0.85), ctx.mats.get('concrete', 1), sx * 2.85, 2.96, 0));
    g.add(mesh(new THREE.SphereGeometry(0.16, 12, 10), ctx.mats.get('concrete', 1), sx * 2.85, 3.14, 0));
  }
  // Two leaves; left leaf has the wicket gate.
  const leaf = (x0: number, x1: number) => {
    const lg = new THREE.Group();
    const w = x1 - x0;
    lg.add(mesh(cbox(w, 0.06, 0.05), iron, (x0 + x1) / 2, 0.2, 0));
    lg.add(mesh(cbox(w, 0.06, 0.05), iron, (x0 + x1) / 2, 1.2, 0));
    lg.add(mesh(cbox(w, 0.06, 0.05), iron, (x0 + x1) / 2, 2.15, 0));
    const n = Math.round(w / 0.14);
    for (let i = 0; i <= n; i++) {
      const x = x0 + (w * i) / n;
      lg.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.2, 6), iron, x, 1.2, 0, false));
      const tip = mesh(new THREE.ConeGeometry(0.03, 0.12, 4), iron, x, 2.36, 0, false);
      lg.add(tip);
    }
    return lg;
  };
  g.add(leaf(-2.5, -1.0));
  g.add(leaf(0.0, 2.5));
  const wicket = new THREE.Group();
  wicket.position.set(-1.0, 0, 0);
  const wl = leaf(-1.0, 0.0);
  wl.position.x = 1.0;
  wicket.add(wl);
  wicket.rotation.y = -1.1;
  wicket.traverse((o) => (o.userData.dynamic = true));
  g.add(wicket);
  // Arch sign frame between pillars.
  g.add(mesh(rod(V(-2.85, 3.0, 0), V(-2.85, 4.2, 0), 0.05), iron));
  g.add(mesh(rod(V(2.85, 3.0, 0), V(2.85, 4.2, 0), 0.05), iron));
  return { group: g, wicket };
}

/** Security booth: small plastered cabin with a window, a tin roof and a plastic chair. */
export function securityBooth(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const wall = ctx.mats.get('facade', 3.4);
  const W = 1.8;
  const D = 1.6;
  const H = 2.5;
  g.add(mesh(cbox(W, H, 0.12), wall, 0, H / 2, -D / 2));
  g.add(mesh(cbox(0.12, H, D), wall, -W / 2, H / 2, 0));
  g.add(mesh(cbox(0.12, H, D), wall, W / 2, H / 2, 0));
  // Front with a door opening and a window.
  g.add(mesh(cbox(0.5, H, 0.12), wall, -W / 2 + 0.25, H / 2, D / 2));
  g.add(mesh(cbox(W - 1.3, 0.9, 0.12), wall, 0.4, 0.45, D / 2));
  g.add(mesh(cbox(W - 1.3, 0.45, 0.12), wall, 0.4, H - 0.22, D / 2));
  const roof = mesh(cbox(W + 0.6, 0.06, D + 0.6), ctx.mats.get('rust', 2), 0, H + 0.08, 0.1);
  roof.rotation.x = 0.06;
  g.add(roof);
  g.add(mesh(cbox(W - 1.3, 0.9, 0.04), ctx.mats.getBasic('glass_dirty'), 0.4, 1.4, D / 2, false));
  g.add(mesh(cbox(0.9, 0.04, 0.4), ctx.mats.get('wood_dark', 1), 0.4, 0.95, D / 2 - 0.3));
  return g;
}

/**
 * Small roadside shrine: a whitewashed niche with a stone idol shape, a brass lamp (diya),
 * marigold garlands, kumkum smears and a bell.
 */
export function shrine(ctx: WorldCtx): { group: THREE.Group; flame: THREE.Mesh } {
  const g = new THREE.Group();
  const white = ctx.mats.get('wall_room_yellow', 2);
  g.add(mesh(cbox(1.2, 0.5, 0.9), ctx.mats.get('concrete', 1), 0, 0.25, 0));
  g.add(mesh(cbox(1.0, 1.1, 0.12), white, 0, 1.05, -0.38));
  g.add(mesh(cbox(0.12, 1.1, 0.8), white, -0.45, 1.05, 0));
  g.add(mesh(cbox(0.12, 1.1, 0.8), white, 0.45, 1.05, 0));
  // Stepped shikhara roof.
  for (let i = 0; i < 4; i++) {
    const s = 1.1 - i * 0.22;
    g.add(mesh(cbox(s, 0.14, s * 0.85), white, 0, 1.67 + i * 0.14, 0));
  }
  g.add(mesh(new THREE.ConeGeometry(0.1, 0.25, 8), ctx.mats.getBasic('kumkum'), 0, 2.37, 0));
  // Idol: a smooth smeared stone.
  const idol = mesh(new THREE.SphereGeometry(0.16, 16, 12), ctx.mats.getBasic('kumkum'), 0, 0.68, -0.1);
  idol.scale.set(0.8, 1.2, 0.7);
  g.add(idol);
  // Garland of marigolds.
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push(V(-0.4 + t * 0.8, 1.55 - Math.sin(t * Math.PI) * 0.25, 0.32));
  }
  for (const p of pts) g.add(mesh(new THREE.IcosahedronGeometry(0.03, 0), ctx.mats.getBasic('marigold'), p.x, p.y, p.z, false));
  // Diya.
  const diya = mesh(
    new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    ctx.mats.getBasic('brass'),
    0.25,
    0.56,
    0.15,
    false,
  );
  g.add(diya);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 6), ctx.mats.emissive(0xffa030, 6));
  flame.position.set(0.25, 0.6, 0.15);
  flame.userData.dynamic = true;
  g.add(flame);
  // Bell.
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.09, 10, 1, true), ctx.mats.getBasic('brass'), 0.3, 1.5, 0.3));
  return { group: g, flame };
}

/** Black ribbed plastic water tank on a brick platform with pipes. */
export function waterTank(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const black = ctx.mats.getBasic('tank_black');
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 12; i++) {
    const y = 0.05 + (i / 12) * 1.4;
    pts.push(new THREE.Vector2(0.75 + (i % 2) * 0.03, y));
  }
  pts.push(new THREE.Vector2(0.6, 1.6), new THREE.Vector2(0.25, 1.68), new THREE.Vector2(0, 1.7));
  g.add(mesh(new THREE.LatheGeometry(pts, 32), black, 0, 0.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 18), black, 0, 2.03, 0));
  g.add(mesh(cbox(1.9, 0.3, 1.9), ctx.mats.get('brick', 1), 0, 0.15, 0));
  return g;
}

/** Diesel generator in its shed. */
export function generator(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const m = ctx.mats.get('metal_green', 1);
  g.add(mesh(new RoundedBoxGeometry(2.2, 1.3, 1.0, 2, 0.04), m, 0, 0.75, 0));
  g.add(mesh(cbox(2.4, 0.1, 1.2), ctx.mats.get('metal_black', 1), 0, 0.05, 0));
  for (let i = 0; i < 10; i++) g.add(mesh(cbox(0.02, 0.6, 0.02), ctx.mats.get('metal_black', 1), -0.8 + i * 0.1, 0.9, 0.51, false));
  g.add(mesh(rod(V(0.8, 1.4, 0), V(0.8, 2.6, 0), 0.06), ctx.mats.get('rust', 1)));
  return g;
}

/** Wooden electric pole with cross arm and insulators. Returns group + insulator anchor points. */
export function electricPole(ctx: WorldCtx, h = 8): { group: THREE.Group; anchors: THREE.Vector3[] } {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, h, 8), ctx.mats.get('concrete_dark', 1), 0, h / 2, 0));
  g.add(mesh(cbox(1.6, 0.1, 0.1), ctx.mats.get('rust', 1), 0, h - 0.4, 0));
  const anchors: THREE.Vector3[] = [];
  for (const x of [-0.7, -0.25, 0.25, 0.7]) {
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 8), ctx.mats.get('ceramic', 1), x, h - 0.29, 0));
    anchors.push(V(x, h - 0.23, 0));
  }
  // Transformer box and tangled service wires.
  g.add(mesh(cbox(0.5, 0.7, 0.35), ctx.mats.get('metal_almirah', 1), 0, h - 2.2, 0.25));
  return { group: g, anchors };
}

/** Bike parking shed with a corrugated tin roof. */
export function bikeShed(ctx: WorldCtx, len: number): THREE.Group {
  const g = new THREE.Group();
  const iron = ctx.mats.get('rust', 1);
  const n = Math.ceil(len / 3) + 1;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len * i) / (n - 1);
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), iron, x, 1.3, -1.2));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), iron, x, 1.15, 1.2));
  }
  // Corrugated roof as a rippled plane.
  const geo = new THREE.PlaneGeometry(len + 0.6, 3.0, Math.round(len * 8), 1);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 40) * 0.02);
  geo.computeVertexNormals();
  normalizeUv(geo, 3);
  const roof = mesh(geo, ctx.mats.get('rust', 2), 0, 2.48, 0);
  roof.rotation.x = -Math.PI / 2 + 0.1;
  (roof.material as THREE.Material).side = THREE.DoubleSide;
  g.add(roof);
  return g;
}
