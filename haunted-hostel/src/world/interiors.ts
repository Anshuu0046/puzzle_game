import * as THREE from 'three';
import type { HideSpot, WorldCtx } from './context';
import { markDynamic } from './context';
import { at, cbox, rod, rotAt } from './geom';
import { BAY, CORR, LIFT, OUTER, ROOMS, bayX0, floorY, roomBounds, type RoomDef } from './layout';
import { Rng, hashString } from '../core/rng';
import {
  almirah,
  bench,
  books,
  bottle,
  bucket,
  chaiCup,
  clothesLine,
  crtTv,
  fileRack,
  ironBed,
  mosquitoCoil,
  officeTable,
  papers,
  plasticChair,
  slippers,
  studyTable,
  trunk,
  woodChair,
} from './props/furniture';
import {
  bulbLight,
  ceilingFan,
  cctvCamera,
  curtainPanel,
  distributionBoard,
  noticeBoard,
  pipeRun,
  switchboard,
  tubeLight,
  washbasin,
  waterCooler,
} from './props/fixtures';
import { blackboard, calendar, decal, graffiti, groupPhoto, handprint, label, newspaper, notice, poster } from './textArt';
import { interactive } from './actions';
import { circuitForFloor } from '../systems/power';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Room-local frame: lx across the room, lz from the corridor wall toward the window. */
export class RoomFrame {
  readonly b: ReturnType<typeof roomBounds>;
  readonly w: number;
  readonly d: number;
  readonly north: boolean;
  constructor(
    readonly ctx: WorldCtx,
    readonly r: RoomDef,
  ) {
    this.b = roomBounds(r);
    this.w = this.b.x1 - this.b.x0;
    this.d = this.b.z1 - this.b.z0;
    this.north = r.side === 'N';
  }
  pos(lx: number, lz: number, ly = 0): THREE.Vector3 {
    return this.north ? V(this.b.x1 - lx, this.b.y + ly, this.b.z1 - lz) : V(this.b.x0 + lx, this.b.y + ly, this.b.z0 + lz);
  }
  rot(ry: number): number {
    return this.north ? ry + Math.PI : ry;
  }
  /** Places an object; static objects are baked into the batch, dynamic ones added to the scene. */
  put<T extends THREE.Object3D>(obj: T, lx: number, lz: number, ry = 0, ly = 0, dynamic = false): T {
    obj.position.copy(this.pos(lx, lz, ly));
    obj.rotation.y = this.rot(ry);
    obj.updateMatrixWorld(true);
    if (dynamic) {
      markDynamic(obj);
      this.ctx.scene.add(obj);
    } else this.ctx.batch.addObject(obj);
    return obj;
  }
  /** Wall-mounted decal. wall: 'back' (window wall), 'left', 'right', 'front' (door wall). */
  wallDecal(
    tex: THREE.Texture,
    wall: 'back' | 'left' | 'right' | 'front',
    along: number,
    y: number,
    w: number,
    h: number,
    transparent = false,
    tilt = 0,
  ): THREE.Mesh {
    const m = decal(tex, w, h, { transparent });
    const off = 0.012;
    let lx = along;
    let lz = along;
    let ry = 0;
    if (wall === 'back') {
      lz = this.d - off;
      ry = Math.PI;
    } else if (wall === 'front') {
      lz = off;
      ry = 0;
    } else if (wall === 'left') {
      lx = off;
      ry = Math.PI / 2;
    } else {
      lx = this.w - off;
      ry = -Math.PI / 2;
    }
    if (wall === 'back' || wall === 'front') lx = along;
    else lz = along;
    m.position.copy(this.pos(lx, lz, y));
    m.rotation.set(0, this.rot(ry), tilt);
    this.ctx.scene.add(m);
    return m;
  }
  get floor(): number {
    return this.r.floor;
  }
}

function addCollider(ctx: WorldCtx, obj: THREE.Object3D, pad = 0, opaque = false, tag = 'prop'): void {
  obj.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(obj, true);
  if (bb.isEmpty()) return;
  ctx.col.add({
    minX: bb.min.x - pad,
    maxX: bb.max.x + pad,
    minY: bb.min.y,
    maxY: bb.max.y,
    minZ: bb.min.z - pad,
    maxZ: bb.max.z + pad,
    opaque,
    tag,
  });
}

/** Simple collider box from room-local rect. */
function localBox(f: RoomFrame, lx0: number, lz0: number, lx1: number, lz1: number, h: number, tag = 'prop'): void {
  const a = f.pos(lx0, lz0);
  const b = f.pos(lx1, lz1, h);
  f.ctx.col.add({
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minZ: Math.min(a.z, b.z),
    maxZ: Math.max(a.z, b.z),
    minY: a.y,
    maxY: b.y,
    opaque: false,
    tag,
  });
}

function roomLight(f: RoomFrame, id: string, unstable = 0.08): void {
  // Tube light on the left wall above head height; fan in the middle of the ceiling.
  const p = f.pos(0.08, f.d * 0.55, 2.55);
  tubeLight(f.ctx, id, circuitForFloor(f.floor), f.floor, p, f.rot(Math.PI / 2), { unstable });
  const sb = switchboard(f.ctx, 4);
  f.put(sb, 1.45, 0.02, 0, 1.25, true);
}

function fan(f: RoomFrame, lx: number, lz: number): THREE.Group {
  return ceilingFan(f.ctx, f.pos(lx, lz, 3.2), circuitForFloor(f.floor));
}

/** Registers an almirah as a hide spot. */
function almirahHide(f: RoomFrame, id: string, lx: number, lz: number, ry: number, rng: Rng): void {
  const a = almirah(f.ctx, rng);
  f.put(a.group, lx, lz, ry, 0, true);
  addCollider(f.ctx, a.group, 0, false, 'almirah');
  const face = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.rot(ry));
  const center = f.pos(lx, lz);
  const spot: HideSpot = {
    id,
    kind: 'almirah',
    cam: center
      .clone()
      .add(new THREE.Vector3(0, 1.45, 0))
      .addScaledVector(face, -0.02),
    yaw: Math.atan2(face.x, face.z) + Math.PI,
    exit: center.clone().addScaledVector(face, 0.75),
    inspect: center.clone().addScaledVector(face, 0.9),
    parts: a.doors,
    floor: f.floor,
  };
  f.ctx.hideSpots.push(spot);
  interactive(f.ctx, `hide:${id}`, a.group, [0.9, 1.8, 0.6], { prompt: 'hide' }, [0, 0.95, 0.05]);
}

function bedHide(f: RoomFrame, id: string, bed: THREE.Object3D, lx: number, lz: number, ry: number): void {
  const center = f.pos(lx, lz);
  const side = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.rot(ry));
  const along = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.rot(ry));
  f.ctx.hideSpots.push({
    id,
    kind: 'bed',
    cam: center
      .clone()
      .add(new THREE.Vector3(0, 0.22, 0))
      .addScaledVector(side, 0.1),
    yaw: Math.atan2(side.x, side.z) + Math.PI,
    exit: center.clone().addScaledVector(side, 0.95),
    inspect: center.clone().addScaledVector(side, 0.9).addScaledVector(along, 0.3),
    parts: [],
    floor: f.floor,
  });
  interactive(f.ctx, `hide:${id}`, bed, [0.95, 0.5, 1.9], { prompt: 'hideUnder' }, [0, 0.25, 0]);
}

/**
 * A lived-in two-seater dorm room. Variation comes from a per-room RNG and the `style` options so
 * no two rooms share the same arrangement.
 */
function dormRoom(
  f: RoomFrame,
  opts: { messy?: number; variant: number; posters?: number; bare?: boolean; light?: number; hideBed?: boolean; noFan?: boolean },
): {
  bedA: THREE.Group;
  bedB: THREE.Group;
  tableA: THREE.Group;
} {
  const ctx = f.ctx;
  const rng = new Rng(hashString(f.r.id));
  const { w, d } = f;
  const v = opts.variant % 3;
  roomLight(f, `light-${f.r.id}`, opts.light ?? 0.08);
  if (!opts.noFan) fan(f, w / 2, d / 2);
  // Beds.
  const bedA = ironBed(ctx, rng, { messy: (opts.messy ?? 0) > 0.5, bare: opts.bare });
  const bedB = ironBed(ctx, rng, { messy: (opts.messy ?? 0) > 0.3, bare: opts.bare });
  const bedAPos: [number, number, number] = v === 2 ? [w - 0.52, 2.15, 0] : [w - 0.52, 1.25, 0];
  const bedBPos: [number, number, number] = v === 1 ? [w / 2 - 0.25, d - 0.52, Math.PI / 2] : [0.52, 2.95, 0];
  f.put(bedA, bedAPos[0], bedAPos[1], bedAPos[2], 0, true);
  f.put(bedB, bedBPos[0], bedBPos[1], bedBPos[2], 0, true);
  addCollider(ctx, bedA, -0.05, false, 'bed');
  addCollider(ctx, bedB, -0.05, false, 'bed');
  if (opts.hideBed !== false) bedHide(f, `${f.r.id}-bedA`, bedA, bedAPos[0], bedAPos[1], bedAPos[2]);
  // Study tables + chairs.
  const tableA = studyTable(ctx, rng);
  const tA: [number, number, number] = v === 1 ? [0.38, 2.0, Math.PI / 2] : [w / 2 + 0.45, d - 0.36, Math.PI];
  f.put(tableA, tA[0], tA[1], tA[2]);
  addCollider(ctx, tableA, 0);
  const chairA = plasticChair(ctx, rng.pick(['plastic_white', 'plastic_red', 'plastic_blue', 'plastic_green']));
  f.put(
    chairA,
    tA[0] + (v === 1 ? 0.55 : 0.1),
    tA[1] - (v === 1 ? 0 : 0.6),
    v === 1 ? -Math.PI / 2 + rng.range(-0.3, 0.3) : rng.range(-0.4, 0.4),
  );
  addCollider(ctx, chairA, -0.08);
  const tableB = studyTable(ctx, rng);
  const tB: [number, number, number] = v === 2 ? [0.38, 1.9, Math.PI / 2] : [w - 0.38, d - 0.9, -Math.PI / 2];
  f.put(tableB, tB[0], tB[1], tB[2]);
  addCollider(ctx, tableB, 0);
  // Things on the tables.
  const bk = books(ctx, rng, rng.int(3, 7));
  f.put(bk, tA[0] + (v === 1 ? 0 : -0.25), tA[1], tA[2] + 0.3, 0.76);
  const bk2 = books(ctx, rng, rng.int(5, 9), true);
  f.put(bk2, tB[0], tB[1] + (v === 2 ? -0.3 : 0.25), tB[2], 0.76);
  f.put(bottle(ctx, rng), tA[0] + 0.15, tA[1] + 0.1, 0, 0.76);
  // Almirah (hide spot).
  almirahHide(f, `${f.r.id}-almirah`, v === 2 ? w - 0.3 : 1.85, v === 2 ? 0.75 : 0.3 + 0.01, v === 2 ? -Math.PI / 2 : 0, rng);
  // Window curtains.
  const cur = curtainPanel(ctx, 1.7, 1.55, rng.chance(0.5) ? 'curtain' : 'curtain_green');
  f.put(cur.group, w / 2, d - 0.1, Math.PI, 2.42, true);
  // Floor clutter: bucket, slippers, trunk under bed, clothes line.
  f.put(bucket(ctx, rng.pick(['plastic_red', 'plastic_blue', 'plastic_green'])), rng.range(0.4, 0.8), rng.range(0.5, 0.9), rng.range(0, 6));
  f.put(slippers(ctx, rng), 1.6, 0.6, rng.range(-0.5, 0.5));
  f.put(trunk(ctx), bedBPos[0] + (v === 1 ? 0 : 0), bedBPos[1] + (v === 1 ? -0.1 : 0.2), bedBPos[2] + Math.PI / 2);
  const line = clothesLine(ctx, f.pos(0.05, d * 0.7, 2.2), f.pos(w - 0.05, d * 0.66, 2.25), rng, rng.int(2, 4));
  markDynamic(line);
  ctx.scene.add(line);
  // Posters / wall art.
  const pc = opts.posters ?? rng.int(1, 3);
  for (let i = 0; i < pc; i++) {
    const wall = i % 2 === 0 ? 'left' : 'right';
    f.wallDecal(poster(rng.int(0, 4), hashString(f.r.id) + i), wall, 1.0 + i * 1.1, 1.75, 0.42, 0.59, true, rng.range(-0.04, 0.04));
  }
  // Clothes hanging on a nail behind the door, bags.
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), ctx.mats.get(rng.pick(['curtain', 'sheet_blue', 'plastic_black']), 1));
  bag.scale.set(1.1, 1.3, 0.6);
  f.put(bag, 0.05 + 0.2, 1.4, Math.PI / 2, 1.5);
  if ((opts.messy ?? 0) > 0.3) {
    const p = papers(ctx, rng, rng.int(3, 8), 0.6);
    f.put(p, w / 2, d / 2, 0, 0.003);
  }
  return { bedA, bedB, tableA };
}

/** Furnishes every accessible room. */
export function buildInteriors(ctx: WorldCtx): void {
  for (const r of ROOMS) {
    const f = new RoomFrame(ctx, r);
    switch (r.kind) {
      case 'dorm':
        furnishDorm(f);
        break;
      case 'security':
        securityRoom(f);
        break;
      case 'lobby':
        lobby(f);
        break;
      case 'warden':
        wardenOffice(f);
        break;
      case 'records':
        recordsRoom(f);
        break;
      case 'common':
        commonRoom(f);
        break;
      case 'electrical':
        electricalRoom(f);
        break;
      case 'bathroom':
        bathroom(f);
        break;
      case 'study':
        studyRoom(f);
        break;
      default:
        break;
    }
  }
  corridorDressing(ctx);
}

function furnishDorm(f: RoomFrame): void {
  const ctx = f.ctx;
  const label = f.r.label;
  const rng = new Rng(hashString(`${label}x`));
  switch (label) {
    case '201': {
      dormRoom(f, { messy: 0.9, variant: 0, posters: 3 });
      // Cricket bat leaning against the wall, Maggi packets, half-finished chai.
      const bat = new THREE.Group();
      bat.add(new THREE.Mesh(cbox(0.1, 0.55, 0.035), ctx.mats.get('wood_raw', 1)));
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 8), ctx.mats.getBasic('black_plastic'));
      handle.position.y = 0.42;
      bat.add(handle);
      bat.rotation.z = 0.25;
      f.put(bat, 0.1, 1.9, Math.PI / 2, 0.32);
      f.put(chaiCup(ctx), f.w / 2 + 0.6, f.d - 0.3, 0, 0.76);
      f.put(mosquitoCoil(), 1.3, 2.2, 0, 0.001);
      ctx.points.set('room201', f.pos(1.5, 2));
      break;
    }
    case '203': {
      dormRoom(f, { messy: 0.2, variant: 1, light: 0.5 });
      // Wet footprint trail from the open window to the almirah.
      const fp = footprintTrail(ctx, rng, f.pos(f.w / 2, f.d - 0.3), f.pos(1.85, 0.8), 9);
      ctx.scene.add(fp);
      ctx.objects.set('footprints203', fp);
      // A hide spot behind the long curtain.
      const cur = curtainPanel(ctx, 1.2, 2.3, 'curtain');
      f.put(cur.group, f.w - 0.62, f.d - 0.32, Math.PI, 2.45, true);
      ctx.objects.set('curtain203', cur.cloth);
      const c = f.pos(f.w - 0.62, f.d - 0.15);
      ctx.hideSpots.push({
        id: '203-curtain',
        kind: 'curtain',
        cam: c.clone().setY(c.y + 1.5),
        yaw: f.rot(0),
        exit: f.pos(f.w - 0.7, f.d - 0.9),
        inspect: f.pos(f.w - 0.7, f.d - 1.0),
        parts: [cur.cloth],
        floor: 2,
      });
      interactive(ctx, 'hide:203-curtain', cur.group, [1.0, 1.8, 0.3], { prompt: 'hideBehind' }, [0, -1.2, 0]);
      ctx.emitters.push({ id: 'rain203', sound: 'rainWindow', pos: f.pos(f.w / 2, f.d, 1.6), volume: 0.6, active: () => true });
      break;
    }
    case '207': {
      const r = dormRoom(f, { messy: 0.1, variant: 2, posters: 0, light: 0.9 });
      void r;
      // A chair facing the wall and the wall covered in "217".
      const ch = woodChair(ctx);
      f.put(ch, 0.45, 1.2, -Math.PI / 2);
      addCollider(ctx, ch, -0.05);
      for (let i = 0; i < 26; i++) {
        const t = graffiti('217', 400 + i, `rgba(25,25,25,${rng.range(0.4, 0.9)})`, 256, 128);
        f.wallDecal(
          t,
          'left',
          rng.range(0.5, 2.4),
          rng.range(0.9, 2.2),
          rng.range(0.2, 0.4),
          rng.range(0.1, 0.2),
          true,
          rng.range(-0.3, 0.3),
        );
      }
      f.wallDecal(graffiti('SHE NEVER LEFT', 4, 'rgba(25,25,25,0.85)', 1024, 200), 'left', 1.5, 2.5, 1.6, 0.31, true);
      ctx.points.set('room207', f.pos(1.5, 2));
      break;
    }
    case '212': {
      dormRoom(f, { messy: 0.4, variant: 0 });
      // Transistor radio hissing static on the table; the fan turns with no power.
      const radio = new THREE.Group();
      radio.add(new THREE.Mesh(cbox(0.26, 0.15, 0.08), ctx.mats.getBasic('black_plastic')));
      const grille = new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), ctx.mats.getBasic('steel'));
      grille.position.set(-0.06, 0, 0.041);
      radio.add(grille);
      f.put(radio, f.w / 2 + 0.3, f.d - 0.35, Math.PI, 0.83, true);
      ctx.emitters.push({
        id: 'radio212',
        sound: 'radioStatic',
        pos: f.pos(f.w / 2 + 0.3, f.d - 0.35, 0.9),
        volume: 0.5,
        active: () => true,
      });
      interactive(ctx, 'radio212', radio, [0.3, 0.2, 0.15], { prompt: 'inspect', inspect: 'inspect.radio' }, [0, 0, 0]);
      const battery = batteryPickup(ctx);
      f.put(battery, f.w - 0.38, f.d - 1.0, 0, 0.77, true);
      interactive(ctx, 'battery_212', battery, [0.15, 0.1, 0.15], { prompt: 'take' }, [0, 0.03, 0]);
      break;
    }
    case '214': {
      const r = dormRoom(f, { messy: 0.25, variant: 1, posters: 2 });
      // Your own desk: laptop, photo with friends, phone charger.
      const laptop = new THREE.Group();
      laptop.add(new THREE.Mesh(cbox(0.34, 0.018, 0.24), ctx.mats.getBasic('black_plastic')));
      const lid = new THREE.Mesh(cbox(0.34, 0.24, 0.01), ctx.mats.getBasic('black_plastic'));
      lid.position.set(0, 0.12, -0.12);
      lid.rotation.x = -0.25;
      laptop.add(lid);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), ctx.mats.emissive(0x2a3a5a, 0.4));
      scr.position.set(0, 0.12, -0.113);
      scr.rotation.x = -0.25;
      laptop.add(scr);
      f.put(laptop, 0.38, 2.0, Math.PI / 2, 0.76);
      const photo = groupPhoto(5, -1, 4, false);
      const frame = decal(photo, 0.22, 0.155);
      frame.position.copy(f.pos(0.4, 2.35, 0.86));
      frame.rotation.set(-0.3, f.rot(Math.PI / 2), 0, 'YXZ');
      ctx.scene.add(frame);
      const save = new THREE.Group();
      save.add(new THREE.Mesh(cbox(0.21, 0.02, 0.29), ctx.mats.getBasic('book_a')));
      f.put(save, 0.38, 1.65, Math.PI / 2 + 0.2, 0.77, true);
      interactive(ctx, 'journal214', save, [0.3, 0.15, 0.35], { prompt: 'save' }, [0, 0.03, 0]);
      ctx.points.set('room214', f.pos(1.6, 1.6));
      ctx.points.set('room214door', f.pos(0.72, -0.8));
      void r;
      break;
    }
    case '216': {
      dormRoom(f, { messy: 0.5, variant: 2, posters: 1 });
      const n = new THREE.Group();
      n.add(new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.15), ctx.mats.getBasic('paper')));
      n.children[0]!.rotation.x = -Math.PI / 2;
      f.put(n, 0.38, 1.75, 0.3, 0.765, true);
      interactive(ctx, 'note216', n, [0.3, 0.1, 0.3], { prompt: 'read' }, [0, 0.02, 0]);
      // Wall mirror (the apparition shows up in it in chapter 3).
      const mirrorPos = f.pos(f.w - 0.02, 2.2, 1.55);
      ctx.points.set('mirror216', mirrorPos);
      ctx.points.set('room216', f.pos(1.4, 1.8));
      break;
    }
    case '218': {
      const r = dormRoom(f, { messy: 0, variant: 0, bare: false, light: 0.3 });
      // This bed shifts on its own when you pass.
      ctx.objects.set('bed218', r.bedA);
      ctx.points.set('room218', f.pos(1.2, 1.6));
      break;
    }
    case '217':
      room217(f);
      break;
    default:
      dormRoom(f, { variant: rng.int(0, 2) });
  }
}

/** Sealed Room 217: dust, a stained bare mattress, broken table, her things. */
function room217(f: RoomFrame): void {
  const ctx = f.ctx;
  const rng = new Rng(217);
  roomLight(f, 'light-217', 0.95);
  const fanG = fan(f, f.w / 2, f.d / 2);
  ctx.objects.set('fan217', fanG);
  const bed = ironBed(ctx, rng, { bare: true });
  f.put(bed, f.w - 0.52, 2.0, 0, 0, true);
  addCollider(ctx, bed, -0.05, false, 'bed');
  // Stained mattress with an indentation as if someone were lying on it.
  const mGeo = new THREE.BoxGeometry(0.84, 0.1, 1.86, 10, 1, 24);
  const pos = mGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const body =
        Math.exp(-(x * x) / 0.03) * (z > -0.7 && z < 0.7 ? 1 : 0.2) + Math.exp(-((x * x) / 0.02 + ((z + 0.75) * (z + 0.75)) / 0.02)) * 0.8;
      pos.setY(i, pos.getY(i) - body * 0.05);
    }
  }
  mGeo.computeVertexNormals();
  const mat = new THREE.Mesh(mGeo, ctx.mats.get('mattress', 1));
  mat.castShadow = mat.receiveShadow = true;
  f.put(mat, f.w - 0.52, 2.0, 0, 0.48, true);
  ctx.objects.set('bed217', bed);
  const stain = decal(handprint(5), 0.5, 0.5, { transparent: true });
  stain.rotation.x = -Math.PI / 2;
  stain.position.copy(f.pos(f.w - 0.5, 2.3, 0.535));
  ctx.scene.add(stain);
  bedHide(f, '217-bed', bed, f.w - 0.52, 2.0, 0);
  // Broken study table with textbooks and the diary.
  const table = studyTable(ctx, rng, true);
  f.put(table, f.w / 2 - 0.2, f.d - 0.36, Math.PI);
  addCollider(ctx, table);
  const bk = books(ctx, rng, 6);
  f.put(bk, f.w / 2 - 0.5, f.d - 0.3, 0.2, 0.0);
  const bk2 = books(ctx, rng, 4);
  f.put(bk2, f.w / 2 + 0.1, f.d - 0.4, -0.3, 0.74);
  // Diary (blood-stained notebook).
  const diary = new THREE.Group();
  const cover = new THREE.Mesh(cbox(0.16, 0.025, 0.22), new THREE.MeshStandardMaterial({ color: 0x3a1610, roughness: 0.6 }));
  diary.add(cover);
  const blood = decal(handprint(9), 0.12, 0.12, { transparent: true });
  blood.rotation.x = -Math.PI / 2;
  blood.position.y = 0.014;
  diary.add(blood);
  f.put(diary, f.w / 2 - 0.3, f.d - 0.38, 0.4, 0.84, true);
  interactive(ctx, 'diary', diary, [0.25, 0.12, 0.3], { prompt: 'take' }, [0, 0.03, 0]);
  // College ID card on the floor under the table.
  const id = new THREE.Group();
  const card = new THREE.Mesh(cbox(0.054, 0.002, 0.086), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.4 }));
  id.add(card);
  const lanyard = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.004, 4, 20), new THREE.MeshStandardMaterial({ color: 0x1d3a6b }));
  lanyard.rotation.x = Math.PI / 2;
  lanyard.position.z = -0.14;
  id.add(lanyard);
  f.put(id, f.w / 2 + 0.3, f.d - 0.7, 1.2, 0.003, true);
  interactive(ctx, 'id_card', id, [0.2, 0.08, 0.3], { prompt: 'take' }, [0, 0.03, 0]);
  // Calendar stopped at November 2016, the 14th circled.
  interactive(
    ctx,
    'calendar217',
    f.wallDecal(calendar('NOVEMBER', 2016, 2, 30, 14, 217), 'left', 2.6, 1.7, 0.42, 0.56, false, 0.03),
    [0.45, 0.6, 0.1],
    { prompt: 'inspect', inspect: 'inspect.calendar217' },
    [0, 0, 0],
  );
  // Photographs pinned above the bed: a group photo with her face scratched out.
  const photo = f.wallDecal(groupPhoto(11, 3), 'right', 2.0, 1.5, 0.5, 0.35);
  photo.rotation.z = 0.03;
  const photoPick = new THREE.Group();
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.09), decal(groupPhoto(13, 1, 4), 0.13, 0.09).material as THREE.Material);
  pm.rotation.x = -Math.PI / 2;
  photoPick.add(pm);
  f.put(photoPick, f.w / 2 - 0.05, f.d - 0.3, -0.5, 0.79, true);
  interactive(ctx, 'photo', photoPick, [0.2, 0.08, 0.2], { prompt: 'take' }, [0, 0.02, 0]);
  // Handwritten notes pinned to the wall.
  for (let i = 0; i < 6; i++) {
    const t = notice(
      {
        title: '',
        body: '',
        seed: 900 + i,
        paper: '#e9e2c9',
        hand: ['why won’t he listen', 'lift alarm — 2:07', 'they know', 'Nov 14', 'GATE: 47 days', 'tell Amma'][i],
      },
      256,
      256,
    );
    f.wallDecal(t, 'back', 0.4 + i * 0.13 + (i > 2 ? 1.8 : 0), 1.5 + (i % 2) * 0.28, 0.2, 0.2, false, rng.range(-0.2, 0.2));
  }
  interactive(
    ctx,
    'notes217',
    f.wallDecal(
      notice({ title: '', body: '', seed: 999, paper: '#e9e2c9', hand: 'don’t trust R.K.' }, 256, 256),
      'back',
      0.9,
      1.15,
      0.22,
      0.22,
    ),
    [0.25, 0.25, 0.1],
    { prompt: 'read' },
    [0, 0, 0],
  );
  // Dust: cobwebs in the corners and a grey film on the floor.
  for (const [lx, lz] of [
    [0.05, 0.05],
    [f.w - 0.05, f.d - 0.05],
    [0.05, f.d - 0.05],
  ] as const) {
    const web = cobweb(ctx, rng);
    f.put(web, lx, lz, rng.range(0, 6), 3.0, true);
  }
  const almirahR = new Rng(2170);
  almirahHide(f, '217-almirah', 1.8, 0.31, 0, almirahR);
  ctx.points.set('room217', f.pos(1.5, 1.7));
  ctx.points.set('ritual217', f.pos(f.w / 2 - 0.2, f.d - 0.36, 0.78));
  // CCTV camera installed after the incident.
  const cam = cctvCamera(ctx);
  f.put(cam, 0.1, f.d - 0.2, Math.PI / 2 + 0.6, 2.9, true);
  ctx.points.set('cctv-217', f.pos(0.35, f.d - 0.4, 2.7));
  // Ritual table spot: interacting there places her things (bound by the story).
  const ritual = new THREE.Group();
  f.put(ritual, f.w / 2 - 0.2, f.d - 0.36, 0, 0.78, true);
  interactive(ctx, 'ritual', ritual, [0.9, 0.2, 0.5], { prompt: 'inspect', inspect: 'inspect.table217' }, [0, 0.05, 0]);
}

function cobweb(ctx: WorldCtx, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.LineBasicMaterial({ color: 0xbcb8ae, transparent: true, opacity: 0.35 });
  const pts: THREE.Vector3[] = [];
  const spokes = 7;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 0.5;
    pts.push(V(0, 0, 0), V(Math.cos(a) * 0.4, -rng.range(0.05, 0.15), Math.sin(a) * 0.4));
  }
  for (let r = 1; r < 5; r++) {
    for (let i = 0; i < spokes - 1; i++) {
      const a0 = (i / spokes) * Math.PI * 0.5;
      const a1 = ((i + 1) / spokes) * Math.PI * 0.5;
      const rr = r * 0.08;
      pts.push(V(Math.cos(a0) * rr, -0.03 * r, Math.sin(a0) * rr), V(Math.cos(a1) * rr, -0.03 * r, Math.sin(a1) * rr));
    }
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), m));
  void ctx;
  return g;
}

function footprintTrail(ctx: WorldCtx, rng: Rng, from: THREE.Vector3, to: THREE.Vector3, n: number): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, 0.045, 0.11, 0, Math.PI * 2, false, 0);
  const geo = new THREE.ShapeGeometry(shape, 10);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0c0e,
    roughness: 0.05,
    metalness: 0.2,
    transparent: true,
    opacity: 0.7,
    envMap: ctx.mats.envMap,
    envMapIntensity: 1.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const dir = to.clone().sub(from);
  const yaw = Math.atan2(dir.x, dir.z);
  const side = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = from
      .clone()
      .lerp(to, t)
      .addScaledVector(side, i % 2 ? 0.09 : -0.09);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.set(-Math.PI / 2, 0, -yaw + rng.range(-0.1, 0.1));
    m.position.set(p.x, p.y + 0.004, p.z);
    g.add(m);
  }
  markDynamic(g);
  return g;
}

/** AA battery pack pickup. */
export function batteryPickup(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 10), ctx.mats.getBasic(i ? 'bike_red' : 'bike_black'));
    b.rotation.z = Math.PI / 2;
    b.position.set(0, 0.008, i * 0.016);
    g.add(b);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Ground floor rooms
// ---------------------------------------------------------------------------------------------

function securityRoom(f: RoomFrame): void {
  const ctx = f.ctx;
  const rng = new Rng(31);
  // Battery-backed bulb so the room is dimly lit even before power is restored.
  bulbLight(ctx, 'light-security', 'BATTERY', 0, f.pos(f.w / 2, f.d / 2, 2.9), 0xffc070, 3.2, 0.25);
  fan(f, f.w / 2, f.d / 2 + 0.6);
  // Desk against the lobby window with the CCTV monitors.
  const desk = officeTable(ctx, 1.6, 0.7);
  f.put(desk, f.w - 0.4, f.d - 0.95, -Math.PI / 2);
  addCollider(ctx, desk);
  const monitor = crtTv(ctx);
  monitor.scale.setScalar(0.85);
  f.put(monitor, f.w - 0.35, f.d - 0.75, -Math.PI / 2, 0.79, true);
  interactive(ctx, 'cctv', monitor, [0.6, 0.5, 0.6], { prompt: 'view' }, [0, 0.25, 0]);
  ctx.objects.set('cctvScreen', monitor.getObjectByName('screen')!);
  const dvr = new THREE.Mesh(cbox(0.36, 0.06, 0.28), ctx.mats.getBasic('black_plastic'));
  f.put(dvr, f.w - 0.35, f.d - 1.4, -Math.PI / 2, 0.81);
  // Hostel register on the desk.
  const reg = new THREE.Group();
  reg.add(new THREE.Mesh(cbox(0.42, 0.04, 0.3), ctx.mats.getBasic('book_b')));
  const page = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), ctx.mats.getBasic('paper'));
  page.rotation.x = -Math.PI / 2;
  page.position.y = 0.021;
  reg.add(page);
  f.put(reg, f.w - 0.5, f.d - 1.4, -Math.PI / 2 + 0.1, 0.8, true);
  interactive(ctx, 'register', reg, [0.45, 0.12, 0.35], { prompt: 'read' }, [0, 0.03, 0]);
  // Breaker instructions note taped on the wall above the desk.
  interactive(
    ctx,
    'note_breakers',
    f.wallDecal(
      notice({ title: 'POWER TRIP?', body: '', seed: 12, paper: '#efe6c7', hand: 'MAIN, then 3 → 1 → 2' }, 384, 384),
      'right',
      f.d - 1.6,
      1.55,
      0.3,
      0.3,
      false,
      0.04,
    ),
    [0.3, 0.3, 0.1],
    { prompt: 'read' },
    [0, 0, 0],
  );
  // Key board: plywood with hooks and tagged keys.
  const board = new THREE.Group();
  board.add(new THREE.Mesh(cbox(0.7, 0.5, 0.02), ctx.mats.get('wood_raw', 1)));
  for (let r2 = 0; r2 < 4; r2++)
    for (let c = 0; c < 6; c++) {
      const hook = new THREE.Mesh(cbox(0.008, 0.008, 0.03), ctx.mats.getBasic('brass'));
      hook.position.set(-0.28 + c * 0.11, 0.17 - r2 * 0.11, 0.02);
      board.add(hook);
      if (rng.chance(0.55)) {
        const key = new THREE.Mesh(cbox(0.012, 0.05, 0.003), ctx.mats.getBasic('brass'));
        key.position.set(-0.28 + c * 0.11, 0.135 - r2 * 0.11, 0.025);
        board.add(key);
        const tag = new THREE.Mesh(cbox(0.03, 0.02, 0.002), ctx.mats.getBasic(rng.chance(0.5) ? 'paper' : 'bike_red'));
        tag.position.set(-0.28 + c * 0.11, 0.1 - r2 * 0.11, 0.025);
        board.add(tag);
      }
    }
  f.put(board, 0.02, 1.4, Math.PI / 2, 1.5, true);
  interactive(ctx, 'keyboard', board, [0.1, 0.5, 0.7], { prompt: 'search' }, [0, 0, 0]);
  // Chair, a lathi in the corner, tiffin and a steel tea glass.
  const chair = plasticChair(ctx, 'plastic_red');
  f.put(chair, f.w - 1.2, f.d - 0.95, Math.PI / 2 + 0.3);
  const lathi = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 1.4, 8), ctx.mats.get('wood_raw', 1));
  lathi.rotation.z = 0.15;
  f.put(lathi, 0.12, 0.25, 0, 0.7);
  f.put(chaiCup(ctx), f.w - 0.5, f.d - 0.5, 0, 0.8);
  const torch = batteryPickup(ctx);
  f.put(torch, f.w - 0.6, f.d - 1.7, 0, 0.8, true);
  interactive(ctx, 'battery_security', torch, [0.15, 0.1, 0.15], { prompt: 'take' }, [0, 0.03, 0]);
  f.wallDecal(calendar('NOVEMBER', 2016, 2, 30, 14, 31), 'left', 2.8, 1.7, 0.36, 0.48);
  // The guard's little prayer shelf: a framed print, incense, a clay diya and matches.
  const shelf = new THREE.Mesh(cbox(0.5, 0.025, 0.2), ctx.mats.get('wood_dark', 1));
  f.put(shelf, 0.1, 0.9, Math.PI / 2, 1.6);
  const frame = decal(poster(4, 33), 0.18, 0.24);
  frame.position.copy(f.pos(0.015, 0.9, 1.78));
  frame.rotation.y = f.rot(Math.PI / 2);
  ctx.scene.add(frame);
  const diya = new THREE.Group();
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.9 }),
  );
  bowl.rotation.x = Math.PI;
  bowl.position.y = 0.035;
  diya.add(bowl);
  const box = new THREE.Mesh(cbox(0.05, 0.015, 0.035), ctx.mats.getBasic('bike_red'));
  box.position.set(0.08, 0.008, 0.02);
  diya.add(box);
  f.put(diya, 0.12, 0.95, 0, 1.615, true);
  interactive(ctx, 'diya', diya, [0.25, 0.12, 0.2], { prompt: 'take' }, [0.03, 0.04, 0]);
  const almirahR = new Rng(41);
  almirahHide(f, 'security-almirah', 1.5, 0.31, 0, almirahR);
  ctx.points.set('security', f.pos(1.6, 2.5));
  ctx.points.set('cctv-view', f.pos(f.w - 1.2, f.d - 0.9));
  ctx.emitters.push({ id: 'secRadio', sound: 'radioStatic', pos: f.pos(f.w - 0.4, f.d - 0.6, 0.9), volume: 0.25, active: () => true });
}

function lobby(f: RoomFrame): void {
  const ctx = f.ctx;
  const rng = new Rng(45);
  for (let i = 0; i < 2; i++) {
    tubeLight(ctx, `lobby${i}`, 'GF', 0, f.pos(1.8 + i * 3.6, f.d / 2, 3.15), 0, { unstable: i ? 0.4 : 0.1 });
  }
  // Notice board with the notices that start the story.
  const nb = noticeBoard(ctx, 1.6, 1.0);
  f.put(nb, 0.03, 1.6, Math.PI / 2, 1.55, true);
  const notices = [
    notice({
      title: 'NOTICE',
      body: 'Room 217 shall remain sealed until further orders. Students are strictly prohibited from entering or tampering with the seal.',
      footer: 'Chief Warden',
      stamp: 'KAVERI HOSTEL',
      seed: 1,
    }),
    notice({
      title: 'MESS TIMINGS',
      body: 'Breakfast 7:30 – 9:00\nLunch 12:30 – 2:00\nSnacks 5:00 – 5:30\nDinner 8:00 – 9:30\nNo food will be served after hours.',
      footer: 'Mess Committee',
      seed: 2,
    }),
    notice({
      title: 'MISSING',
      body: 'ANANYA RAO, B.Tech ECE III yr, Room 217. Last seen 13-11-2016. Any information — contact the hostel office or local police station.',
      footer: '',
      seed: 3,
      hand: 'she’s still here',
    }),
    notice({
      title: 'LIFT',
      body: 'The lift is OUT OF ORDER. Do not use. Repair work pending sanction.',
      footer: 'Estate Office',
      stamp: 'ESTATE',
      seed: 4,
    }),
  ];
  notices.forEach((t, i) => {
    const m = decal(t, 0.32, 0.42);
    m.position.copy(f.pos(0.06, 1.0 + i * 0.38, 1.72 - (i % 2) * 0.12));
    m.rotation.set(0, f.rot(Math.PI / 2), rng.range(-0.06, 0.06));
    ctx.scene.add(m);
  });
  interactive(ctx, 'noticeboard', nb, [0.2, 1.0, 1.6], { prompt: 'read' }, [0, 0, 0]);
  // "Hostel Day 2016" photo board.
  const photo = f.wallDecal(groupPhoto(21, 4, 7), 'right', 1.2, 1.7, 0.9, 0.63);
  interactive(ctx, 'photoboard', photo, [0.9, 0.65, 0.1], { prompt: 'inspect', inspect: 'inspect.photoboard' }, [0, 0, 0]);
  // Benches, a shoe rack, dead potted plants, water cooler.
  const b1 = bench(ctx, 1.8);
  f.put(b1, 3.0, f.d - 0.5, Math.PI);
  addCollider(ctx, b1);
  const wc = waterCooler(ctx);
  f.put(wc, f.w - 0.5, 0.9, -Math.PI / 2);
  addCollider(ctx, wc);
  ctx.emitters.push({ id: 'cooler', sound: 'drip', pos: f.pos(f.w - 0.3, 0.9, 0.7), volume: 0.4, active: () => true });
  for (let i = 0; i < 2; i++) {
    const pot = new THREE.Group();
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.14, 0), new THREE.Vector2(0.2, 0.36), new THREE.Vector2(0, 0.36)];
    pot.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 14), ctx.mats.get('brick', 0.6)));
    for (let k = 0; k < 6; k++) {
      const st = new THREE.Mesh(
        rod(V(0, 0.3, 0), V(rng.range(-0.3, 0.3), rng.range(0.7, 1.0), rng.range(-0.3, 0.3)), 0.006, 4),
        ctx.mats.get('bark', 1),
      );
      pot.add(st);
    }
    f.put(pot, 1.0 + i * 4.8, f.d - 0.3, 0);
  }
  // Main entrance: collapsible gate and double wooden doors (opened by the story).
  ctx.points.set('lobby', f.pos(3.6, 2.0));
  ctx.points.set('entrance', V(18, 0, 5.0));
  // CCTV over the entrance.
  const cam = cctvCamera(ctx);
  f.put(cam, f.w - 0.15, f.d - 0.3, -Math.PI / 2 - 0.5, 2.9, true);
  ctx.points.set('cctv-lobby', f.pos(f.w - 0.4, f.d - 0.45, 2.7));
}

function wardenOffice(f: RoomFrame): void {
  const ctx = f.ctx;
  const rng = new Rng(61);
  roomLight(f, 'light-warden', 0.1);
  fan(f, f.w / 2, f.d / 2);
  const desk = officeTable(ctx);
  f.put(desk, f.w / 2, f.d / 2 + 0.4, Math.PI);
  addCollider(ctx, desk);
  const chair = woodChair(ctx);
  f.put(chair, f.w / 2, f.d / 2 + 1.0, Math.PI);
  for (const sx of [-0.45, 0.45]) {
    const c = woodChair(ctx);
    f.put(c, f.w / 2 + sx, f.d / 2 - 0.4, 0);
  }
  const rack = fileRack(ctx, rng);
  f.put(rack, 0.25, 1.6, Math.PI / 2);
  addCollider(ctx, rack);
  // Steel key cabinet with a combination lock (code puzzle).
  const kc = new THREE.Group();
  kc.add(new THREE.Mesh(cbox(0.45, 0.6, 0.12), ctx.mats.get('metal_almirah', 1)));
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), ctx.mats.getBasic('chrome'));
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.14, 0, 0.07);
  kc.add(dial);
  f.put(kc, f.w - 0.08, 1.5, -Math.PI / 2, 1.5, true);
  interactive(ctx, 'keycabinet', kc, [0.5, 0.65, 0.25], { prompt: 'unlock' }, [0, 0, 0.05]);
  // Garlanded portrait of the hostel founder.
  const portrait = f.wallDecal(notice({ title: '', body: '', seed: 66, paper: '#2a2620' }, 256, 320), 'back', f.w / 2, 2.2, 0.4, 0.5);
  void portrait;
  f.wallDecal(calendar('NOVEMBER', 2016, 2, 30, 14, 61), 'right', 2.8, 1.75, 0.36, 0.48);
  const p = papers(ctx, rng, 5, 0.3);
  f.put(p, f.w / 2, f.d / 2 + 0.4, 0, 0.8);
  // Stamp pad + stamps + attendance register.
  const reg = new THREE.Mesh(cbox(0.38, 0.05, 0.28), ctx.mats.getBasic('book_e'));
  f.put(reg, f.w / 2 + 0.4, f.d / 2 + 0.3, 0.1, 0.81);
  ctx.points.set('warden', f.pos(1.8, 1.4));
  ctx.points.set('wardenDoor', f.pos(0.85, -0.6));
}

function recordsRoom(f: RoomFrame): void {
  const ctx = f.ctx;
  const rng = new Rng(71);
  bulbLight(ctx, 'light-records', 'GF', 0, f.pos(f.w / 2, f.d / 2, 2.9), 0xffd090, 5, 0.6);
  for (let i = 0; i < 3; i++) {
    const rack = fileRack(ctx, rng);
    f.put(rack, f.w - 0.25, 0.8 + i * 1.05, -Math.PI / 2);
    addCollider(ctx, rack);
  }
  const rack2 = fileRack(ctx, rng);
  f.put(rack2, 1.2, 0.25, 0);
  addCollider(ctx, rack2);
  const table = officeTable(ctx, 1.2, 0.7);
  f.put(table, 1.0, f.d - 0.9, Math.PI / 2);
  addCollider(ctx, table);
  // Old newspapers, student file and the incident report (final evidence).
  const np = new THREE.Group();
  np.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.45),
      decal(
        newspaper(
          'Engineering student goes missing from college hostel',
          'Family alleges negligence; college says she "left on her own"',
          'Ananya Rao (20), a third-year ECE student, was reported missing from Kaveri Hostel on Monday. Hostel staff said the student had not been seen since Sunday night. Police have registered a missing person complaint. The college administration has denied any lapse.',
          3,
        ),
        0.36,
        0.45,
      ).material as THREE.Material,
    ),
  );
  np.children[0]!.rotation.x = -Math.PI / 2;
  f.put(np, 1.0, f.d - 1.2, 0.2, 0.795, true);
  interactive(ctx, 'newspaper', np, [0.4, 0.1, 0.5], { prompt: 'read' }, [0, 0.02, 0]);
  const file = new THREE.Group();
  file.add(new THREE.Mesh(cbox(0.25, 0.02, 0.34), ctx.mats.getBasic('book_d')));
  f.put(file, 1.0, f.d - 0.6, -0.1, 0.8, true);
  interactive(ctx, 'studentfile', file, [0.3, 0.1, 0.4], { prompt: 'read' }, [0, 0.02, 0]);
  const report = new THREE.Group();
  report.add(new THREE.Mesh(cbox(0.24, 0.03, 0.32), new THREE.MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.7 })));
  const tag = decal(label('CONFIDENTIAL', 256, 64, '#e8e0c8', '#8a1010'), 0.16, 0.04);
  tag.rotation.x = -Math.PI / 2;
  tag.position.y = 0.016;
  report.add(tag);
  // Hidden in a box file on the bottom shelf.
  f.put(report, f.w - 0.3, 2.0, -Math.PI / 2, 0.1, true);
  interactive(ctx, 'final_evidence', report, [0.35, 0.2, 0.4], { prompt: 'take' }, [0, 0.05, 0]);
  // Broken trophies on a shelf.
  for (let i = 0; i < 4; i++) {
    const tr = trophy(ctx, rng, i === 1 || i === 3);
    f.put(tr, 0.6 + i * 0.25, 0.2, 0, 1.31);
  }
  const hreg = new THREE.Group();
  hreg.add(new THREE.Mesh(cbox(0.42, 0.06, 0.3), ctx.mats.getBasic('book_b')));
  f.put(hreg, 1.0, f.d - 1.6, 0.4, 0.8, true);
  interactive(ctx, 'oldregister', hreg, [0.45, 0.12, 0.35], { prompt: 'read' }, [0, 0.03, 0]);
  ctx.points.set('records', f.pos(1.8, 2.0));
}

function trophy(ctx: WorldCtx, rng: Rng, broken: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cbox(0.1, 0.06, 0.1), ctx.mats.get('wood_dark', 1)));
  const cup = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.015, 0),
    new THREE.Vector2(0.012, 0.08),
    new THREE.Vector2(0.05, 0.14),
    new THREE.Vector2(0.055, 0.2),
    new THREE.Vector2(0.05, 0.2),
    new THREE.Vector2(0, 0.15),
  ];
  const c = new THREE.Mesh(new THREE.LatheGeometry(cup, 14), ctx.mats.getBasic('brass'));
  c.position.y = 0.03;
  if (broken) {
    c.rotation.z = Math.PI / 2;
    c.position.set(0.12, 0.0, rng.range(-0.05, 0.05));
  }
  g.add(c);
  return g;
}

function commonRoom(f: RoomFrame): void {
  const ctx = f.ctx;
  const rng = new Rng(81);
  tubeLight(ctx, 'common0', 'GF', 0, f.pos(0.08, 2.0, 2.6), f.rot(Math.PI / 2), { unstable: 0.2 });
  tubeLight(ctx, 'common1', 'GF', 0, f.pos(f.w - 0.08, 2.0, 2.6), f.rot(-Math.PI / 2), { unstable: 0.3 });
  fan(f, f.w * 0.3, f.d / 2);
  fan(f, f.w * 0.7, f.d / 2);
  // TV on a steel stand by the window wall.
  const stand = new THREE.Group();
  stand.add(new THREE.Mesh(cbox(0.7, 0.9, 0.5), ctx.mats.get('wood_dark', 1)));
  f.put(stand, f.w / 2, f.d - 0.4, Math.PI, 0.45);
  addCollider(ctx, stand);
  const tv = crtTv(ctx);
  f.put(tv, f.w / 2, f.d - 0.42, Math.PI, 0.9, true);
  ctx.objects.set('tvCommon', tv);
  ctx.objects.set('tvCommonScreen', tv.getObjectByName('screen')!);
  interactive(ctx, 'tv', tv, [0.65, 0.5, 0.55], { prompt: 'inspect', inspect: 'inspect.tv' }, [0, 0.25, 0]);
  ctx.emitters.push({
    id: 'tvStatic',
    sound: 'tvStatic',
    pos: f.pos(f.w / 2, f.d - 0.42, 1.2),
    volume: 0.6,
    active: () => !!ctx.objects.get('tvCommon')?.userData.on,
  });
  // Benches and chairs facing the TV.
  for (let i = 0; i < 2; i++) {
    const b = bench(ctx, 2.0);
    f.put(b, f.w / 2, 1.3 + i * 1.0, Math.PI);
    addCollider(ctx, b);
  }
  for (let i = 0; i < 4; i++) {
    const ch = plasticChair(ctx, rng.pick(['plastic_white', 'plastic_red', 'plastic_blue']));
    f.put(ch, 0.8 + i * 0.5 + (i > 1 ? 4 : 0), 2.2 + rng.range(-0.3, 0.3), Math.PI + rng.range(-0.5, 0.5));
  }
  // Carrom board on a stand (pieces still mid-game).
  const carrom = new THREE.Group();
  carrom.add(new THREE.Mesh(cbox(0.74, 0.03, 0.74), ctx.mats.get('wood_raw', 1)));
  for (const [x, z] of [
    [0, 0.38],
    [0, -0.38],
    [0.38, 0],
    [-0.38, 0],
  ])
    carrom.add(at(new THREE.Mesh(cbox(x ? 0.04 : 0.8, 0.05, z ? 0.04 : 0.8), ctx.mats.get('wood_dark', 1)), x!, 0.01, z!));
  for (let i = 0; i < 12; i++) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.008, 10), ctx.mats.getBasic(i % 2 ? 'book_e' : 'white_plastic'));
    coin.position.set(rng.range(-0.3, 0.3), 0.02, rng.range(-0.3, 0.3));
    carrom.add(coin);
  }
  for (const [x, z] of [
    [-0.3, -0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [0.3, 0.3],
  ])
    carrom.add(at(new THREE.Mesh(cbox(0.04, 0.7, 0.04), ctx.mats.get('wood_dark', 1)), x!, -0.35, z!));
  f.put(carrom, f.w - 1.2, 1.4, 0.2, 0.72);
  addCollider(ctx, carrom);
  // Calendar (November 2016, 14 circled) and a clock stopped at 2:07.
  interactive(
    ctx,
    'calendarCommon',
    f.wallDecal(calendar('NOVEMBER', 2016, 2, 30, 14, 81), 'right', 1.0, 1.7, 0.42, 0.56),
    [0.45, 0.6, 0.1],
    { prompt: 'inspect', inspect: 'inspect.calendarCommon' },
    [0, 0, 0],
  );
  const clk = clockFace(ctx, 2, 7);
  f.put(clk, 1.0, 0.02, 0, 2.5, true);
  interactive(ctx, 'clock', clk, [0.35, 0.35, 0.1], { prompt: 'inspect', inspect: 'inspect.clock' }, [0, 0, 0]);
  // Trophy shelf with broken trophies, fest posters.
  const shelf = new THREE.Mesh(cbox(1.6, 0.03, 0.3), ctx.mats.get('wood_dark', 1));
  f.put(shelf, f.w - 0.17, 3.0, -Math.PI / 2, 1.6);
  for (let i = 0; i < 5; i++) f.put(trophy(ctx, rng, i === 2), f.w - 0.17, 2.4 + i * 0.28, -Math.PI / 2, 1.62);
  f.wallDecal(poster(1, 81), 'left', 1.2, 1.7, 0.5, 0.7, true);
  f.wallDecal(poster(4, 82), 'left', 2.9, 1.7, 0.5, 0.7, true);
  // Newspaper rack.
  const nr = new THREE.Group();
  nr.add(new THREE.Mesh(cbox(0.6, 0.9, 0.3), ctx.mats.get('wood_dark', 1)));
  for (let i = 0; i < 3; i++) nr.add(at(new THREE.Mesh(cbox(0.55, 0.5, 0.01), ctx.mats.getBasic('paper')), 0, 0.1, -0.1 + i * 0.1));
  f.put(nr, 0.4, 0.4, Math.PI / 2, 0.45);
  ctx.points.set('common', f.pos(f.w / 2, 2.0));
}

function clockFace(ctx: WorldCtx, h: number, m: number): THREE.Group {
  const g = new THREE.Group();
  g.add(rotAt(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 28), ctx.mats.getBasic('black_plastic')), Math.PI / 2, 0, 0));
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.155, 28), ctx.mats.getBasic('paper'));
  face.position.z = 0.021;
  g.add(face);
  for (let i = 0; i < 12; i++) {
    const t = new THREE.Mesh(cbox(0.008, 0.025, 0.002), ctx.mats.getBasic('black_plastic'));
    const a = (i / 12) * Math.PI * 2;
    t.position.set(Math.sin(a) * 0.13, Math.cos(a) * 0.13, 0.023);
    t.rotation.z = -a;
    g.add(t);
  }
  const hand = (len: number, w: number, a: number) => {
    const p = new THREE.Mesh(cbox(w, len, 0.003), ctx.mats.getBasic('black_plastic'));
    p.geometry.translate(0, len / 2, 0);
    p.rotation.z = -a;
    p.position.z = 0.026;
    g.add(p);
  };
  hand(0.08, 0.012, ((h + m / 60) / 12) * Math.PI * 2);
  hand(0.12, 0.008, (m / 60) * Math.PI * 2);
  return g;
}

function electricalRoom(f: RoomFrame): void {
  const ctx = f.ctx;
  const rng = new Rng(91);
  bulbLight(ctx, 'light-elec', 'BATTERY', 0, f.pos(f.w / 2, f.d / 2, 2.9), 0xffb060, 1.6, 0.5);
  // Main breaker panel (puzzle) on the back wall, distribution boards around it.
  const panel = distributionBoard(ctx, 0.9, 1.0);
  f.put(panel, f.w / 2, f.d - 0.1, Math.PI, 1.4, true);
  interactive(ctx, 'breakers', panel, [0.95, 1.05, 0.3], { prompt: 'use' }, [0, 0, 0.1]);
  for (let i = 0; i < 3; i++) {
    const db = distributionBoard(ctx, 0.45, 0.6);
    f.put(db, 0.1, 1.0 + i * 0.8, Math.PI / 2, 1.5);
  }
  // Energy meters, cable bundles, conduit.
  for (let i = 0; i < 4; i++) {
    const meter = new THREE.Group();
    meter.add(new THREE.Mesh(cbox(0.18, 0.26, 0.1), ctx.mats.getBasic('white_plastic')));
    meter.add(at(new THREE.Mesh(cbox(0.12, 0.08, 0.01), ctx.mats.getBasic('glass')), 0, 0.04, 0.055));
    f.put(meter, f.w - 0.06, 0.8 + i * 0.3, -Math.PI / 2, 1.8);
  }
  const pr = pipeRun(
    ctx,
    [f.pos(f.w - 0.1, 0.3, 3.1), f.pos(f.w - 0.1, 0.3, 2.2), f.pos(f.w - 0.1, 2.0, 2.2), f.pos(f.w / 2, f.d - 0.15, 2.2)],
    0.025,
    'metal_black',
  );
  ctx.batch.addObject(pr);
  // Rubber mat, a wooden stool, a stack of dead tubes.
  const matG = new THREE.Mesh(cbox(1.2, 0.01, 0.8), ctx.mats.get('rubber', 1));
  f.put(matG, f.w / 2, f.d - 0.7, 0);
  const stool = woodChair(ctx);
  f.put(stool, f.w - 0.8, 1.2, rng.range(0, 6));
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.2, 8), ctx.mats.getBasic('white_plastic'));
    t.rotation.z = Math.PI / 2 - 0.1;
    f.put(t, 0.6 + i * 0.03, 0.3, Math.PI / 2, 0.02 + i * 0.03);
  }
  f.wallDecal(label('DANGER ⚡ AUTHORISED PERSONNEL ONLY', 512, 96, '#d9b21c', '#111', undefined, 26), 'front', 1.6, 2.4, 0.9, 0.17);
  ctx.points.set('electrical', f.pos(f.w / 2, 2.0));
  ctx.emitters.push({ id: 'hum', sound: 'transformerHum', pos: f.pos(f.w / 2, f.d - 0.2, 1.5), volume: 0.5, active: () => true });
}

function bathroom(f: RoomFrame): void {
  const ctx = f.ctx;
  const rng = new Rng(101);
  bulbLight(ctx, 'light-bath0', 'SF', 2, f.pos(1.2, 1.4, 3.0), 0xdde8ff, 5, 0.5);
  bulbLight(ctx, 'light-bath1', 'SF', 2, f.pos(2.6, 3.0, 3.0), 0xdde8ff, 4, 0.9);
  // Three toilet stalls along the window wall with swinging doors (hide spots).
  const stallD = 1.35;
  const sw = f.w / 3;
  for (let i = 0; i < 3; i++) {
    const x0 = i * sw;
    // Partitions.
    if (i > 0) {
      const p = new THREE.Mesh(cbox(0.04, 2.0, stallD), ctx.mats.get('metal_green', 1));
      f.put(p, x0, f.d - stallD / 2, 0, 1.05);
      localBox(f, x0 - 0.03, f.d - stallD, x0 + 0.03, f.d, 2.1, 'wall');
    }
    // Front panel beside the door.
    const fp = new THREE.Mesh(cbox(sw - 0.72, 2.0, 0.04), ctx.mats.get('metal_green', 1));
    f.put(fp, x0 + sw - (sw - 0.72) / 2, f.d - stallD, 0, 1.05);
    localBox(f, x0 + 0.72, f.d - stallD - 0.03, x0 + sw, f.d - stallD + 0.03, 2.1, 'wall');
    // Door.
    const pivot = new THREE.Group();
    const door = new THREE.Mesh(cbox(0.68, 1.8, 0.03), ctx.mats.get('metal_green', 1));
    door.position.set(0.34, 1.0, 0);
    door.castShadow = true;
    pivot.add(door);
    const latch = new THREE.Mesh(cbox(0.06, 0.03, 0.03), ctx.mats.getBasic('steel'));
    latch.position.set(0.62, 1.0, -0.03);
    pivot.add(latch);
    f.put(pivot, x0 + 0.04, f.d - stallD, 0, 0, true);
    pivot.rotation.y = f.rot(i === 1 ? -0.3 : -0.05);
    ctx.objects.set(`stall${i}`, pivot);
    // Squat pan + tap + mug.
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.06, 18), ctx.mats.get('ceramic', 1));
    pan.scale.set(0.8, 1, 1.5);
    f.put(pan, x0 + sw / 2, f.d - 0.6, 0, 0.03);
    f.put(bucket(ctx, rng.pick(['plastic_red', 'plastic_blue'])), x0 + sw / 2 + 0.3, f.d - 0.25, 0);
    const c = f.pos(x0 + sw / 2, f.d - 0.55);
    ctx.hideSpots.push({
      id: `stall${i}`,
      kind: 'stall',
      cam: c.clone().setY(c.y + 1.5),
      yaw: f.rot(Math.PI),
      exit: f.pos(x0 + sw / 2, f.d - stallD - 0.6),
      inspect: f.pos(x0 + sw / 2, f.d - stallD - 0.6),
      parts: [pivot],
      floor: 2,
    });
    interactive(ctx, `hide:stall${i}`, pivot, [0.7, 1.8, 0.2], { prompt: 'hide' }, [0.34, 1.0, 0]);
  }
  // Washbasins along the left wall under one long mirror.
  for (let i = 0; i < 3; i++) {
    const wb = washbasin(ctx);
    f.put(wb, 0.02, 0.5 + i * 0.75, Math.PI / 2, 0.8);
  }
  localBox(f, 0, 0.2, 0.45, 2.3, 0.85);
  const mirrorPos = f.pos(0.025, 1.25, 1.55);
  ctx.points.set('mirrorBath', mirrorPos);
  ctx.points.set('mirrorBathYaw', V(f.rot(Math.PI / 2), 0, 0));
  ctx.points.set('bathroom', f.pos(1.6, 1.0));
  ctx.emitters.push({ id: 'tapdrip', sound: 'drip', pos: f.pos(0.3, 1.25, 0.9), volume: 0.7, active: () => true });
  // Pipes, a drain, a puddle and a shelf of soaps.
  const pr = pipeRun(ctx, [f.pos(0.06, 0.2, 3.1), f.pos(0.06, 0.2, 1.1), f.pos(0.06, 2.4, 1.1)], 0.022, 'rust');
  ctx.batch.addObject(pr);
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.6, 22), ctx.mats.getBasic('water'));
  puddle.rotation.x = -Math.PI / 2;
  puddle.scale.set(1.5, 0.8, 1);
  f.put(puddle, 1.3, 1.4, 0.3, 0.004, true);
  f.put(slippers(ctx, rng), 2.0, 0.8, 1.0);
}

function studyRoom(f: RoomFrame): void {
  const ctx = f.ctx;
  const rng = new Rng(111);
  tubeLight(ctx, 'study0', 'SF', 2, f.pos(0.08, 2.0, 2.6), f.rot(Math.PI / 2), { unstable: 0.5 });
  fan(f, f.w / 2, f.d / 2);
  // Blackboard with the cipher on the left wall.
  const bb = f.wallDecal(blackboard(true), 'right', 2.1, 1.6, 2.2, 1.1);
  interactive(ctx, 'blackboard', bb, [2.2, 1.1, 0.1], { prompt: 'inspect', inspect: 'inspect.blackboard' }, [0, 0, 0]);
  // Rows of tables.
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++) {
      const t = studyTable(ctx, rng);
      f.put(t, 0.9 + c * 1.5, 1.2 + r * 1.4, 0);
      addCollider(ctx, t);
      const ch = plasticChair(ctx, rng.pick(['plastic_white', 'plastic_blue']));
      f.put(ch, 0.9 + c * 1.5 + rng.range(-0.1, 0.1), 0.65 + r * 1.4, rng.range(-0.3, 0.3));
      f.put(books(ctx, rng, rng.int(2, 5)), 0.8 + c * 1.5, 1.2 + r * 1.4, rng.range(0, 1), 0.76);
    }
  const shelf = fileRack(ctx, rng);
  f.put(shelf, 0.25, f.d - 0.5, Math.PI / 2);
  addCollider(ctx, shelf);
  const bat = batteryPickup(ctx);
  f.put(bat, 2.4, 2.6, 0.5, 0.77, true);
  interactive(ctx, 'battery_study', bat, [0.15, 0.1, 0.15], { prompt: 'take' }, [0, 0.03, 0]);
  f.wallDecal(poster(0, 111), 'left', 2.8, 1.7, 0.5, 0.7, true);
  ctx.points.set('study', f.pos(1.6, 2.0));
}

/** Clothes hanging outside rooms, slippers by the doors, a water cooler and a notice board. */
function corridorDressing(ctx: WorldCtx): void {
  const rng = new Rng(7);
  for (const r of ROOMS) {
    if (r.kind !== 'dorm' && r.kind !== 'locked') continue;
    if (r.floor === 1) continue;
    const L = floorY(r.floor);
    const zWall = r.side === 'S' ? CORR - 0.01 : -CORR + 0.01;
    const xDoor = bayX0(r.bay) + (r.door ?? 0) + 0.45;
    if (rng.chance(0.55)) {
      const s = slippers(ctx, rng);
      s.position.set(xDoor + rng.range(-0.7, 0.7), L, zWall + (r.side === 'S' ? -0.25 : 0.25));
      ctx.batch.addObject(s);
    }
    if (rng.chance(0.35)) {
      // Towel / kurta hung on a nail on the corridor wall.
      const w = rng.range(0.35, 0.5);
      const h = rng.range(0.6, 0.85);
      const geo = new THREE.PlaneGeometry(w, h, 4, 6);
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 20) * 0.015 + 0.02);
      geo.computeVertexNormals();
      const cloth = new THREE.Mesh(geo, ctx.mats.get(rng.pick(['sheet_check', 'sheet_blue', 'curtain_green', 'ghost_cloth']), 1));
      const xc = bayX0(r.bay) + (r.side === 'S' ? 2.4 : 1.2);
      cloth.position.set(xc, L + 1.55 - h / 2 + 0.3, zWall + (r.side === 'S' ? -0.03 : 0.03));
      cloth.rotation.y = r.side === 'S' ? Math.PI : 0;
      cloth.castShadow = true;
      ctx.batch.addObject(cloth);
    }
    if (rng.chance(0.3)) {
      const bk = bucket(ctx, rng.pick(['plastic_red', 'plastic_blue', 'plastic_green', 'plastic_yellow']), rng.chance(0.5));
      bk.position.set(xDoor + rng.range(0.6, 1.2), L, zWall + (r.side === 'S' ? -0.3 : 0.3));
      ctx.batch.addObject(bk);
      ctx.col.add({
        minX: bk.position.x - 0.17,
        maxX: bk.position.x + 0.17,
        minZ: bk.position.z - 0.17,
        maxZ: bk.position.z + 0.17,
        minY: L,
        maxY: L + 0.31,
        opaque: false,
        tag: 'prop',
      });
    }
  }
  // Second floor: water cooler by the bathroom, notice board by the stairs, clothes line on the balcony.
  const L2 = floorY(2);
  const wc = waterCooler(ctx);
  wc.position.set(BAY * 10 - 0.5, L2, -CORR + 0.4);
  ctx.batch.addObject(wc);
  ctx.col.add({ minX: BAY * 10 - 0.9, maxX: BAY * 10 - 0.1, minZ: -CORR, maxZ: -CORR + 0.75, minY: L2, maxY: L2 + 1.2, opaque: false });
  const nb = noticeBoard(ctx, 1.2, 0.8);
  nb.position.set(BAY + 1.0, L2 + 1.6, CORR - 0.03);
  nb.rotation.y = Math.PI;
  ctx.batch.addObject(nb);
  const ns = [
    notice({
      title: 'WATER SUPPLY',
      body: 'Water will be available only 6–8 AM and 7–9 PM due to motor repair. Close taps after use.',
      footer: 'Warden',
      seed: 51,
    }),
    notice({
      title: 'ANTI-RAGGING',
      body: 'Ragging in any form is a punishable offence. Helpline: 1800-180-5522.',
      footer: 'Anti-Ragging Cell',
      stamp: 'VIT',
      seed: 52,
    }),
    notice({
      title: 'URGENT',
      body: 'Students must NOT go to the terrace after 10 PM. The terrace door will be locked.',
      footer: 'Chief Warden',
      seed: 53,
      hand: 'why??',
    }),
  ];
  ns.forEach((t, i) => {
    const m = decal(t, 0.3, 0.4);
    m.position.set(BAY + 0.6 + i * 0.4, L2 + 1.6, CORR - 0.05);
    m.rotation.set(0, Math.PI, rng.range(-0.05, 0.05));
    ctx.scene.add(m);
  });
  const bal = ctx.points.get('balcony');
  if (bal) {
    const line = clothesLine(ctx, V(bal.x - 1.2, L2 + 2.0, -2.3), V(bal.x - 1.2, L2 + 2.0, 2.3), rng, 5, true);
    markDynamic(line);
    ctx.scene.add(line);
    // Washing stone and taps.
    const stone = new THREE.Mesh(cbox(0.9, 0.12, 0.6), ctx.mats.get('concrete_dark', 1));
    stone.position.set(bal.x + 0.6, L2 + 0.4, 1.8);
    stone.rotation.z = 0.15;
    ctx.batch.addObject(stone);
    for (let i = 0; i < 3; i++) {
      const b = bucket(ctx, rng.pick(['plastic_red', 'plastic_blue', 'plastic_yellow']), i === 0);
      b.position.set(bal.x + rng.range(-0.8, 0.9), L2, rng.range(-2, 2));
      ctx.batch.addObject(b);
    }
    ctx.emitters.push({ id: 'balconyTap', sound: 'drip', pos: V(bal.x + 1.2, L2 + 0.8, 2.3), volume: 0.6, active: () => true });
  }
  // A corridor fan near the study room (the one in the title screen).
  ceilingFan(ctx, V(BAY * 9.5, L2 + 3.2, 0), 'SF', 0.35);
  // Lift call buttons are created by the lift; mark its lobby point.
  ctx.points.set('liftG', V((LIFT.doorX0 + LIFT.doorX1) / 2, 0, 0.6));
  ctx.points.set('liftS', V((LIFT.doorX0 + LIFT.doorX1) / 2, L2, 0.6));
  ctx.points.set('stairsTop', V(2.7, L2, -0.6));
  ctx.points.set('stairsGF', V(1.0, 0, -0.6));
  ctx.points.set('corrS-east', V(BAY * 10.5, L2, 0));
  ctx.points.set('corrS-west', V(BAY * 0.8, L2, 0));
  ctx.points.set('corrG-east', V(BAY * 10.5, 0, 0));
  ctx.points.set('firstFloorView', V(BAY * 0.6, floorY(1), 0));
  void OUTER;
}
