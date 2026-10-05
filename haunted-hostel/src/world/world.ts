import * as THREE from 'three';
import type { MaterialLibrary } from '../render/textures/materials';
import { CollisionWorld } from './collision';
import { createCtx, type WorldCtx } from './context';
import { StaticBatcher } from './geom';
import { buildHostel } from './hostel';
import { buildInteriors } from './interiors';
import { buildExterior, type ExteriorBuild } from './exterior';
import { Lift } from './lift';
import type { Door } from './doors';
import type { Shelter } from '../render/weather';
import { OUTER, OUTER_T, ROOF_Y, XMAX } from './layout';

export interface World {
  ctx: WorldCtx;
  doors: Map<string, Door>;
  lift: Lift;
  ext: ExteriorBuild;
  shelters: Shelter[];
  drawCalls: number;
}

/** Builds the full level. `onStep` reports coarse progress for the loading screen. */
export async function buildWorld(scene: THREE.Scene, mats: MaterialLibrary, tq: number, onStep: (f: number) => void): Promise<World> {
  const col = new CollisionWorld();
  const batch = new StaticBatcher();
  const ctx = createCtx(scene, mats, batch, col, tq);
  const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
  const { doors } = buildHostel(ctx);
  onStep(0.3);
  await yieldFrame();
  buildInteriors(ctx);
  onStep(0.55);
  await yieldFrame();
  const ext = buildExterior(ctx);
  for (const d of ext.mainDoors) doors.set(d.id, d);
  onStep(0.75);
  await yieldFrame();
  const lift = new Lift(ctx);
  const drawCalls = batch.build(scene);
  onStep(1);
  const shelters: Shelter[] = [
    [-0.25, -1, -OUTER - OUTER_T - 0.6, XMAX + 0.25, ROOF_Y - 0.05, OUTER + OUTER_T + 0.6],
    [-0.25, ROOF_Y - 0.1, -OUTER - OUTER_T, 3.8, ROOF_Y + 3.2, OUTER + OUTER_T],
    [15.6, -1, OUTER, 20.4, 3.1, OUTER + 3.0],
    [3.5, -1, OUTER + 2.6, 13.5, 2.6, OUTER + 5.8],
    [XMAX + 3.5, -1, -2.6, XMAX + 8.6, 2.9, 3.1],
    [22.4, -1, 28.6, 24.7, 2.7, 31.1],
  ];
  return { ctx, doors, lift, ext, shelters, drawCalls };
}
