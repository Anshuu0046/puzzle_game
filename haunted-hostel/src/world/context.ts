import * as THREE from 'three';
import type { MaterialLibrary } from '../render/textures/materials';
import type { CollisionWorld } from './collision';
import type { StaticBatcher } from './geom';
import { Rng } from '../core/rng';

export type Circuit = 'GF' | 'FF' | 'SF' | 'EXT' | 'EMERGENCY' | 'BATTERY' | 'STREET';

export interface Fixture {
  id: string;
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  range: number;
  circuit: Circuit;
  /** Emissive materials that glow with the fixture. */
  mats: THREE.MeshStandardMaterial[];
  emissiveBase: number;
  /** 0 = rock steady, 1 = constantly failing. */
  unstable: number;
  /** Current output 0..1 written by the lighting system. */
  level: number;
  /** Optional forced state for scripted events (null = follow circuit). */
  forced: number | null;
  floor: number;
  /** Light shaft / glow sprite that follows the level. */
  glow?: THREE.Object3D & { material: THREE.Material };
  buzz: boolean;
}

export interface Interactable {
  id: string;
  /** Hit target (often an invisible proxy box). */
  target: THREE.Object3D;
  position: THREE.Vector3;
  /** Prompt verb key (e.g. 'open', 'locked', 'read') or null when currently not interactive. */
  prompt: () => string | null;
  onInteract: () => void;
  range?: number;
}

export type HideKind = 'almirah' | 'bed' | 'stall' | 'curtain' | 'door';

export interface HideSpot {
  id: string;
  kind: HideKind;
  /** Camera position and facing while hidden. */
  cam: THREE.Vector3;
  yaw: number;
  /** Where the player stands after leaving. */
  exit: THREE.Vector3;
  /** Where the ghost stands to inspect the spot. */
  inspect: THREE.Vector3;
  /** Animated parts (cupboard doors, stall door, curtain cloth). */
  parts: THREE.Object3D[];
  floor: number;
}

export type NoiseKind = 'step' | 'door' | 'drop' | 'voice' | 'light';

export interface WorldCtx {
  scene: THREE.Scene;
  mats: MaterialLibrary;
  batch: StaticBatcher;
  col: CollisionWorld;
  rng: Rng;
  fixtures: Fixture[];
  interactables: Interactable[];
  /** Objects updated every frame (fans, swinging clothes...). */
  animated: { update: (dt: number, t: number) => void }[];
  /** Named points of interest used by the story, AI and debug teleports. */
  points: Map<string, THREE.Vector3>;
  /** Named objects the story manipulates (beds, stalls, curtains...). */
  objects: Map<string, THREE.Object3D>;
  textureQuality: number;
  hideSpots: HideSpot[];
  /** Positional ambient loops (fans, radios, dripping taps) for the audio system. */
  emitters: { id: string; sound: string; pos: THREE.Vector3; volume: number; active: () => boolean }[];
}

export function createCtx(scene: THREE.Scene, mats: MaterialLibrary, batch: StaticBatcher, col: CollisionWorld, tq: number): WorldCtx {
  return {
    scene,
    mats,
    batch,
    col,
    rng: new Rng(2016),
    fixtures: [],
    interactables: [],
    animated: [],
    points: new Map(),
    objects: new Map(),
    textureQuality: tq,
    hideSpots: [],
    emitters: [],
  };
}

const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

/** Invisible box used as a raycast target for interactions. */
export function hitProxy(w: number, h: number, d: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat);
  m.userData.dynamic = true;
  m.userData.proxy = true;
  return m;
}

export function addInteractable(ctx: WorldCtx, i: Omit<Interactable, 'position'> & { position?: THREE.Vector3 }): Interactable {
  const it: Interactable = { ...i, position: i.position ?? i.target.getWorldPosition(new THREE.Vector3()) };
  i.target.userData.interactId = i.id;
  ctx.interactables.push(it);
  return it;
}

/** Marks an object tree as dynamic so the static batcher leaves it alone. */
export function markDynamic(o: THREE.Object3D): THREE.Object3D {
  o.traverse((c) => (c.userData.dynamic = true));
  return o;
}
