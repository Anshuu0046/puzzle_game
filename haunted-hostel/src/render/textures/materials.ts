import * as THREE from 'three';
import { RECIPES, generateTextureSet, type TextureSetData } from './recipes';

interface MatDef {
  recipe: string;
  /** Metres covered by one texture repeat (architecture uses metre UVs). */
  tile: number;
  color?: number;
  roughnessScale?: number;
  metalness?: number;
  envIntensity?: number;
  normalScale?: number;
  side?: THREE.Side;
  alphaTest?: number;
  emissive?: number;
}

/**
 * Material catalogue. Architecture geometry carries UVs in metres, so `tile` says how many metres
 * one texture repeat spans. Props built with the metre-UV box helper share the same convention.
 */
export const MATERIAL_DEFS: Record<string, MatDef> = {
  wall_corridor: { recipe: 'wall_corridor', tile: 3.2 },
  wall_stair: { recipe: 'wall_stair', tile: 3.2 },
  wall_office: { recipe: 'wall_office', tile: 3.2 },
  wall_room_blue: { recipe: 'wall_room_blue', tile: 3.2 },
  wall_room_yellow: { recipe: 'wall_room_yellow', tile: 3.2 },
  wall_room_green: { recipe: 'wall_room_green', tile: 3.2 },
  ceiling: { recipe: 'ceiling', tile: 4 },
  floor_kota: { recipe: 'floor_kota', tile: 1.2, envIntensity: 0.6 },
  floor_terrazzo: { recipe: 'floor_terrazzo', tile: 1.2, envIntensity: 0.6 },
  tiles_wall: { recipe: 'tiles_wall', tile: 1.2, envIntensity: 0.7 },
  tiles_floor: { recipe: 'tiles_floor', tile: 1.2, envIntensity: 0.7 },
  facade: { recipe: 'facade', tile: 3.4 },
  concrete: { recipe: 'concrete', tile: 2.5 },
  concrete_dark: { recipe: 'concrete_dark', tile: 2.5 },
  asphalt: { recipe: 'asphalt', tile: 6, envIntensity: 1 },
  mud: { recipe: 'mud', tile: 5 },
  brick: { recipe: 'brick', tile: 1.0 },
  wood_door_brown: { recipe: 'wood_door_brown', tile: 1.0 },
  wood_door_green: { recipe: 'wood_door_green', tile: 1.0 },
  wood_door_blue: { recipe: 'wood_door_blue', tile: 1.0 },
  wood_raw: { recipe: 'wood_raw', tile: 1.0 },
  wood_dark: { recipe: 'wood_dark', tile: 1.0 },
  metal_almirah: { recipe: 'metal_almirah', tile: 1.0 },
  metal_black: { recipe: 'metal_black', tile: 1.0 },
  metal_green: { recipe: 'metal_green', tile: 1.0 },
  metal_cream: { recipe: 'metal_cream', tile: 1.0 },
  rust: { recipe: 'rust', tile: 1.0 },
  mattress: { recipe: 'mattress', tile: 1.0 },
  sheet_check: { recipe: 'sheet_check', tile: 1.0 },
  sheet_blue: { recipe: 'sheet_blue', tile: 1.0 },
  curtain: { recipe: 'curtain', tile: 1.5, side: THREE.DoubleSide },
  curtain_green: { recipe: 'curtain_green', tile: 1.5, side: THREE.DoubleSide },
  plastic_red: { recipe: 'plastic', tile: 1, color: 0xa3302a },
  plastic_blue: { recipe: 'plastic', tile: 1, color: 0x2c5aa0 },
  plastic_white: { recipe: 'plastic', tile: 1, color: 0xd8d4c8 },
  plastic_green: { recipe: 'plastic', tile: 1, color: 0x3f7a3f },
  plastic_yellow: { recipe: 'plastic', tile: 1, color: 0xc49a2a },
  plastic_black: { recipe: 'plastic', tile: 1, color: 0x1a1a1a },
  ceramic: { recipe: 'ceramic', tile: 1, envIntensity: 0.9 },
  ghost_skin: { recipe: 'ghost_skin', tile: 1 },
  ghost_cloth: { recipe: 'ghost_cloth', tile: 1, side: THREE.DoubleSide },
  hair: { recipe: 'hair', tile: 1, side: THREE.DoubleSide, alphaTest: 0.45 },
  leaves: { recipe: 'leaves', tile: 1, side: THREE.DoubleSide, alphaTest: 0.5 },
  bark: { recipe: 'bark', tile: 1.5 },
  rubber: { recipe: 'rubber', tile: 1 },
};

/** Textures needed per recipe (several material defs may share one recipe). */
const RECIPE_NAMES = Object.keys(RECIPES);

export class MaterialLibrary {
  private readonly sets = new Map<string, { map: THREE.Texture; normal: THREE.Texture; orm: THREE.Texture }>();
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();
  /** Simple, untextured materials (chrome, glass, emissive) keyed by name. */
  readonly basic = new Map<string, THREE.Material>();
  envMap: THREE.Texture | null = null;

  constructor(private readonly anisotropy: number) {}

  /** Generates every texture set using a worker pool. Calls `onProgress(0..1)` as sets complete. */
  async generate(size: number, onProgress: (f: number) => void): Promise<void> {
    const names = RECIPE_NAMES;
    let done = 0;
    const accept = (set: TextureSetData) => {
      this.sets.set(set.name, this.toTextures(set));
      done++;
      onProgress(done / names.length);
    };
    const workerCount = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    let workers: Worker[] = [];
    try {
      for (let i = 0; i < workerCount; i++) {
        workers.push(new Worker(new URL('./texture.worker.ts', import.meta.url), { type: 'module' }));
      }
    } catch {
      workers = [];
    }
    // Bigger, slower sets first so the pool stays balanced.
    const queue = names.map((n) => ({ name: n, size: n.startsWith('hair') || n === 'leaves' ? Math.max(256, size / 2) : size }));
    if (workers.length === 0) {
      for (const job of queue) {
        accept(generateTextureSet(job.name, job.size));
        await new Promise((r) => setTimeout(r, 0));
      }
      return;
    }
    let nextId = 0;
    await Promise.all(
      workers.map(
        (w) =>
          new Promise<void>((resolve) => {
            const pump = () => {
              const job = queue.shift();
              if (!job) {
                w.terminate();
                resolve();
                return;
              }
              const id = nextId++;
              w.onmessage = (e: MessageEvent<{ id: number; set?: TextureSetData; error?: string }>) => {
                if (e.data.set) accept(e.data.set);
                else {
                  // Worker failed: generate on the main thread so the game still loads.
                  console.warn('Texture worker error', e.data.error);
                  accept(generateTextureSet(job.name, job.size));
                }
                pump();
              };
              w.onerror = () => {
                accept(generateTextureSet(job.name, job.size));
                pump();
              };
              w.postMessage({ id, name: job.name, size: job.size });
            };
            pump();
          }),
      ),
    );
  }

  private toTextures(set: TextureSetData) {
    const mk = (data: Uint8Array, srgb: boolean) => {
      const t = new THREE.DataTexture(data, set.size, set.size, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = this.anisotropy;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return { map: mk(set.albedo, true), normal: mk(set.normal, false), orm: mk(set.orm, false) };
  }

  /** Material by catalogue name. `tileOverride` gives a separate instance with a different repeat. */
  get(name: string, tileOverride?: number): THREE.MeshStandardMaterial {
    const key = tileOverride ? `${name}@${tileOverride}` : name;
    const cached = this.mats.get(key);
    if (cached) return cached;
    const def = MATERIAL_DEFS[name];
    if (!def) throw new Error(`Unknown material ${name}`);
    const set = this.sets.get(def.recipe);
    if (!set) throw new Error(`Texture set ${def.recipe} not generated`);
    const tile = tileOverride ?? def.tile;
    const rep = (t: THREE.Texture) => {
      const c = t.clone();
      c.repeat.set(1 / tile, 1 / tile);
      c.needsUpdate = true;
      return c;
    };
    const m = new THREE.MeshStandardMaterial({
      name: key,
      map: rep(set.map),
      normalMap: rep(set.normal),
      roughnessMap: rep(set.orm),
      metalnessMap: rep(set.orm),
      aoMap: rep(set.orm),
      aoMapIntensity: 1,
      color: def.color ?? 0xffffff,
      roughness: def.roughnessScale ?? 1,
      metalness: def.metalness ?? 1,
      normalScale: new THREE.Vector2(def.normalScale ?? 1, def.normalScale ?? 1),
      envMap: this.envMap,
      envMapIntensity: def.envIntensity ?? 0.35,
      side: def.side ?? THREE.FrontSide,
    });
    if (def.alphaTest) {
      m.alphaTest = def.alphaTest;
      m.transparent = false;
    }
    this.mats.set(key, m);
    return m;
  }

  /** Creates the shared non-textured materials. */
  buildBasics(): void {
    const env = this.envMap;
    const std = (name: string, p: THREE.MeshStandardMaterialParameters) =>
      this.basic.set(name, new THREE.MeshStandardMaterial({ name, envMap: env, envMapIntensity: 0.6, ...p }));
    std('chrome', { color: 0xb8b8b8, metalness: 1, roughness: 0.25 });
    std('steel', { color: 0x8d8f90, metalness: 0.9, roughness: 0.45 });
    std('brass', { color: 0xa8843e, metalness: 1, roughness: 0.4 });
    std('black_plastic', { color: 0x141414, roughness: 0.5 });
    std('white_plastic', { color: 0xd9d6cc, roughness: 0.45 });
    std('switchboard', { color: 0xe4e0d4, roughness: 0.35 });
    std('cable', { color: 0x111111, roughness: 0.6 });
    std('paper', { color: 0xd8d0b8, roughness: 0.95, side: THREE.DoubleSide });
    std('dark', { color: 0x050505, roughness: 1 });
    std('glass', {
      color: 0x223038,
      roughness: 0.05,
      metalness: 0.3,
      transparent: true,
      opacity: 0.35,
      envMapIntensity: 1.2,
      depthWrite: false,
    });
    std('glass_dirty', {
      color: 0x3a4440,
      roughness: 0.3,
      metalness: 0.2,
      transparent: true,
      opacity: 0.55,
      envMapIntensity: 0.8,
      depthWrite: false,
    });
    std('mirror_back', { color: 0x222222, roughness: 0.2, metalness: 0.8 });
    std('marigold', { color: 0xd98a1a, roughness: 0.8 });
    std('kumkum', { color: 0x9a1b14, roughness: 0.7 });
    std('blood', { color: 0x2a0503, roughness: 0.25, transparent: true, opacity: 0.9, depthWrite: false });
    std('water', { color: 0x0a0d10, roughness: 0.02, metalness: 0.4, transparent: true, opacity: 0.75, envMapIntensity: 1.5 });
    std('screen_off', { color: 0x060808, roughness: 0.15, metalness: 0.4, envMapIntensity: 1 });
    std('tyre', { color: 0x0b0b0b, roughness: 0.85 });
    std('bike_red', { color: 0x6e1210, roughness: 0.3, metalness: 0.4 });
    std('bike_blue', { color: 0x10264e, roughness: 0.3, metalness: 0.4 });
    std('bike_black', { color: 0x0e0e10, roughness: 0.35, metalness: 0.4 });
    std('emergency_box', { color: 0xc8c4b8, roughness: 0.5 });
    std('extinguisher', { color: 0x8a1410, roughness: 0.3, metalness: 0.1 });
    std('book_a', { color: 0x2b3d5c, roughness: 0.8 });
    std('book_b', { color: 0x6b1e1e, roughness: 0.8 });
    std('book_c', { color: 0x3d5a2f, roughness: 0.8 });
    std('book_d', { color: 0xb58f3a, roughness: 0.8 });
    std('book_e', { color: 0x222222, roughness: 0.8 });
    std('tank_black', { color: 0x101112, roughness: 0.55 });
    std('foliage_dark', { color: 0x0f1a0c, roughness: 0.9 });
  }

  /** Emissive surfaces get per-fixture instances so they can flicker independently. */
  emissive(color: number, intensity: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  }

  getBasic(name: string): THREE.Material {
    const m = this.basic.get(name);
    if (!m) throw new Error(`Unknown basic material ${name}`);
    return m;
  }
}
