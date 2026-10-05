import type * as THREE from 'three';
import { addInteractable, hitProxy, type WorldCtx } from './context';

/**
 * Story-facing interaction registry. World builders create the physical objects and register an
 * action id; the story layer later binds behaviour (prompt + handler) to those ids. Unbound ids
 * fall back to the default prompt and an "inspect" description.
 */
export interface ActionBinding {
  prompt?: () => string | null;
  run: () => void;
}

export const actions = new Map<string, ActionBinding>();

export interface ActionDefaults {
  prompt: string;
  inspect?: string;
  range?: number;
}

export const actionDefaults = new Map<string, ActionDefaults>();

/** Fallback handler for actions with no story binding (shows the inspect text). */
export let onUnboundAction: (id: string, d: ActionDefaults) => void = () => {};
export function setUnboundHandler(fn: (id: string, d: ActionDefaults) => void): void {
  onUnboundAction = fn;
}

/**
 * Registers an interactive object. A proxy box of the given size is attached to `obj` (in its local
 * space, offset by `offset`) to make it easy to target on touch screens.
 */
export function interactive(
  ctx: WorldCtx,
  id: string,
  obj: THREE.Object3D,
  size: [number, number, number],
  defaults: ActionDefaults,
  offset: [number, number, number] = [0, size[1] / 2, 0],
): void {
  const proxy = hitProxy(size[0], size[1], size[2]);
  proxy.position.set(offset[0], offset[1], offset[2]);
  obj.add(proxy);
  obj.updateMatrixWorld(true);
  ctx.objects.set(id, obj);
  actionDefaults.set(id, defaults);
  addInteractable(ctx, {
    id,
    target: proxy,
    range: defaults.range,
    prompt: () => {
      const b = actions.get(id);
      if (b?.prompt) return b.prompt();
      if (!obj.visible) return null;
      return defaults.prompt;
    },
    onInteract: () => {
      const b = actions.get(id);
      if (b) b.run();
      else onUnboundAction(id, defaults);
    },
  });
}
