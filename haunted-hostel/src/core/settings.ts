import { storage } from './storage';

export type Preset = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA' | 'CUSTOM';
/** 0 = off/lowest … 3 = ultra. */
export type Level = 0 | 1 | 2 | 3;

export interface GraphicsSettings {
  preset: Preset;
  shadowQuality: Level;
  textureQuality: Level;
  effectsQuality: Level;
  fogQuality: Level;
  renderScale: number;
  fpsLimit: 30 | 60 | 0;
}

export interface ControlLayout {
  /** Per button: position as fraction of the viewport (x from left, y from top) and a size multiplier. */
  buttons: Record<string, { x: number; y: number; s: number }>;
  opacity: number;
  scale: number;
  leftHanded: boolean;
  sprintToggle: boolean;
}

export interface Settings {
  graphics: GraphicsSettings;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  brightness: number;
  volumes: { master: number; music: number; sfx: number; ambience: number };
  subtitles: boolean;
  vibration: boolean;
  headBob: boolean;
  language: string;
  controls: ControlLayout;
}

export const PRESETS: Record<Exclude<Preset, 'CUSTOM'>, Omit<GraphicsSettings, 'preset'>> = {
  LOW: { shadowQuality: 0, textureQuality: 0, effectsQuality: 0, fogQuality: 0, renderScale: 0.6, fpsLimit: 30 },
  MEDIUM: { shadowQuality: 1, textureQuality: 1, effectsQuality: 1, fogQuality: 1, renderScale: 0.75, fpsLimit: 60 },
  HIGH: { shadowQuality: 2, textureQuality: 2, effectsQuality: 2, fogQuality: 2, renderScale: 1, fpsLimit: 60 },
  ULTRA: { shadowQuality: 3, textureQuality: 3, effectsQuality: 3, fogQuality: 3, renderScale: 1, fpsLimit: 0 },
};

export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;

export const DEFAULT_BUTTONS: ControlLayout['buttons'] = {
  interact: { x: 0.86, y: 0.56, s: 1.25 },
  flashlight: { x: 0.94, y: 0.38, s: 0.9 },
  crouch: { x: 0.94, y: 0.74, s: 0.9 },
  sprint: { x: 0.76, y: 0.74, s: 0.9 },
  jump: { x: 0.76, y: 0.42, s: 0.8 },
  inventory: { x: 0.9, y: 0.08, s: 0.75 },
  phone: { x: 0.82, y: 0.08, s: 0.75 },
  pause: { x: 0.97, y: 0.08, s: 0.75 },
  breath: { x: 0.68, y: 0.6, s: 1.1 },
};

export function defaultSettings(): Settings {
  const preset: Exclude<Preset, 'CUSTOM'> = isTouchDevice() ? 'MEDIUM' : 'HIGH';
  return {
    graphics: { preset, ...PRESETS[preset] },
    sensitivity: 1,
    invertY: false,
    fov: 70,
    brightness: 1,
    volumes: { master: 0.9, music: 0.6, sfx: 1, ambience: 0.85 },
    subtitles: true,
    vibration: true,
    headBob: true,
    language: 'en',
    controls: { buttons: structuredClone(DEFAULT_BUTTONS), opacity: 0.55, scale: 1, leftHanded: false, sprintToggle: false },
  };
}

const KEY = 'hh.settings.v1';

export function loadSettings(): Settings {
  const d = defaultSettings();
  const s = storage.get<Partial<Settings> | null>(KEY, null);
  if (!s) return d;
  return {
    ...d,
    ...s,
    graphics: { ...d.graphics, ...(s.graphics ?? {}) },
    volumes: { ...d.volumes, ...(s.volumes ?? {}) },
    controls: { ...d.controls, ...(s.controls ?? {}), buttons: { ...d.controls.buttons, ...(s.controls?.buttons ?? {}) } },
  };
}

export function saveSettings(s: Settings): void {
  storage.set(KEY, s);
}

export function applyPreset(g: GraphicsSettings, p: Exclude<Preset, 'CUSTOM'>): void {
  Object.assign(g, PRESETS[p], { preset: p });
}

export const textureSize = (q: Level): number => [256, 512, 512, 1024][q]!;
export const shadowMapSize = (q: Level): number => [0, 512, 1024, 2048][q]!;
export const lightPoolSize = (q: Level): number => [3, 4, 6, 8][q]!;
