import * as THREE from 'three';
import type { WorldCtx } from './context';
import { Face, boxGeo, rod } from './geom';
import { Door } from './doors';
import {
  BAY,
  CLEAR_H,
  CORR,
  CWALL,
  FLOOR_H,
  LIFT,
  NBAYS,
  OUTER,
  OUTER_T,
  PART_T,
  ROOF_Y,
  ROOMS,
  ROOM_IN,
  STAIR,
  XMAX,
  bayCX,
  bayX0,
  floorY,
  roomBounds,
  type RoomDef,
} from './layout';
import { cctvCamera, emergencyLight, extinguisher, tubeLight, windowUnit, curtainPanel } from './props/fixtures';
import { circuitForFloor } from '../systems/power';
import { decal, graffiti, label as labelTex, paintedSign } from './textArt';

export interface Opening {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

/**
 * Builds a straight wall with openings. axis 'x' runs along X with thickness on Z (c0..c1);
 * axis 'z' runs along Z with thickness on X. matNeg / matPos texture the faces that look toward
 * −normal / +normal. Adds collision for every solid piece.
 */
export function buildWall(
  ctx: WorldCtx,
  axis: 'x' | 'z',
  c0: number,
  c1: number,
  a0: number,
  a1: number,
  y0: number,
  y1: number,
  openings: Opening[],
  matNeg: string,
  matPos: string,
  vBase: number,
  opts: { collide?: boolean; tileNeg?: number; tilePos?: number; tag?: string } = {},
): void {
  const pieces: { a0: number; a1: number; y0: number; y1: number }[] = [];
  const ops = [...openings].sort((p, q) => p.a0 - q.a0);
  let cur = a0;
  for (const o of ops) {
    if (o.a0 > cur + 1e-4) pieces.push({ a0: cur, a1: o.a0, y0, y1 });
    if (o.y0 > y0 + 1e-4) pieces.push({ a0: o.a0, a1: o.a1, y0, y1: o.y0 });
    if (o.y1 < y1 - 1e-4) pieces.push({ a0: o.a0, a1: o.a1, y0: o.y1, y1 });
    cur = Math.max(cur, o.a1);
  }
  if (a1 > cur + 1e-4) pieces.push({ a0: cur, a1, y0, y1 });
  const mNeg = ctx.mats.get(matNeg, opts.tileNeg);
  const mPos = ctx.mats.get(matPos, opts.tilePos);
  for (const p of pieces) {
    const [x0, x1, z0, z1] = axis === 'x' ? [p.a0, p.a1, c0, c1] : [c0, c1, p.a0, p.a1];
    const negFace = axis === 'x' ? Face.NZ : Face.NX;
    const posFace = axis === 'x' ? Face.PZ : Face.PX;
    const caps = Face.ALL & ~negFace & ~posFace;
    ctx.batch.add(boxGeo(x0, p.y0, z0, x1, p.y1, z1, negFace, vBase), mNeg);
    ctx.batch.add(boxGeo(x0, p.y0, z0, x1, p.y1, z1, posFace | caps, vBase), mPos);
    if (opts.collide !== false) ctx.col.add({ minX: x0, maxX: x1, minY: p.y0, maxY: p.y1, minZ: z0, maxZ: z1, tag: opts.tag ?? 'wall' });
  }
}

function floorQuad(ctx: WorldCtx, x0: number, x1: number, z0: number, z1: number, y: number, mat: string, tile?: number) {
  ctx.batch.add(boxGeo(x0, y - 0.02, z0, x1, y, z1, Face.PY), ctx.mats.get(mat, tile), false, true);
}

function ceilQuad(ctx: WorldCtx, x0: number, x1: number, z0: number, z1: number, y: number) {
  ctx.batch.add(boxGeo(x0, y, z0, x1, y + 0.02, z1, Face.NY), ctx.mats.get('ceiling'), false, true);
}

function slab(ctx: WorldCtx, x0: number, x1: number, z0: number, z1: number, yTop: number, t = 0.2) {
  ctx.col.add({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: yTop - t, maxY: yTop, tag: 'floor', opaque: true });
}

export interface HostelBuild {
  doors: Map<string, Door>;
}

const WIN_W = 1.5;
const WIN_SILL = 0.9;
const WIN_TOP = 2.3;

/** Builds the whole building shell: floors, ceilings, walls, doors, windows, stairs and terrace. */
export function buildHostel(ctx: WorldCtx): HostelBuild {
  const doors = new Map<string, Door>();

  for (let f = 0; f < 3; f++) {
    const L = floorY(f);
    // ---- Slabs (collision) ----
    if (f === 0) slab(ctx, -0.2, XMAX + 0.2, -OUTER - OUTER_T, OUTER + OUTER_T, 0, 0.4);
    else {
      slab(ctx, -0.2, XMAX + 0.2, STAIR.zStart, OUTER + OUTER_T, L);
      slab(ctx, BAY, XMAX + 0.2, -OUTER - OUTER_T, STAIR.zStart, L);
    }
    // ---- Corridor ----
    floorQuad(ctx, 0, XMAX, -CORR, CORR, L, 'floor_terrazzo');
    ceilQuad(ctx, 0, XMAX, -CORR, CORR, L + CLEAR_H);
    // Strip between the corridor and the stair flights.
    floorQuad(ctx, 0, BAY, STAIR.zStart, -CORR, L, 'floor_terrazzo');

    // West end wall (with a window looking out over the side lane).
    buildWall(
      ctx,
      'z',
      -OUTER_T,
      0,
      -OUTER - OUTER_T,
      OUTER + OUTER_T,
      L,
      L + FLOOR_H,
      [{ a0: -0.6, a1: 0.6, y0: L + WIN_SILL, y1: L + WIN_TOP }],
      'facade',
      'wall_corridor',
      L,
    );
    const ww = windowUnit(ctx, 1.2, WIN_TOP - WIN_SILL, OUTER_T, { frame: 'wood_door_green', dirty: true });
    ww.position.set(-OUTER_T / 2, L + (WIN_SILL + WIN_TOP) / 2, 0);
    ww.rotation.y = -Math.PI / 2;
    ctx.batch.addObject(ww);
    // East end wall: balcony door on the second floor, window elsewhere.
    const eastOpen: Opening =
      f === 2 ? { a0: -0.6, a1: 0.6, y0: L, y1: L + 2.2 } : { a0: -0.6, a1: 0.6, y0: L + WIN_SILL, y1: L + WIN_TOP };
    buildWall(ctx, 'z', XMAX, XMAX + OUTER_T, -OUTER - OUTER_T, OUTER + OUTER_T, L, L + FLOOR_H, [eastOpen], 'wall_corridor', 'facade', L);
    if (f !== 2) {
      const ew = windowUnit(ctx, 1.2, WIN_TOP - WIN_SILL, OUTER_T, { frame: 'wood_door_green', dirty: true });
      ew.position.set(XMAX + OUTER_T / 2, L + (WIN_SILL + WIN_TOP) / 2, 0);
      ew.rotation.y = Math.PI / 2;
      ctx.batch.addObject(ew);
    }

    // Corridor lighting, CCTV and fire safety kit.
    for (let b = 0; b < NBAYS; b++) {
      const flaky = (f === 2 && (b === 2 || b === 7)) || (f === 0 && b === 8) ? 0.6 : f === 1 ? 0.8 : 0.06;
      tubeLight(ctx, `corr${f}-${b}`, circuitForFloor(f), f, new THREE.Vector3(bayCX(b), L + CLEAR_H - 0.05, 0), 0, { unstable: flaky });
    }
    emergencyLight(ctx, `em${f}a`, f, new THREE.Vector3(0.6, L + 2.6, 1.18), Math.PI);
    emergencyLight(ctx, `em${f}b`, f, new THREE.Vector3(XMAX - 0.6, L + 2.6, -1.18), 0);
    emergencyLight(ctx, `em${f}c`, f, new THREE.Vector3(bayCX(5), L + 2.6, -1.18), 0);
    const ext = extinguisher(ctx);
    ext.position.set(bayX0(6) + 0.2, L + 0.9, -CORR + 0.09);
    ctx.batch.addObject(ext);
    // CCTV at the east end looking west down the corridor.
    const cam = cctvCamera(ctx);
    cam.position.set(XMAX - 0.12, L + 2.9, 0.9);
    cam.rotation.y = -Math.PI / 2;
    ctx.scene.add(cam);
    ctx.points.set(`cctv-corr${f}`, new THREE.Vector3(XMAX - 0.4, L + 2.7, 0.8));
  }

  // ---- Rooms ----
  for (const r of ROOMS) buildRoomShell(ctx, r, doors);

  buildStairs(ctx);
  buildLiftShaft(ctx);
  buildTerrace(ctx, doors);
  buildGrille(ctx);
  buildBalcony(ctx);
  return { doors };
}

/** Floor, ceiling, corridor wall (with door), partitions, outer wall (with window) for one room. */
function buildRoomShell(ctx: WorldCtx, r: RoomDef, doors: Map<string, Door>): void {
  const L = floorY(r.floor);
  const b = roomBounds(r);
  const isS = r.side === 'S';
  const corrMat = r.kind === 'stairs' ? 'wall_stair' : 'wall_corridor';
  const top = L + CLEAR_H;

  if (r.kind !== 'stairs' && r.kind !== 'lift') {
    floorQuad(ctx, b.x0, b.x1, b.z0, b.z1, L, r.floorMat);
    ceilQuad(ctx, b.x0, b.x1, b.z0, b.z1, top);
  } else if (r.kind === 'stairs' && r.floor === 0) {
    floorQuad(ctx, b.x0, b.x1, b.z0, STAIR.zStart, L, r.floorMat);
  }

  // Corridor wall.
  const cz0 = isS ? CORR : -ROOM_IN;
  const cz1 = isS ? ROOM_IN : -CORR;
  const xs = bayX0(r.bay);
  const xe = bayX0(r.bay + r.bays);
  if (r.kind === 'lift') {
    const ops: Opening[] = [{ a0: LIFT.doorX0, a1: LIFT.doorX1, y0: L, y1: L + 2.1 }];
    buildWall(ctx, 'x', cz0, cz1, xs, xe, L, top, ops, corrMat, 'wall_stair', L);
  } else if (r.kind === 'stairs') {
    // Open to the stairwell; a beam spans the opening.
    buildWall(ctx, 'x', cz0, cz1, xs, xe, L + 2.6, top, [], corrMat, 'wall_stair', L);
  } else if (r.openCorridor) {
    // Lobby: columns instead of a wall.
    for (const x of [xs, xs + BAY, xe]) buildWall(ctx, 'x', cz0, cz1, x - 0.15, x + 0.15, L, top, [], corrMat, corrMat, L);
    buildWall(ctx, 'x', cz0, cz1, xs, xe, L + 2.7, top, [], corrMat, corrMat, L);
  } else {
    const dw = r.doorWidth ?? 0.9;
    const ops: Opening[] = r.door !== null ? [{ a0: xs + r.door, a1: xs + r.door + dw, y0: L, y1: L + 2.1 + 0.055 }] : [];
    buildWall(ctx, 'x', cz0, cz1, xs, xe, L, top, ops, isS ? corrMat : r.wall, isS ? r.wall : corrMat, L);
    if (r.door !== null && r.kind !== 'bathroom') {
      const door = new Door(ctx, {
        id: r.id,
        axis: 'x',
        a: xs + r.door,
        c: (cz0 + cz1) / 2,
        width: dw,
        floorY: L,
        wallT: CWALL,
        swing: isS ? 1 : -1,
        hingeAtEnd: isS ? false : true,
        material: r.doorMat,
        lock: r.lock ?? 'none',
        keyId: r.keyId,
        label: r.label,
        plateSide: isS ? -1 : 1,
        lockedMessage: r.lockedMessage,
        sealPaper: r.lock === 'sealed',
        scratched: r.label === '217',
      });
      doors.set(r.id, door);
    }
  }

  // Partition walls at the room's east edge (west edge handled by the neighbour / end wall).
  if (r.bay + r.bays < NBAYS) {
    const x = xe;
    const z0 = isS ? ROOM_IN : -OUTER;
    const z1 = isS ? OUTER : -ROOM_IN;
    const east = ROOMS.find((o) => o.floor === r.floor && o.side === r.side && o.bay === r.bay + r.bays);
    const ops: Opening[] = [];
    // Security room ↔ lobby: door and a counter window.
    if (r.id === 'security') {
      ops.push({ a0: 2.0, a1: 2.9, y0: L, y1: L + 2.155 });
      ops.push({ a0: 3.5, a1: 4.8, y0: L + 0.95, y1: L + 2.0 });
    }
    // Warden ↔ records: inner door.
    if (r.id === 'warden') ops.push({ a0: 3.9, a1: 4.8, y0: L, y1: L + 2.155 });
    buildWall(ctx, 'z', x - PART_T / 2, x + PART_T / 2, z0, z1, L, top, ops, r.wall, east?.wall ?? r.wall, L);
    if (r.id === 'warden') {
      const d = new Door(ctx, {
        id: 'recordsInner',
        axis: 'z',
        a: 3.9,
        c: x,
        width: 0.9,
        floorY: L,
        wallT: PART_T,
        swing: 1,
        material: 'wood_door_brown',
        lock: 'code',
        label: 'RECORDS',
        plateSide: -1,
        lockedMessage: 'msg.locked',
      });
      doors.set('recordsInner', d);
    }
    if (r.id === 'security') {
      const d = new Door(ctx, {
        id: 'securityLobby',
        axis: 'z',
        a: 2.0,
        c: x,
        width: 0.9,
        floorY: L,
        wallT: PART_T,
        swing: -1,
        material: 'wood_door_blue',
        plateSide: 1,
        openAtStart: 0.8,
      });
      doors.set('securityLobby', d);
    }
  }

  // Outer wall with a window.
  const oz0 = isS ? OUTER : -OUTER - OUTER_T;
  const oz1 = isS ? OUTER + OUTER_T : -OUTER;
  const ops: Opening[] = [];
  const winX = (xs + xe) / 2;
  const isLobby = r.kind === 'lobby';
  const isStair = r.kind === 'stairs';
  if (isLobby) {
    ops.push({ a0: 17.0, a1: 19.0, y0: L, y1: L + 2.6 });
    ops.push({ a0: 14.9, a1: 16.3, y0: L + WIN_SILL, y1: L + WIN_TOP });
    ops.push({ a0: 19.7, a1: 21.1, y0: L + WIN_SILL, y1: L + WIN_TOP });
  } else if (isStair) {
    // Window at the mid landing.
    ops.push({ a0: 0.9, a1: 2.7, y0: L + 1.7 + 0.8, y1: L + 1.7 + 2.0 });
  } else if (r.kind === 'bathroom') {
    ops.push({ a0: winX - 0.6, a1: winX + 0.6, y0: L + 1.7, y1: L + 2.4 });
  } else {
    ops.push({ a0: winX - WIN_W / 2, a1: winX + WIN_W / 2, y0: L + WIN_SILL, y1: L + WIN_TOP });
  }
  const inner = r.kind === 'lift' ? 'wall_stair' : r.wall;
  buildWall(ctx, 'x', oz0, oz1, xs, xe, L, L + FLOOR_H, ops, isS ? inner : 'facade', isS ? 'facade' : inner, L);
  for (const o of ops) {
    if (o.y0 === L) continue; // doors handled elsewhere
    const w = o.a1 - o.a0;
    const h = o.y1 - o.y0;
    const win = windowUnit(ctx, w, h, OUTER_T, {
      frame: r.floor === 1 ? 'wood_door_brown' : 'wood_door_green',
      dirty: r.floor === 1 || r.kind === 'bathroom',
      chajja: r.kind !== 'bathroom',
      shutterOpen: r.label === '203' ? 0.5 : 0,
    });
    win.position.set((o.a0 + o.a1) / 2, (o.y0 + o.y1) / 2, isS ? OUTER + OUTER_T / 2 : -OUTER - OUTER_T / 2);
    if (!isS) win.rotation.y = Math.PI;
    ctx.batch.addObject(win);
    // Locked, unfurnished rooms get a drawn curtain so the facade never shows empty boxes.
    if (r.kind === 'locked' || r.kind === 'lift' || r.kind === 'store') {
      const c = curtainPanel(ctx, w + 0.2, h + 0.15, (r.bay + r.floor) % 2 ? 'curtain' : 'curtain_green');
      c.group.position.set((o.a0 + o.a1) / 2, o.y1 + 0.1, isS ? OUTER - 0.08 : -OUTER + 0.08);
      if (!isS) c.group.rotation.y = Math.PI;
      ctx.batch.addObject(c.group, false);
    }
  }
}

function buildStairs(ctx: WorldCtx): void {
  const S = STAIR;
  const stepM = ctx.mats.get('floor_kota', 1.2);
  const sideM = ctx.mats.get('wall_stair');
  const rail = ctx.mats.getBasic('steel');
  for (let f = 0; f < 3; f++) {
    const L = floorY(f);
    // Flight A (west half, rising north).
    for (let k = 1; k <= S.steps; k++) {
      const top = L + S.riser * k;
      const z1 = S.zStart - S.tread * (k - 1);
      const z0 = k === S.steps ? S.zLanding : S.zStart - S.tread * k;
      ctx.batch.add(boxGeo(S.aX0, top - 0.37, z0, S.aX1, top, z1, Face.PY | Face.PZ | Face.NX | Face.PX, L), stepM);
      ctx.batch.add(boxGeo(S.aX0, top - 0.37, z0, S.aX1, top, z1, Face.NY, L), sideM, false);
      ctx.col.add({ minX: S.aX0, maxX: S.aX1, minY: top - 0.37, maxY: top, minZ: z0, maxZ: z1, tag: 'stairs', opaque: false });
    }
    // Landing.
    const LY = L + S.riser * S.steps;
    ctx.batch.add(boxGeo(S.aX0, LY - 0.2, S.zEnd, S.bX1, LY, S.zLanding, Face.PY | Face.PZ | Face.NY, L), stepM);
    ctx.col.add({
      minX: S.aX0 - 0.05,
      maxX: S.bX1 + 0.05,
      minY: LY - 0.2,
      maxY: LY,
      minZ: S.zEnd,
      maxZ: S.zLanding,
      tag: 'stairs',
      opaque: false,
    });
    // Flight B (east half, rising south).
    for (let j = 1; j <= S.steps; j++) {
      const top = LY + S.riser * j;
      const z0 = S.zLanding + S.tread * (j - 1);
      const z1 = j === S.steps ? S.zStart : S.zLanding + S.tread * j;
      ctx.batch.add(boxGeo(S.bX0, top - 0.37, z0, S.bX1, top, z1, Face.PY | Face.NZ | Face.NX | Face.PX, L), stepM);
      ctx.batch.add(boxGeo(S.bX0, top - 0.37, z0, S.bX1, top, z1, Face.NY, L), sideM, false);
      ctx.col.add({ minX: S.bX0, maxX: S.bX1, minY: top - 0.37, maxY: top, minZ: z0, maxZ: z1, tag: 'stairs', opaque: false });
    }
    // Central wall between flights, with a steel handrail on each side.
    buildWall(ctx, 'z', S.aX1, S.bX0, S.zLanding, S.zStart, L, L + FLOOR_H, [], 'wall_stair', 'wall_stair', L);
    for (const x of [S.aX1 - 0.05, S.bX0 + 0.05]) {
      const up = x < 1.8;
      const za = S.zStart - 0.1;
      const zb = S.zLanding + 0.1;
      const ya = up ? L + 0.9 + 0.17 : L + FLOOR_H + 0.9 - 0.17;
      const yb = up ? LY + 0.9 - 0.17 : LY + 0.9 + 0.17;
      ctx.batch.add(rod(new THREE.Vector3(x, ya, za), new THREE.Vector3(x, yb, zb), 0.022), rail, false);
    }
    // Stair bay partition (east) and north outer wall handled by the room shell; landing light.
    tubeLight(ctx, `stair${f}`, circuitForFloor(f), f, new THREE.Vector3(1.8, LY + 2.9, -5.25), 0, { unstable: f === 1 ? 0.7 : 0.15 });
    emergencyLight(ctx, `emst${f}`, f, new THREE.Vector3(3.4, LY + 2.3, -4.8), -Math.PI / 2);
    const sw = windowUnit(ctx, 1.8, 1.2, OUTER_T, { frame: 'wood_door_green', dirty: true, chajja: true });
    sw.position.set(1.8, LY + 1.4, -OUTER - OUTER_T / 2);
    sw.rotation.y = Math.PI;
    ctx.batch.addObject(sw);
  }
  // Under-stair store on the ground floor (blocks the low space under flight B).
  buildWall(ctx, 'x', S.zStart - 0.15, S.zStart, S.bX0, S.bX1 + 0.08, 0, 1.75, [], 'wall_stair', 'wall_stair', 0);
  ctx.col.add({ minX: S.bX0, maxX: S.bX1, minY: 0, maxY: 1.6, minZ: S.zLanding, maxZ: S.zStart, tag: 'wall' });
  ctx.batch.add(boxGeo(2.3, 0.05, S.zStart + 0.002, 3.1, 1.5, S.zStart + 0.03), ctx.mats.get('wood_door_blue', 1));
  // Stairwell ceiling above the top flight and CCTV on the stairs.
  ceilQuad(ctx, 0, BAY, -OUTER, STAIR.zStart, ROOF_Y + 3.0);
  const cam = cctvCamera(ctx);
  cam.position.set(0.12, floorY(2) + 1.7 + 2.6, -4.6);
  cam.rotation.y = Math.PI / 2;
  ctx.scene.add(cam);
  ctx.points.set('cctv-stairs', new THREE.Vector3(0.35, floorY(2) + 1.7 + 2.4, -4.8));
}

function buildLiftShaft(ctx: WorldCtx): void {
  // Shaft walls run from the ground to the roof landing.
  const t = 0.15;
  const y1 = ROOF_Y + 3;
  const M = 'wall_stair';
  buildWall(ctx, 'z', LIFT.x0 - t, LIFT.x0, LIFT.z0, LIFT.z1 + t, 0, y1, [], M, M, 0, { tag: 'shaft' });
  buildWall(ctx, 'z', LIFT.x1, LIFT.x1 + t, LIFT.z0, LIFT.z1 + t, 0, y1, [], M, M, 0, { tag: 'shaft' });
  buildWall(ctx, 'x', LIFT.z1, LIFT.z1 + t, LIFT.x0, LIFT.x1, 0, y1, [], M, M, 0, { tag: 'shaft' });
  // Front wall between shaft and corridor wall line, with the landing openings.
  for (const L of [0, FLOOR_H, FLOOR_H * 2, ROOF_Y]) {
    buildWall(
      ctx,
      'x',
      CORR + CWALL,
      LIFT.z0,
      LIFT.x0 - t,
      LIFT.x1 + t,
      L,
      L + (L === ROOF_Y ? 3 : FLOOR_H),
      [{ a0: LIFT.doorX0, a1: LIFT.doorX1, y0: L, y1: L + 2.1 }],
      'wall_stair',
      M,
      L,
    );
  }
  // Shaft pit floor and the roof landing slab inside the bricked vestibule.
  slab(ctx, LIFT.x0, LIFT.x1, LIFT.z0, LIFT.z1, -0.3, 0.3);
  // Signs beside each landing door.
  for (const f of [0, 1, 2]) {
    const L = floorY(f);
    const sign = decal(
      labelTex(f === 1 ? 'LIFT OUT OF ORDER' : 'LIFT · MAX 6 PERSONS', 512, 96, '#e2dcc6', f === 1 ? '#8a1010' : '#222', undefined, 34),
      0.5,
      0.1,
    );
    sign.position.set(LIFT.doorX1 + 0.4, L + 1.75, CORR - 0.005);
    sign.rotation.y = Math.PI;
    ctx.scene.add(sign);
  }
}

function buildTerrace(ctx: WorldCtx, doors: Map<string, Door>): void {
  const Y = ROOF_Y;
  // Roof slab (with the stairwell hole) and its ceiling underside for the second floor rooms.
  slab(ctx, -0.2, XMAX + 0.2, STAIR.zStart, OUTER + OUTER_T, Y, 0.2);
  slab(ctx, BAY, XMAX + 0.2, -OUTER - OUTER_T, STAIR.zStart, Y, 0.2);
  floorQuad(ctx, BAY + 0.15, XMAX + 0.2, -OUTER - OUTER_T, OUTER + OUTER_T, Y, 'concrete', 3);
  // Slab edge band.
  buildWall(ctx, 'x', OUTER, OUTER + OUTER_T + 0.05, -0.25, XMAX + 0.25, Y - 0.2, Y, [], 'concrete', 'concrete', Y, { collide: false });
  buildWall(ctx, 'x', -OUTER - OUTER_T - 0.05, -OUTER, -0.25, XMAX + 0.25, Y - 0.2, Y, [], 'concrete', 'concrete', Y, { collide: false });
  // Parapets.
  const P = 1.0;
  buildWall(ctx, 'x', OUTER, OUTER + OUTER_T, BAY + 0.15, XMAX + OUTER_T, Y, Y + P, [], 'concrete', 'facade', Y);
  buildWall(ctx, 'x', -OUTER - OUTER_T, -OUTER, BAY + 0.15, XMAX + OUTER_T, Y, Y + P, [], 'facade', 'concrete', Y);
  buildWall(ctx, 'z', XMAX, XMAX + OUTER_T, -OUTER, OUTER, Y, Y + P, [], 'concrete', 'facade', Y);
  for (const z of [-OUTER - OUTER_T, OUTER]) {
    ctx.batch.add(boxGeo(BAY + 0.15, Y + P, z - 0.03, XMAX + OUTER_T, Y + P + 0.06, z + OUTER_T + 0.03), ctx.mats.get('concrete'));
  }
  // Mumty (stair head room) and lift machine room over bay 0.
  const MT = Y + 3;
  buildWall(ctx, 'z', -OUTER_T, 0, -OUTER - OUTER_T, OUTER + OUTER_T, Y, MT, [], 'facade', 'wall_stair', Y);
  buildWall(ctx, 'x', -OUTER - OUTER_T, -OUTER, -OUTER_T, BAY + 0.15, Y, MT, [], 'facade', 'wall_stair', Y);
  buildWall(ctx, 'x', OUTER, OUTER + OUTER_T, -OUTER_T, BAY + 0.15, Y, MT, [], 'wall_stair', 'facade', Y);
  buildWall(
    ctx,
    'z',
    BAY,
    BAY + 0.15,
    -OUTER,
    OUTER,
    Y,
    MT,
    [
      { a0: -1.15, a1: -0.25, y0: Y, y1: Y + 2.155 },
      { a0: 3.0, a1: 3.9, y0: Y, y1: Y + 2.155 },
    ],
    'wall_stair',
    'facade',
    Y,
  );
  buildWall(
    ctx,
    'x',
    CORR,
    CORR + CWALL,
    0,
    BAY,
    Y,
    MT,
    [{ a0: LIFT.doorX0, a1: LIFT.doorX1, y0: Y, y1: Y + 2.1 }],
    'wall_stair',
    'wall_stair',
    Y,
  );
  ctx.batch.add(
    boxGeo(-OUTER_T, MT, -OUTER - OUTER_T, BAY + 0.15, MT + 0.2, OUTER + OUTER_T, Face.ALL & ~Face.NY),
    ctx.mats.get('concrete'),
  );
  ctx.col.add({ minX: -OUTER_T, maxX: BAY + 0.15, minY: MT, maxY: MT + 0.2, minZ: -OUTER - OUTER_T, maxZ: OUTER + OUTER_T, tag: 'floor' });
  ceilQuad(ctx, 0, BAY, STAIR.zStart, CORR, MT - 0.02);
  floorQuad(ctx, 0, BAY, STAIR.zStart, CORR, Y + 0.001, 'floor_terrazzo');
  // Bricked-up roof landing vestibule in front of the lift doors.
  const bx0 = 0.9;
  const bx1 = 2.4;
  const bz = 0.1;
  buildWall(ctx, 'x', bz, bz + 0.15, bx0, bx1, Y, Y + 2.4, [], 'brick', 'brick', Y, { tag: 'bricks' });
  buildWall(ctx, 'z', bx0 - 0.15, bx0, bz, CORR, Y, Y + 2.4, [], 'wall_stair', 'brick', Y);
  buildWall(ctx, 'z', bx1, bx1 + 0.15, bz, CORR, Y, Y + 2.4, [], 'brick', 'wall_stair', Y);
  ctx.batch.add(boxGeo(bx0 - 0.15, Y + 2.4, bz, bx1 + 0.15, Y + 2.6, CORR, Face.ALL), ctx.mats.get('wall_stair'));
  const warn = decal(graffiti('DO NOT USE', 7, 'rgba(25,25,25,0.85)', 512, 160), 1.2, 0.38, { transparent: true });
  warn.position.set((bx0 + bx1) / 2, Y + 1.7, bz - 0.006);
  warn.rotation.y = Math.PI;
  ctx.scene.add(warn);
  const help = decal(graffiti('HELP', 11, 'rgba(60,8,6,0.9)', 512, 256, 60), 1.1, 0.55, { transparent: true });
  help.position.set((bx0 + bx1) / 2, Y + 1.2, bz + 0.156);
  ctx.scene.add(help);
  ctx.points.set('liftVestibule', new THREE.Vector3((bx0 + bx1) / 2, Y, 0.7));
  // Terrace door from the mumty.
  const td = new Door(ctx, {
    id: 'terrace',
    axis: 'z',
    a: -1.15,
    c: BAY + 0.075,
    width: 0.9,
    floorY: Y,
    wallT: 0.15,
    swing: 1,
    material: 'wood_door_green',
    plateSide: -1,
  });
  doors.set('terrace', td);
  const md = new Door(ctx, {
    id: 'machine',
    axis: 'z',
    a: 3.0,
    c: BAY + 0.075,
    width: 0.9,
    floorY: Y,
    wallT: 0.15,
    swing: 1,
    material: 'wood_door_blue',
    lock: 'jammed',
    lockedMessage: 'msg.rusted',
    plateSide: 1,
  });
  doors.set('machine', md);
  // Terrace lighting: a bulb over the door.
  ctx.points.set('terrace', new THREE.Vector3(8, Y, 0));
}

/** Collapsible iron grille closing off the first floor corridor ("Floor closed for repairs"). */
function buildGrille(ctx: WorldCtx): void {
  const L = floorY(1);
  const g = new THREE.Group();
  const iron = ctx.mats.get('metal_black', 1);
  const x = BAY + 0.1;
  for (let i = 0; i <= 16; i++) {
    const z = -CORR + (2 * CORR * i) / 16;
    g.add(new THREE.Mesh(boxGeo(x - 0.012, L, z - 0.012, x + 0.012, L + 2.3, z + 0.012), iron));
  }
  for (let i = 0; i < 16; i++) {
    const z0 = -CORR + (2 * CORR * i) / 16;
    const z1 = z0 + (2 * CORR) / 16;
    for (const y of [0.4, 1.2, 2.0]) {
      g.add(new THREE.Mesh(rod(new THREE.Vector3(x, L + y - 0.35, z0), new THREE.Vector3(x, L + y + 0.35, z1), 0.008, 4), iron));
      g.add(new THREE.Mesh(rod(new THREE.Vector3(x, L + y + 0.35, z0), new THREE.Vector3(x, L + y - 0.35, z1), 0.008, 4), iron));
    }
  }
  g.add(new THREE.Mesh(boxGeo(x - 0.04, L + 2.3, -CORR, x + 0.04, L + 2.36, CORR), iron));
  ctx.batch.addObject(g);
  ctx.col.add({ minX: x - 0.05, maxX: x + 0.05, minY: L, maxY: L + 2.4, minZ: -CORR, maxZ: CORR, opaque: false, tag: 'grille' });
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.04), ctx.mats.getBasic('brass'));
  lock.position.set(x - 0.05, L + 1.1, 0);
  ctx.scene.add(lock);
  const sign = decal(labelTex('FLOOR CLOSED FOR REPAIRS', 512, 80, '#e8dfc4', '#8a1010', undefined, 32), 0.9, 0.14);
  sign.position.set(x - 0.06, L + 1.6, 0);
  sign.rotation.y = -Math.PI / 2;
  ctx.scene.add(sign);
  // A handwritten note tied to the grille.
  const note = decal(graffiti('stay out', 23, 'rgba(20,20,20,0.9)', 256, 128), 0.3, 0.15, { transparent: true });
  note.position.set(x - 0.07, L + 0.85, 0.5);
  note.rotation.y = -Math.PI / 2;
  ctx.scene.add(note);
}

/** Second floor balcony / laundry area off the east end of the corridor. */
function buildBalcony(ctx: WorldCtx): void {
  const L = floorY(2);
  const x0 = XMAX + OUTER_T;
  const x1 = x0 + 2.8;
  const z0 = -2.6;
  const z1 = 2.6;
  slab(ctx, x0, x1, z0, z1, L, 0.2);
  ctx.batch.add(boxGeo(x0, L - 0.2, z0, x1, L, z1, Face.ALL), ctx.mats.get('concrete'));
  floorQuad(ctx, x0, x1, z0, z1, L + 0.001, 'tiles_floor');
  // Parapet with an iron rail.
  const P = 0.9;
  buildWall(ctx, 'z', x1 - 0.15, x1, z0, z1, L, L + P, [], 'facade', 'facade', L);
  buildWall(ctx, 'x', z0, z0 + 0.15, x0, x1 - 0.15, L, L + P, [], 'facade', 'facade', L);
  buildWall(ctx, 'x', z1 - 0.15, z1, x0, x1 - 0.15, L, L + P, [], 'facade', 'facade', L);
  const rail = ctx.mats.get('rust', 1);
  for (const [a, b] of [
    [new THREE.Vector3(x1 - 0.075, L + P + 0.25, z0), new THREE.Vector3(x1 - 0.075, L + P + 0.25, z1)],
    [new THREE.Vector3(x0, L + P + 0.25, z0 + 0.075), new THREE.Vector3(x1, L + P + 0.25, z0 + 0.075)],
    [new THREE.Vector3(x0, L + P + 0.25, z1 - 0.075), new THREE.Vector3(x1, L + P + 0.25, z1 - 0.075)],
  ] as const) {
    ctx.batch.add(rod(a, b, 0.02), rail);
  }
  ctx.col.add({ minX: x1 - 0.15, maxX: x1 + 0.1, minY: L, maxY: L + 1.3, minZ: z0, maxZ: z1, opaque: false });
  ctx.col.add({ minX: x0, maxX: x1, minY: L, maxY: L + 1.3, minZ: z0 - 0.1, maxZ: z0 + 0.15, opaque: false });
  ctx.col.add({ minX: x0, maxX: x1, minY: L, maxY: L + 1.3, minZ: z1 - 0.15, maxZ: z1 + 0.1, opaque: false });
  ctx.points.set('balcony', new THREE.Vector3((x0 + x1) / 2, L, 0));
  // Signage on the facade above the main entrance.
  const sign = decal(paintedSign(['KAVERI HOSTEL', 'BLOCK — B'], 1024, 320, '#1d2b3a', '#e6dcc0'), 4.2, 1.3);
  sign.position.set(18, floorY(1) + 0.4, OUTER + OUTER_T + 0.02);
  ctx.scene.add(sign);
}
