import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { WorldCtx } from '../context';
import { cbox, normalizeUv, rod } from '../geom';
import { Rng } from '../../core/rng';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = cast;
  me.receiveShadow = true;
  return me;
}

function rbox(w: number, h: number, d: number, r: number, seg = 2): THREE.BufferGeometry {
  return normalizeUv(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), Math.max(w, h, d));
}

/**
 * Hostel iron cot: tubular black frame, welded strip base, a thin coir mattress with a bedsheet,
 * pillow and a folded blanket. Footprint 0.9 × 1.95 m along local +Z. Origin at floor centre.
 */
export function ironBed(ctx: WorldCtx, rng: Rng, opts: { sheet?: string; bare?: boolean; messy?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const frame = ctx.mats.get('metal_black', 1);
  const W = 0.9;
  const L = 1.95;
  const legH = 0.42;
  const r = 0.016;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const h = sz < 0 ? 0.95 : 0.75;
      g.add(mesh(rod(V((sx * W) / 2, 0, (sz * L) / 2), V((sx * W) / 2, h, (sz * L) / 2), r), frame));
    }
  // Head and foot rails with vertical bars.
  for (const sz of [-1, 1]) {
    const z = (sz * L) / 2;
    const top = sz < 0 ? 0.92 : 0.72;
    g.add(mesh(rod(V(-W / 2, top, z), V(W / 2, top, z), r), frame));
    g.add(mesh(rod(V(-W / 2, legH + 0.08, z), V(W / 2, legH + 0.08, z), r * 0.8), frame));
    for (let i = 1; i < 6; i++) {
      const x = -W / 2 + (W * i) / 6;
      g.add(mesh(rod(V(x, legH + 0.08, z), V(x, top, z), r * 0.55, 6), frame));
    }
  }
  // Side angle irons + strip base.
  for (const sx of [-1, 1]) g.add(mesh(cbox(0.035, 0.035, L), frame, (sx * W) / 2, legH, 0));
  for (let i = 0; i < 9; i++) g.add(mesh(cbox(W, 0.008, 0.04), frame, 0, legH + 0.01, -L / 2 + 0.12 + i * 0.215, false));
  if (!opts.bare) {
    const mat = ctx.mats.get('mattress', 1);
    const mattress = mesh(rbox(W - 0.04, 0.1, L - 0.06, 0.04), mat, 0, legH + 0.07, 0);
    g.add(mattress);
    const sheetName = opts.sheet ?? (rng.chance(0.5) ? 'sheet_check' : 'sheet_blue');
    const sheet = ctx.mats.get(sheetName, 1);
    // Bedsheet draped with a crumpled top built from a displaced plane.
    const sg = new THREE.PlaneGeometry(W + 0.12, L - 0.1, 18, 30);
    const pos = sg.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      let zOff = Math.sin(x * 9 + y * 3) * 0.008 + Math.sin(y * 13 + rng.next()) * (opts.messy ? 0.02 : 0.006);
      if (Math.abs(x) > W / 2 - 0.02) zOff -= (Math.abs(x) - (W / 2 - 0.02)) * 2.2;
      pos.setZ(i, zOff);
    }
    sg.computeVertexNormals();
    const sm = mesh(sg, sheet, 0, legH + 0.125, 0.04);
    sm.rotation.x = -Math.PI / 2;
    g.add(sm);
    const pillow = mesh(
      rbox(0.55, 0.11, 0.34, 0.05, 3),
      ctx.mats.get('plastic_white', 1),
      rng.range(-0.05, 0.05),
      legH + 0.18,
      -L / 2 + 0.25,
    );
    pillow.rotation.y = rng.range(-0.15, 0.15);
    pillow.scale.y = 0.9;
    g.add(pillow);
    if (rng.chance(0.7)) {
      const blanket = mesh(
        rbox(0.7, 0.07, 0.42, 0.03),
        ctx.mats.get(sheetName === 'sheet_check' ? 'sheet_blue' : 'sheet_check', 1),
        0,
        legH + 0.17,
        L / 2 - 0.35,
      );
      blanket.rotation.y = rng.range(-0.3, 0.3);
      g.add(blanket);
    }
  }
  return g;
}

/** Wooden study table with a drawer, worn top and a steel handle. 1.0 × 0.6 m, height 0.75. */
export function studyTable(ctx: WorldCtx, rng: Rng, broken = false): THREE.Group {
  const g = new THREE.Group();
  const wood = ctx.mats.get(rng.chance(0.5) ? 'wood_raw' : 'wood_dark', 1);
  const top = mesh(rbox(1.0, 0.035, 0.6, 0.008), wood, 0, 0.74, 0);
  if (broken) top.rotation.z = 0.12;
  g.add(top);
  const legs: [number, number][] = [
    [-0.46, -0.26],
    [0.46, -0.26],
    [-0.46, 0.26],
    [0.46, 0.26],
  ];
  legs.forEach(([x, z], i) => {
    const h = broken && i === 1 ? 0.52 : 0.72;
    g.add(mesh(cbox(0.045, h, 0.045), wood, x, h / 2, z));
  });
  g.add(mesh(cbox(0.92, 0.1, 0.02), wood, 0, 0.66, -0.27));
  // Drawer.
  const drawer = mesh(cbox(0.42, 0.1, 0.5), wood, 0.22, 0.66, 0.02);
  drawer.name = 'drawer';
  g.add(drawer);
  g.add(mesh(cbox(0.1, 0.012, 0.015), ctx.mats.getBasic('steel'), 0.22, 0.66, 0.28, false));
  g.add(mesh(cbox(0.92, 0.03, 0.03), wood, 0, 0.12, 0.26));
  return g;
}

/** Moulded plastic chair (the indestructible kind found in every hostel). */
export function plasticChair(ctx: WorldCtx, color = 'plastic_white'): THREE.Group {
  const g = new THREE.Group();
  const m = ctx.mats.get(color, 1);
  const seat = mesh(rbox(0.44, 0.03, 0.42, 0.012), m, 0, 0.44, 0);
  g.add(seat);
  const back = mesh(rbox(0.42, 0.4, 0.03, 0.012), m, 0, 0.68, -0.2);
  back.rotation.x = -0.14;
  g.add(back);
  // Slots in the back read as the familiar pattern.
  for (let i = 0; i < 3; i++) g.add(mesh(cbox(0.06, 0.18, 0.035), ctx.mats.getBasic('dark'), -0.1 + i * 0.1, 0.72, -0.2, false));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.45, 8), m, sx * 0.19, 0.22, sz * 0.18);
      leg.rotation.z = sx * 0.06;
      leg.rotation.x = -sz * 0.06;
      g.add(leg);
    }
  for (const sx of [-1, 1]) {
    const arm = mesh(rbox(0.04, 0.03, 0.4, 0.01), m, sx * 0.22, 0.62, 0);
    g.add(arm);
    g.add(mesh(cbox(0.03, 0.18, 0.03), m, sx * 0.22, 0.53, 0.17));
  }
  return g;
}

/** Wooden chair with cane-style seat (warden office, common room). */
export function woodChair(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const w = ctx.mats.get('wood_dark', 1);
  g.add(mesh(cbox(0.45, 0.04, 0.44), w, 0, 0.45, 0));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(mesh(cbox(0.035, sz < 0 ? 0.95 : 0.45, 0.035), w, sx * 0.2, sz < 0 ? 0.475 : 0.225, sz * 0.2));
  for (let i = 0; i < 3; i++) g.add(mesh(cbox(0.4, 0.05, 0.02), w, 0, 0.62 + i * 0.12, -0.2));
  return g;
}

/**
 * Steel almirah (two-door cupboard). Returns the body plus the two door pivots so the hide system
 * can swing them. 0.9 × 1.8 × 0.48 m, doors face local +Z.
 */
export function almirah(ctx: WorldCtx, rng: Rng): { group: THREE.Group; doors: THREE.Object3D[] } {
  const g = new THREE.Group();
  const m = ctx.mats.get(rng.chance(0.6) ? 'metal_almirah' : 'metal_cream', 1);
  const W = 0.9;
  const H = 1.8;
  const D = 0.48;
  // Body as five panels so the inside is hollow when the doors open.
  g.add(mesh(cbox(W, H, 0.015), m, 0, H / 2 + 0.06, -D / 2));
  g.add(mesh(cbox(0.015, H, D), m, -W / 2, H / 2 + 0.06, 0));
  g.add(mesh(cbox(0.015, H, D), m, W / 2, H / 2 + 0.06, 0));
  g.add(mesh(cbox(W, 0.015, D), m, 0, H + 0.06, 0));
  g.add(mesh(cbox(W, 0.015, D), m, 0, 0.07, 0));
  g.add(mesh(cbox(W - 0.03, 0.012, D - 0.03), m, 0, 1.25, 0, false));
  // Plinth.
  g.add(mesh(cbox(W - 0.04, 0.06, D - 0.04), ctx.mats.get('metal_black', 1), 0, 0.03, 0));
  // Clothes inside (folded stacks).
  for (let i = 0; i < 3; i++) {
    const c = mesh(
      rbox(0.26, 0.12 + rng.next() * 0.1, 0.3, 0.03),
      ctx.mats.get(rng.pick(['sheet_check', 'sheet_blue', 'curtain']), 1),
      -0.28 + i * 0.28,
      1.33,
      -0.02,
      false,
    );
    g.add(c);
  }
  const doors: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set((side * W) / 2, 0, D / 2);
    const door = mesh(cbox(W / 2 - 0.005, H - 0.02, 0.018), m, (-side * (W / 2)) / 2, H / 2 + 0.06, 0.009);
    pivot.add(door);
    // Pressed panel lines.
    pivot.add(mesh(cbox(W / 2 - 0.12, H - 0.3, 0.006), m, (-side * (W / 2)) / 2, H / 2 + 0.06, 0.02, false));
    const handle = mesh(cbox(0.02, 0.14, 0.03), ctx.mats.getBasic('chrome'), -side * (W / 2 - 0.05), 1.05, 0.03, false);
    pivot.add(handle);
    pivot.userData.side = side;
    pivot.userData.anim = true;
    pivot.userData.rigid = true;
    pivot.userData.dynamic = true;
    pivot.traverse((o) => (o.userData.dynamic = true));
    g.add(pivot);
    doors.push(pivot);
  }
  // Brand plate.
  g.add(mesh(cbox(0.12, 0.03, 0.004), ctx.mats.getBasic('brass'), 0, 1.7, D / 2 + 0.025, false));
  g.userData.rigid = true;
  return { group: g, doors };
}

/** Bucket with a mug — every hostel room has one. */
export function bucket(ctx: WorldCtx, color: string, withMug = true): THREE.Group {
  const g = new THREE.Group();
  const m = ctx.mats.get(color, 1);
  const pts: THREE.Vector2[] = [];
  pts.push(new THREE.Vector2(0, 0));
  pts.push(new THREE.Vector2(0.13, 0));
  pts.push(new THREE.Vector2(0.155, 0.3));
  pts.push(new THREE.Vector2(0.165, 0.31));
  pts.push(new THREE.Vector2(0.15, 0.31));
  pts.push(new THREE.Vector2(0.125, 0.015));
  pts.push(new THREE.Vector2(0, 0.015));
  const body = mesh(new THREE.LatheGeometry(pts, 20), m);
  (body.material as THREE.Material).side = THREE.DoubleSide;
  g.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.006, 5, 16, Math.PI), ctx.mats.getBasic('steel'));
  handle.position.y = 0.3;
  handle.rotation.z = 0.4;
  g.add(handle);
  if (withMug) {
    const mug = new THREE.Group();
    const mp: THREE.Vector2[] = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.055, 0),
      new THREE.Vector2(0.06, 0.11),
      new THREE.Vector2(0.055, 0.11),
      new THREE.Vector2(0.05, 0.01),
      new THREE.Vector2(0, 0.01),
    ];
    mug.add(mesh(new THREE.LatheGeometry(mp, 14), ctx.mats.get(color === 'plastic_blue' ? 'plastic_red' : 'plastic_blue', 1)));
    const h = mesh(new THREE.BoxGeometry(0.015, 0.08, 0.04), ctx.mats.get('plastic_white', 1), 0.07, 0.06, 0);
    mug.add(h);
    mug.position.set(0.22, 0, 0.05);
    g.add(mug);
  }
  return g;
}

/** Hawai chappals (rubber slippers) pair. */
export function slippers(ctx: WorldCtx, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const sole = ctx.mats.get(rng.pick(['plastic_blue', 'plastic_white', 'plastic_black']), 1);
  const strap = ctx.mats.get(rng.pick(['plastic_blue', 'plastic_red', 'plastic_green']), 1);
  for (const sx of [-1, 1]) {
    const s = new THREE.Group();
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, 0.045, 0.12, 0, Math.PI * 2, false, 0);
    const sg = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false });
    sg.rotateX(-Math.PI / 2);
    s.add(mesh(sg, sole, 0, 0, 0, false));
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 4, 10, Math.PI), strap);
    t.position.set(0, 0.015, -0.01);
    t.rotation.x = -0.4;
    s.add(t);
    s.position.set(sx * 0.06 + rng.range(-0.02, 0.02), 0.001, rng.range(-0.04, 0.04));
    s.rotation.y = rng.range(-0.4, 0.4);
    g.add(s);
  }
  return g;
}

/** Stack of engineering textbooks; spines in varied colours. */
export function books(ctx: WorldCtx, rng: Rng, count: number, standing = false): THREE.Group {
  const g = new THREE.Group();
  const mats = ['book_a', 'book_b', 'book_c', 'book_d', 'book_e'];
  let y = 0;
  let x = 0;
  for (let i = 0; i < count; i++) {
    const w = rng.range(0.16, 0.24);
    const h = rng.range(0.025, 0.05);
    const d = rng.range(0.22, 0.28);
    const b = new THREE.Group();
    b.add(mesh(cbox(w, h, d), ctx.mats.getBasic(rng.pick(mats)), 0, 0, 0, false));
    b.add(mesh(cbox(w - 0.01, h * 0.8, d - 0.012), ctx.mats.getBasic('paper'), 0.006, 0, 0, false));
    if (standing) {
      b.rotation.z = Math.PI / 2 + rng.range(-0.08, 0.08);
      b.position.set(x, w / 2, 0);
      x += h + 0.003;
    } else {
      b.position.set(rng.range(-0.02, 0.02), y + h / 2, rng.range(-0.02, 0.02));
      b.rotation.y = rng.range(-0.25, 0.25);
      y += h;
    }
    g.add(b);
  }
  return g;
}

/** Steel tumbler / water bottle. */
export function bottle(ctx: WorldCtx, rng: Rng): THREE.Mesh {
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.035, 0),
    new THREE.Vector2(0.037, 0.2),
    new THREE.Vector2(0.02, 0.24),
    new THREE.Vector2(0.015, 0.27),
    new THREE.Vector2(0, 0.27),
  ];
  const m = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 12),
    rng.chance(0.5) ? ctx.mats.getBasic('steel') : ctx.mats.get('plastic_blue', 1),
  );
  m.castShadow = true;
  return m;
}

/** Tin trunk (pushed under beds). */
export function trunk(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const m = ctx.mats.get('metal_green', 1);
  g.add(mesh(rbox(0.75, 0.28, 0.45, 0.015), m, 0, 0.14, 0));
  g.add(mesh(cbox(0.77, 0.02, 0.47), ctx.mats.get('metal_black', 1), 0, 0.27, 0));
  g.add(mesh(cbox(0.06, 0.07, 0.02), ctx.mats.getBasic('brass'), 0, 0.22, 0.23, false));
  return g;
}

/** Clothes line strung between two points with a few garments hanging off it. */
export function clothesLine(ctx: WorldCtx, a: THREE.Vector3, b: THREE.Vector3, rng: Rng, count: number, outdoor = false): THREE.Group {
  const g = new THREE.Group();
  const line = new THREE.Mesh(rod(a, b, 0.004, 4), ctx.mats.getBasic('cable'));
  g.add(line);
  const cloths = ['sheet_check', 'sheet_blue', 'curtain', 'curtain_green', 'plastic_white', 'ghost_cloth'];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5 + rng.range(-0.2, 0.2)) / count;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * 0.06;
    const w = rng.range(0.3, outdoor ? 0.6 : 0.42);
    const h = rng.range(0.4, outdoor ? 0.9 : 0.6);
    const geo = new THREE.PlaneGeometry(w, h, 6, 8);
    geo.translate(0, -h / 2, 0);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(pos.getX(k) * 18) * 0.02 + Math.sin(pos.getY(k) * 7) * 0.015);
    geo.computeVertexNormals();
    const cloth = new THREE.Mesh(geo, ctx.mats.get(rng.pick(cloths), 1));
    cloth.position.copy(p);
    cloth.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    cloth.castShadow = true;
    cloth.userData.dynamic = true;
    g.add(cloth);
    const phase = rng.next() * 10;
    const amp = outdoor ? 0.25 : 0.04;
    const base = cloth.rotation.x;
    ctx.animated.push({
      update: (_dt, time) => {
        cloth.rotation.x =
          base + Math.sin(time * (outdoor ? 2.3 : 0.7) + phase) * amp + (outdoor ? Math.sin(time * 5.1 + phase) * 0.05 : 0);
      },
    });
  }
  return g;
}

/** Common-room TV on a wall bracket, an old CRT on a table. */
export function crtTv(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const body = ctx.mats.getBasic('black_plastic');
  g.add(mesh(rbox(0.62, 0.48, 0.5, 0.03), body, 0, 0.24, 0));
  const screen = mesh(rbox(0.48, 0.36, 0.02, 0.03), ctx.mats.getBasic('screen_off'), 0, 0.26, 0.25, false);
  screen.name = 'screen';
  screen.userData.keep = true;
  g.add(screen);
  return g;
}

/** Long wooden bench (common room, lobby). */
export function bench(ctx: WorldCtx, len = 1.6): THREE.Group {
  const g = new THREE.Group();
  const w = ctx.mats.get('wood_dark', 1);
  g.add(mesh(cbox(len, 0.05, 0.38), w, 0, 0.44, 0));
  for (const sx of [-1, 1]) {
    g.add(mesh(cbox(0.05, 0.44, 0.34), ctx.mats.get('metal_black', 1), sx * (len / 2 - 0.12), 0.22, 0));
  }
  return g;
}

/** Office table (warden, security) with modesty panel and a glass top. */
export function officeTable(ctx: WorldCtx, w = 1.4, d = 0.75): THREE.Group {
  const g = new THREE.Group();
  const wood = ctx.mats.get('wood_dark', 1);
  g.add(mesh(cbox(w, 0.04, d), wood, 0, 0.76, 0));
  const glass = mesh(cbox(w - 0.02, 0.008, d - 0.02), ctx.mats.getBasic('glass'), 0, 0.785, 0, false);
  g.add(glass);
  for (const sx of [-1, 1]) g.add(mesh(cbox(0.04, 0.74, d - 0.04), wood, sx * (w / 2 - 0.03), 0.37, 0));
  g.add(mesh(cbox(w - 0.08, 0.5, 0.02), wood, 0, 0.45, -d / 2 + 0.05));
  // Drawer pedestal.
  g.add(mesh(cbox(0.4, 0.7, d - 0.06), wood, w / 2 - 0.25, 0.37, 0));
  for (let i = 0; i < 3; i++)
    g.add(mesh(cbox(0.1, 0.012, 0.012), ctx.mats.getBasic('brass'), w / 2 - 0.25, 0.6 - i * 0.2, d / 2 - 0.02, false));
  return g;
}

/** Filing rack with box files (records room). */
export function fileRack(ctx: WorldCtx, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const m = ctx.mats.get('metal_almirah', 1);
  const W = 1.0;
  const H = 2.0;
  const D = 0.4;
  for (const sx of [-1, 1]) g.add(mesh(cbox(0.03, H, D), m, (sx * W) / 2, H / 2, 0));
  for (let s = 0; s < 5; s++) {
    const y = 0.08 + s * 0.45;
    g.add(mesh(cbox(W, 0.02, D), m, 0, y, 0));
    let x = -W / 2 + 0.05;
    while (x < W / 2 - 0.1) {
      const fw = rng.range(0.07, 0.1);
      const fh = rng.range(0.3, 0.36);
      const f = mesh(
        cbox(fw, fh, 0.3),
        ctx.mats.getBasic(rng.pick(['book_a', 'book_b', 'book_d', 'paper'])),
        x + fw / 2,
        y + fh / 2 + 0.01,
        0.02,
        false,
      );
      f.rotation.z = rng.chance(0.15) ? rng.range(-0.25, 0.25) : 0;
      g.add(f);
      x += fw + 0.005;
    }
  }
  return g;
}

/** Loose paper sheets scattered on a surface. */
export function papers(ctx: WorldCtx, rng: Rng, n: number, spread = 0.4): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.297), ctx.mats.getBasic('paper'));
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = rng.range(-1, 1);
    p.position.set(rng.range(-spread, spread), 0.002 + i * 0.0015, rng.range(-spread, spread));
    p.receiveShadow = true;
    g.add(p);
  }
  return g;
}

/** Tea cup with saucer (half-finished cup of chai). */
export function chaiCup(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const cup = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.025, 0),
    new THREE.Vector2(0.038, 0.07),
    new THREE.Vector2(0.035, 0.07),
    new THREE.Vector2(0.022, 0.006),
    new THREE.Vector2(0, 0.006),
  ];
  g.add(mesh(new THREE.LatheGeometry(cup, 14), ctx.mats.get('ceramic', 1), 0, 0.006, 0, false));
  const tea = mesh(
    new THREE.CircleGeometry(0.031, 14),
    new THREE.MeshStandardMaterial({ color: 0x5a3519, roughness: 0.15 }),
    0,
    0.045,
    0,
    false,
  );
  tea.rotation.x = -Math.PI / 2;
  g.add(tea);
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.008, 16), ctx.mats.get('ceramic', 1), 0, 0.003, 0, false));
  return g;
}

/** A bare light bulb holder, a mosquito coil, little touches. */
export function mosquitoCoil(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 120; i++) {
    const a = i * 0.3;
    const r = 0.01 + a * 0.0018;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.005, Math.sin(a) * r));
  }
  g.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.003, 4),
      new THREE.MeshStandardMaterial({ color: 0x1f3a1c, roughness: 0.9 }),
    ),
  );
  return g;
}
