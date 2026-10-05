import * as THREE from 'three';
import type { Interactable, WorldCtx } from '../world/context';

/**
 * Finds the interactable under the crosshair: a ray from the camera centre against the hit
 * proxies of nearby interactables, rejected if a wall is in between.
 */
export class InteractionSystem {
  private readonly ray = new THREE.Raycaster();
  private readonly center = new THREE.Vector2(0, 0);
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly byId = new Map<string, Interactable>();
  current: Interactable | null = null;
  prompt: string | null = null;
  enabled = true;

  constructor(private readonly ctx: WorldCtx) {
    for (const i of ctx.interactables) this.byId.set(i.id, i);
  }

  get(id: string): Interactable | undefined {
    return this.byId.get(id) ?? this.ctx.interactables.find((i) => i.id === id);
  }

  update(camera: THREE.Camera): void {
    this.current = null;
    this.prompt = null;
    if (!this.enabled) return;
    camera.getWorldPosition(this.origin);
    camera.getWorldDirection(this.dir);
    const near: THREE.Object3D[] = [];
    const lookup = new Map<THREE.Object3D, Interactable>();
    for (const it of this.ctx.interactables) {
      // Proxies are attached to objects that may move (doors, lift), so use the live position.
      it.target.getWorldPosition(it.position);
      if (it.position.distanceToSquared(this.origin) > 16) continue;
      near.push(it.target);
      lookup.set(it.target, it);
    }
    if (!near.length) return;
    this.ray.setFromCamera(this.center, camera);
    this.ray.far = 3.2;
    const hits = this.ray.intersectObjects(near, false);
    for (const h of hits) {
      const it = lookup.get(h.object);
      if (!it) continue;
      if (h.distance > (it.range ?? 2.3)) continue;
      // A wall between the eye and the object blocks the interaction.
      const t = this.ctx.col.raycast(
        this.origin.x,
        this.origin.y,
        this.origin.z,
        this.dir.x,
        this.dir.y,
        this.dir.z,
        h.distance - 0.25,
        true,
        'door',
      );
      if (t < h.distance - 0.3) continue;
      const p = it.prompt();
      if (!p) continue;
      this.current = it;
      this.prompt = p;
      break;
    }
  }

  interact(): boolean {
    if (!this.current) return false;
    this.current.onInteract();
    return true;
  }
}
