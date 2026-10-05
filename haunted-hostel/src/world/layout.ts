/**
 * Kaveri Hostel, Block B — building layout. Pure data shared by the builders, the story, the nav
 * graph and the tests.
 *
 *   x: 0 (west end) → 39.6 (east end), 11 bays of 3.6 m.
 *   z: corridor −1.2…1.2, north rooms −5.4…−1.35, south rooms 1.35…5.4 (south faces the courtyard).
 *   y: ground floor 0, first floor 3.4, second floor 6.8, terrace 10.2.
 */
export const BAY = 3.6;
export const NBAYS = 11;
export const XMAX = BAY * NBAYS;
export const CORR = 1.2;
export const CWALL = 0.15;
export const ROOM_IN = CORR + CWALL;
export const OUTER = 5.4;
export const OUTER_T = 0.2;
export const PART_T = 0.15;
export const FLOOR_H = 3.4;
export const CLEAR_H = 3.2;
export const FLOORS = [0, 3.4, 6.8] as const;
export const ROOF_Y = 10.2;

export const floorY = (f: number): number => f * FLOOR_H;
export const bayX0 = (b: number): number => b * BAY;
export const bayCX = (b: number): number => b * BAY + BAY / 2;

export type Side = 'N' | 'S';

export type RoomKind =
  | 'dorm'
  | 'locked'
  | 'stairs'
  | 'lift'
  | 'lobby'
  | 'security'
  | 'warden'
  | 'records'
  | 'common'
  | 'electrical'
  | 'bathroom'
  | 'study'
  | 'store';

export interface RoomDef {
  id: string;
  label: string;
  floor: 0 | 1 | 2;
  side: Side;
  bay: number;
  bays: number;
  kind: RoomKind;
  wall: string;
  floorMat: string;
  /** Door offset from the room's west edge (x), width 0.9. null = no corridor door. */
  door: number | null;
  doorWidth?: number;
  doorMat?: string;
  lock?: 'none' | 'key' | 'padlock' | 'sealed' | 'jammed' | 'code' | 'story';
  keyId?: string;
  /** Whether the room gets furniture (inaccessible rooms stay bare behind curtains). */
  furnished: boolean;
  openCorridor?: boolean;
  lockedMessage?: string;
}

const dorm = (
  floor: 0 | 1 | 2,
  side: Side,
  bay: number,
  label: string,
  furnished: boolean,
  wall: string,
  lock: RoomDef['lock'] = 'none',
  doorMat = 'wood_door_brown',
): RoomDef => ({
  id: `room${label}`,
  label,
  floor,
  side,
  bay,
  bays: 1,
  kind: furnished ? 'dorm' : 'locked',
  wall,
  floorMat: 'floor_kota',
  door: side === 'S' ? 0.35 : BAY - 1.25,
  doorMat,
  lock: furnished ? lock : 'padlock',
  furnished,
});

const walls = ['wall_room_blue', 'wall_room_yellow', 'wall_room_green'];

function buildRooms(): RoomDef[] {
  const r: RoomDef[] = [];
  // ---------------- Ground floor ----------------
  r.push({
    id: 'stairsG',
    label: '',
    floor: 0,
    side: 'N',
    bay: 0,
    bays: 1,
    kind: 'stairs',
    wall: 'wall_stair',
    floorMat: 'floor_terrazzo',
    door: null,
    furnished: true,
  });
  r.push({
    id: 'liftG',
    label: '',
    floor: 0,
    side: 'S',
    bay: 0,
    bays: 1,
    kind: 'lift',
    wall: 'wall_corridor',
    floorMat: 'floor_terrazzo',
    door: null,
    furnished: true,
  });
  r.push({
    id: 'common',
    label: 'TV ROOM',
    floor: 0,
    side: 'N',
    bay: 1,
    bays: 2,
    kind: 'common',
    wall: 'wall_room_green',
    floorMat: 'floor_kota',
    door: 4.4,
    doorWidth: 1.0,
    doorMat: 'wood_door_green',
    furnished: true,
  });
  r.push({
    id: 'electrical',
    label: 'ELEC',
    floor: 0,
    side: 'N',
    bay: 3,
    bays: 1,
    kind: 'electrical',
    wall: 'wall_stair',
    floorMat: 'floor_terrazzo',
    door: 1.2,
    doorMat: 'wood_door_blue',
    lock: 'key',
    keyId: 'key_electrical',
    furnished: true,
    lockedMessage: 'msg.elecLocked',
  });
  for (let b = 4; b <= 9; b++) r.push(dorm(0, 'N', b, `G-0${b - 3}`, false, 'wall_room_blue'));
  r.push({
    id: 'gfbath',
    label: 'BATH',
    floor: 0,
    side: 'N',
    bay: 10,
    bays: 1,
    kind: 'store',
    wall: 'wall_room_blue',
    floorMat: 'floor_kota',
    door: 1.4,
    lock: 'jammed',
    furnished: false,
    lockedMessage: 'msg.outOfOrder',
  });
  r.push(dorm(0, 'S', 1, 'G-07', false, 'wall_room_yellow'));
  r.push(dorm(0, 'S', 2, 'G-08', false, 'wall_room_yellow'));
  r.push({
    id: 'security',
    label: 'SECURITY',
    floor: 0,
    side: 'S',
    bay: 3,
    bays: 1,
    kind: 'security',
    wall: 'wall_office',
    floorMat: 'floor_kota',
    door: 1.4,
    doorMat: 'wood_door_blue',
    furnished: true,
  });
  r.push({
    id: 'lobby',
    label: '',
    floor: 0,
    side: 'S',
    bay: 4,
    bays: 2,
    kind: 'lobby',
    wall: 'wall_corridor',
    floorMat: 'floor_kota',
    door: null,
    furnished: true,
    openCorridor: true,
  });
  r.push({
    id: 'warden',
    label: 'WARDEN',
    floor: 0,
    side: 'S',
    bay: 6,
    bays: 1,
    kind: 'warden',
    wall: 'wall_office',
    floorMat: 'floor_kota',
    door: 0.4,
    doorMat: 'wood_door_brown',
    lock: 'story',
    furnished: true,
    lockedMessage: 'msg.wardenLocked',
  });
  r.push({
    id: 'records',
    label: 'RECORDS',
    floor: 0,
    side: 'S',
    bay: 7,
    bays: 1,
    kind: 'records',
    wall: 'wall_office',
    floorMat: 'floor_kota',
    door: 1.2,
    doorMat: 'wood_door_brown',
    lock: 'jammed',
    furnished: true,
    lockedMessage: 'msg.recordsCorridor',
  });
  r.push(dorm(0, 'S', 8, 'G-09', false, 'wall_room_blue'));
  r.push(dorm(0, 'S', 9, 'G-10', false, 'wall_room_blue'));
  r.push({
    id: 'mess',
    label: 'STORE',
    floor: 0,
    side: 'S',
    bay: 10,
    bays: 1,
    kind: 'store',
    wall: 'wall_room_blue',
    floorMat: 'floor_kota',
    door: 1.2,
    lock: 'padlock',
    furnished: false,
  });

  // ---------------- First floor (closed for repairs) ----------------
  r.push({
    id: 'stairsF',
    label: '',
    floor: 1,
    side: 'N',
    bay: 0,
    bays: 1,
    kind: 'stairs',
    wall: 'wall_stair',
    floorMat: 'floor_terrazzo',
    door: null,
    furnished: true,
  });
  r.push({
    id: 'liftF',
    label: '',
    floor: 1,
    side: 'S',
    bay: 0,
    bays: 1,
    kind: 'lift',
    wall: 'wall_corridor',
    floorMat: 'floor_terrazzo',
    door: null,
    furnished: true,
  });
  for (let b = 1; b <= 10; b++) {
    r.push(dorm(1, 'N', b, `1${String(b).padStart(2, '0')}`, false, walls[b % 3]!));
    r.push(dorm(1, 'S', b, `1${String(21 - b).padStart(2, '0')}`, false, walls[(b + 1) % 3]!));
  }

  // ---------------- Second floor ----------------
  r.push({
    id: 'stairsS',
    label: '',
    floor: 2,
    side: 'N',
    bay: 0,
    bays: 1,
    kind: 'stairs',
    wall: 'wall_stair',
    floorMat: 'floor_terrazzo',
    door: null,
    furnished: true,
  });
  r.push({
    id: 'liftS',
    label: '',
    floor: 2,
    side: 'S',
    bay: 0,
    bays: 1,
    kind: 'lift',
    wall: 'wall_corridor',
    floorMat: 'floor_terrazzo',
    door: null,
    furnished: true,
  });
  const northFurnished = new Set([1, 3, 7]);
  for (let b = 1; b <= 9; b++) {
    const label = `20${b}`;
    r.push(dorm(2, 'N', b, label, northFurnished.has(b), walls[b % 3]!, 'none', b % 2 ? 'wood_door_brown' : 'wood_door_green'));
  }
  const southFurnished = new Set(['218', '217', '216', '214', '212']);
  for (let b = 1; b <= 9; b++) {
    const label = String(219 - b);
    const d = dorm(2, 'S', b, label, southFurnished.has(label), walls[(b + 2) % 3]!, 'none', b % 2 ? 'wood_door_green' : 'wood_door_brown');
    if (label === '217') {
      d.lock = 'sealed';
      d.keyId = 'key_217';
      d.doorMat = 'wood_door_blue';
      d.lockedMessage = 'msg.sealed217';
    }
    if (label === '214') d.lock = 'key';
    if (label === '214') d.keyId = 'key_214';
    r.push(d);
  }
  r.push({
    id: 'bathroom2',
    label: 'WASH',
    floor: 2,
    side: 'N',
    bay: 10,
    bays: 1,
    kind: 'bathroom',
    wall: 'tiles_wall',
    floorMat: 'tiles_floor',
    door: 0.25,
    doorWidth: 1.1,
    furnished: true,
  });
  r.push({
    id: 'study',
    label: 'STUDY',
    floor: 2,
    side: 'S',
    bay: 10,
    bays: 1,
    kind: 'study',
    wall: 'wall_room_yellow',
    floorMat: 'floor_kota',
    door: 0.35,
    doorMat: 'wood_door_green',
    furnished: true,
  });
  return r;
}

export const ROOMS: RoomDef[] = buildRooms();

export const roomById = (id: string): RoomDef | undefined => ROOMS.find((r) => r.id === id);

/** Interior bounds of a room (inside faces of its walls). */
export function roomBounds(r: RoomDef): { x0: number; x1: number; z0: number; z1: number; y: number } {
  const x0 = bayX0(r.bay) + (r.bay === 0 ? 0 : PART_T / 2);
  const x1 = bayX0(r.bay + r.bays) - (r.bay + r.bays >= NBAYS ? 0 : PART_T / 2);
  const y = floorY(r.floor);
  if (r.side === 'S') return { x0, x1, z0: ROOM_IN, z1: OUTER, y };
  return { x0, x1, z0: -OUTER, z1: -ROOM_IN, y };
}

/** Door centre in world space for a room (on the corridor wall). */
export function doorCenter(r: RoomDef): { x: number; z: number } | null {
  if (r.door === null) return null;
  const w = r.doorWidth ?? 0.9;
  return { x: bayX0(r.bay) + r.door + w / 2, z: r.side === 'S' ? CORR + CWALL / 2 : -CORR - CWALL / 2 };
}

// Stair geometry (bay 0 north). Flight A rises north on the west half, flight B rises south on the east half.
export const STAIR = {
  riser: 0.17,
  tread: 0.28,
  steps: 10,
  aX0: 0.05,
  aX1: 1.7,
  bX0: 1.9,
  bX1: 3.525,
  zStart: -1.4,
  zLanding: -4.2,
  zEnd: -OUTER,
};

// Lift (bay 0 south).
export const LIFT = { x0: 0.7, x1: 2.6, z0: 1.55, z1: 3.45, doorX0: 1.15, doorX1: 2.15 };
