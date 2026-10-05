import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Circuit, Fixture, WorldCtx } from '../context';
import { cbox, normalizeUv, rod } from '../geom';
import { power } from '../../systems/power';
import { decal, label } from '../textArt';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = cast;
  me.receiveShadow = true;
  return me;
}

let glowTexture: THREE.Texture | null = null;
/** Soft radial gradient used for light halos and fake volumetric glow. */
export function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

export function glowSprite(color: THREE.ColorRepresentation, size: number, opacity = 0.5): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    }),
  );
  s.scale.setScalar(size);
  s.userData.dynamic = true;
  s.userData.baseOpacity = opacity;
  return s;
}

export function registerFixture(ctx: WorldCtx, f: Omit<Fixture, 'level' | 'forced' | 'color'> & { color: number }): Fixture {
  const fx: Fixture = { ...f, color: new THREE.Color(f.color), level: 0, forced: null };
  ctx.fixtures.push(fx);
  return fx;
}

/**
 * Wall/ceiling tube light: white metal batten with a 4 ft tube. Returns the group; registers a
 * fixture whose emissive tube flickers with the lighting system. Local: tube along X, facing -Y.
 */
export function tubeLight(
  ctx: WorldCtx,
  id: string,
  circuit: Circuit,
  floor: number,
  worldPos: THREE.Vector3,
  rotY: number,
  opts: { unstable?: number; intensity?: number; color?: number; wall?: boolean } = {},
): THREE.Group {
  const g = new THREE.Group();
  const batten = ctx.mats.getBasic('white_plastic');
  g.add(mesh(cbox(1.24, 0.045, 0.07), batten, 0, 0.0225, 0, false));
  const tubeMat = ctx.mats.emissive(opts.color ?? 0xdfeeff, 2.4);
  const tube = mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 1.18, 10), tubeMat, 0, -0.02, 0, false);
  tube.rotation.z = Math.PI / 2;
  g.add(tube);
  for (const sx of [-1, 1]) g.add(mesh(cbox(0.03, 0.05, 0.05), batten, sx * 0.6, -0.01, 0, false));
  // Dead insects and dust darken the tube ends.
  for (const sx of [-1, 1]) {
    const end = mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.09, 10), ctx.mats.getBasic('black_plastic'), sx * 0.545, -0.02, 0, false);
    end.rotation.z = Math.PI / 2;
    g.add(end);
  }
  g.userData.rigid = true;
  g.position.copy(worldPos);
  g.rotation.y = rotY;
  if (opts.wall) g.rotation.x = 0;
  g.traverse((o) => (o.userData.dynamic = true));
  const glow = glowSprite(opts.color ?? 0xcfe0ff, 1.6, 0.18);
  glow.position.set(0, -0.06, 0);
  g.add(glow);
  ctx.scene.add(g);
  registerFixture(ctx, {
    id,
    pos: worldPos.clone().add(new THREE.Vector3(0, -0.25, 0)),
    color: opts.color ?? 0xd8e6ff,
    intensity: opts.intensity ?? 9,
    range: 9,
    circuit,
    mats: [tubeMat],
    emissiveBase: 2.4,
    unstable: opts.unstable ?? 0.05,
    floor,
    glow,
    buzz: true,
  });
  return g;
}

/** Caged bulb (bathrooms, terrace, security booth). */
export function bulbLight(
  ctx: WorldCtx,
  id: string,
  circuit: Circuit,
  floor: number,
  pos: THREE.Vector3,
  color = 0xffc77a,
  intensity = 6,
  unstable = 0.1,
): Fixture {
  const g = new THREE.Group();
  const bulbMat = ctx.mats.emissive(color, 3);
  g.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), bulbMat, 0, -0.08, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 8), ctx.mats.getBasic('black_plastic'), 0, -0.02, 0, false));
  g.add(mesh(rod(V(0, 0, 0), V(0, 0.25, 0), 0.004), ctx.mats.getBasic('cable'), 0, 0, 0, false));
  const glow = glowSprite(color, 1.1, 0.3);
  glow.position.y = -0.08;
  g.add(glow);
  g.position.copy(pos);
  g.traverse((o) => (o.userData.dynamic = true));
  g.userData.rigid = true;
  ctx.scene.add(g);
  return registerFixture(ctx, {
    id,
    pos: pos.clone().add(new THREE.Vector3(0, -0.15, 0)),
    color,
    intensity,
    range: 7,
    circuit,
    mats: [bulbMat],
    emissiveBase: 3,
    unstable,
    floor,
    glow,
    buzz: false,
  });
}

/** Battery emergency light box that glows red when the mains fail. Local: faces +Z. */
export function emergencyLight(ctx: WorldCtx, id: string, floor: number, pos: THREE.Vector3, rotY: number): void {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(0.34, 0.12, 0.08, 2, 0.015), ctx.mats.getBasic('emergency_box'), 0, 0, 0, false));
  const lens = ctx.mats.emissive(0xff2a1a, 2.5);
  g.add(mesh(cbox(0.26, 0.05, 0.01), lens, 0, -0.01, 0.042, false));
  const glow = glowSprite(0xff2010, 1.4, 0.35);
  glow.position.set(0, -0.05, 0.12);
  g.add(glow);
  g.position.copy(pos);
  g.rotation.y = rotY;
  g.userData.rigid = true;
  g.traverse((o) => (o.userData.dynamic = true));
  ctx.scene.add(g);
  const out = new THREE.Vector3(0, -0.3, 0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(pos);
  registerFixture(ctx, {
    id,
    pos: out,
    color: 0xff2414,
    intensity: 7,
    range: 10,
    circuit: 'EMERGENCY',
    mats: [lens],
    emissiveBase: 2.5,
    unstable: 0.02,
    floor,
    glow,
    buzz: false,
  });
}

/**
 * Three-blade ceiling fan with downrod. Spins while its circuit is live (with spin-up and coast
 * down), wobbles slightly. `forceSpin` lets the story make a fan turn with the power off.
 */
export function ceilingFan(ctx: WorldCtx, pos: THREE.Vector3, circuit: Circuit, rodLen = 0.45): THREE.Group {
  const g = new THREE.Group();
  const body = ctx.mats.get('metal_cream', 1);
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 16), body, 0, -0.03, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, rodLen, 8), body, 0, -rodLen / 2, 0, false));
  const rotor = new THREE.Group();
  rotor.position.y = -rodLen - 0.05;
  const housing = [
    new THREE.Vector2(0, 0.07),
    new THREE.Vector2(0.09, 0.06),
    new THREE.Vector2(0.13, 0.02),
    new THREE.Vector2(0.13, -0.02),
    new THREE.Vector2(0.09, -0.05),
    new THREE.Vector2(0.03, -0.07),
    new THREE.Vector2(0, -0.07),
  ];
  rotor.add(mesh(new THREE.LatheGeometry(housing, 20), body, 0, 0, 0, true));
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI * 2) / 3;
    arm.add(mesh(cbox(0.2, 0.01, 0.04), ctx.mats.get('metal_black', 1), 0.2, -0.01, 0, false));
    const blade = mesh(normalizeUv(new RoundedBoxGeometry(0.48, 0.008, 0.11, 1, 0.003), 1), body, 0.5, -0.015, 0, true);
    blade.rotation.x = 0.12;
    // Blades droop slightly — old fans always do.
    blade.rotation.z = -0.03;
    arm.add(blade);
    rotor.add(arm);
  }
  rotor.userData.anim = true;
  rotor.userData.rigid = true;
  g.userData.rigid = true;
  g.add(rotor);
  g.position.copy(pos);
  g.traverse((o) => (o.userData.dynamic = true));
  ctx.scene.add(g);
  let speed = 0;
  g.userData.forceSpin = 0;
  g.userData.stopUntil = 0;
  ctx.emitters.push({
    id: `fan${ctx.emitters.length}`,
    sound: 'fan',
    pos: pos.clone().setY(pos.y - 0.5),
    volume: 0.35,
    active: () => speed > 2,
  });
  ctx.animated.push({
    update: (dt, t) => {
      const stopped = t < (g.userData.stopUntil as number);
      const target = power.on(circuit) && !stopped ? 9.5 : (g.userData.forceSpin as number);
      speed += (target - speed) * Math.min(1, dt * (target > speed ? 0.6 : 0.18));
      rotor.rotation.y += speed * dt;
      g.rotation.z = Math.sin(t * speed * 0.9) * 0.004 * Math.min(1, speed / 5);
    },
  });
  g.userData.getSpeed = () => speed;
  return g;
}

/** Modular switchboard: white plate with rocker switches, a fan regulator and a socket. Faces +Z. */
export function switchboard(ctx: WorldCtx, switches = 4, regulator = true): THREE.Group {
  const g = new THREE.Group();
  const w = 0.08 * switches + (regulator ? 0.1 : 0) + 0.06;
  g.add(mesh(new RoundedBoxGeometry(w, 0.16, 0.025, 2, 0.006), ctx.mats.getBasic('switchboard'), 0, 0, 0, false));
  for (let i = 0; i < switches; i++) {
    const sw = mesh(
      new RoundedBoxGeometry(0.035, 0.05, 0.015, 1, 0.004),
      ctx.mats.getBasic('white_plastic'),
      -w / 2 + 0.06 + i * 0.08,
      0.02,
      0.015,
      false,
    );
    sw.rotation.x = i % 2 === 0 ? 0.12 : -0.12;
    g.add(sw);
  }
  if (regulator) {
    const knob = mesh(
      new THREE.CylinderGeometry(0.028, 0.03, 0.025, 14),
      ctx.mats.getBasic('white_plastic'),
      w / 2 - 0.07,
      0.01,
      0.018,
      false,
    );
    knob.rotation.x = Math.PI / 2;
    g.add(knob);
  }
  // Grimy finger marks.
  const sock = mesh(cbox(0.05, 0.05, 0.004), ctx.mats.getBasic('black_plastic'), -w / 2 + 0.06, -0.045, 0.014, false);
  g.add(sock);
  return g;
}

/**
 * Window for an opening of size w × h (local frame: X along the wall, Y up, +Z outward).
 * Wooden frame, two glazed shutters, vertical iron grille bars, a concrete sill and an external
 * chajja (sunshade) — the defining silhouette of Indian buildings.
 */
export function windowUnit(
  ctx: WorldCtx,
  w: number,
  h: number,
  wallT: number,
  opts: { chajja?: boolean; grille?: boolean; frame?: string; openShutter?: boolean; dirty?: boolean; shutterOpen?: number } = {},
): THREE.Group {
  const g = new THREE.Group();
  const frame = ctx.mats.get(opts.frame ?? 'wood_door_green', 1);
  const ft = 0.06;
  // Outer frame (chaukhat).
  g.add(mesh(cbox(w, ft, wallT * 0.6), frame, 0, h / 2 - ft / 2, 0));
  g.add(mesh(cbox(w, ft, wallT * 0.6), frame, 0, -h / 2 + ft / 2, 0));
  g.add(mesh(cbox(ft, h, wallT * 0.6), frame, -w / 2 + ft / 2, 0, 0));
  g.add(mesh(cbox(ft, h, wallT * 0.6), frame, w / 2 - ft / 2, 0, 0));
  g.add(mesh(cbox(ft * 0.7, h - ft * 2, wallT * 0.5), frame, 0, 0, 0));
  // Glass shutters (four panes each) — slightly ajar on some windows.
  const glass = ctx.mats.getBasic(opts.dirty ? 'glass_dirty' : 'glass');
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set((side * (w - ft * 2)) / 2, 0, wallT * 0.15);
    const sw = (w - ft * 3) / 2;
    const leaf = new THREE.Group();
    leaf.position.x = (-side * sw) / 2;
    leaf.add(mesh(cbox(sw, 0.04, 0.035), frame, 0, (h - ft * 2) / 2 - 0.02, 0, false));
    leaf.add(mesh(cbox(sw, 0.04, 0.035), frame, 0, -(h - ft * 2) / 2 + 0.02, 0, false));
    leaf.add(mesh(cbox(0.04, h - ft * 2, 0.035), frame, -sw / 2 + 0.02, 0, 0, false));
    leaf.add(mesh(cbox(0.04, h - ft * 2, 0.035), frame, sw / 2 - 0.02, 0, 0, false));
    leaf.add(mesh(cbox(sw, 0.03, 0.03), frame, 0, 0, 0, false));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.06, h - ft * 2 - 0.06), glass);
    pane.renderOrder = 2;
    leaf.add(pane);
    pivot.add(leaf);
    pivot.rotation.y = side * (opts.shutterOpen ?? 0) * (side > 0 ? 1 : 0.6);
    g.add(pivot);
  }
  if (opts.grille !== false) {
    const iron = ctx.mats.get('rust', 1);
    const n = Math.max(3, Math.round(w / 0.13));
    for (let i = 1; i < n; i++) {
      const x = -w / 2 + (w * i) / n;
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, h - 0.02, 6), iron, x, 0, wallT * 0.42, false));
    }
    g.add(mesh(cbox(w - 0.02, 0.025, 0.012), iron, 0, h * 0.18, wallT * 0.42, false));
    g.add(mesh(cbox(w - 0.02, 0.025, 0.012), iron, 0, -h * 0.18, wallT * 0.42, false));
  }
  const conc = ctx.mats.get('concrete', 1);
  g.add(mesh(cbox(w + 0.12, 0.05, wallT + 0.1), conc, 0, -h / 2 - 0.025, 0.04));
  if (opts.chajja !== false) {
    const ch = mesh(cbox(w + 0.5, 0.08, 0.55), ctx.mats.get('facade', 1.5), 0, h / 2 + 0.22, wallT / 2 + 0.27);
    g.add(ch);
    // Drip edge.
    g.add(mesh(cbox(w + 0.5, 0.05, 0.03), conc, 0, h / 2 + 0.16, wallT / 2 + 0.53));
  }
  return g;
}

/** Simple curtain on a rod; returns the curtain mesh for animation (hiding spot / apparition). */
export function curtainPanel(ctx: WorldCtx, w: number, h: number, mat = 'curtain'): { group: THREE.Group; cloth: THREE.Mesh } {
  const g = new THREE.Group();
  g.add(mesh(rod(V(-w / 2 - 0.1, 0, 0), V(w / 2 + 0.1, 0, 0), 0.008), ctx.mats.getBasic('steel'), 0, 0, 0, false));
  const geo = new THREE.PlaneGeometry(w, h, 24, 10);
  geo.translate(0, -h / 2 - 0.02, 0);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const base = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const z = Math.sin(pos.getX(i) * 26) * 0.035;
    pos.setZ(i, z);
    base[i] = z;
  }
  geo.computeVertexNormals();
  const cloth = new THREE.Mesh(geo, ctx.mats.get(mat, 1.5));
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  cloth.userData.dynamic = true;
  cloth.userData.base = base;
  g.add(cloth);
  g.traverse((o) => (o.userData.dynamic = true));
  return { group: g, cloth };
}

/** Wall-mounted dome CCTV camera with blinking LED. Faces +Z. */
export function cctvCamera(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const white = ctx.mats.getBasic('white_plastic');
  g.add(mesh(cbox(0.08, 0.08, 0.02), white, 0, 0, 0, false));
  g.add(mesh(cbox(0.03, 0.03, 0.12), white, 0, 0, 0.06, false));
  const body = mesh(new RoundedBoxGeometry(0.09, 0.08, 0.2, 2, 0.02), white, 0, -0.03, 0.15, true);
  body.rotation.x = 0.35;
  g.add(body);
  const lens = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12), ctx.mats.getBasic('screen_off'), 0, -0.07, 0.25, false);
  lens.rotation.x = Math.PI / 2 + 0.35;
  g.add(lens);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), ctx.mats.emissive(0xff1010, 4));
  led.position.set(0.03, -0.02, 0.24);
  led.userData.keep = true;
  g.userData.rigid = true;
  g.add(led);
  g.traverse((o) => (o.userData.dynamic = true));
  let tt = Math.random() * 3;
  ctx.animated.push({
    update: (dt) => {
      tt += dt;
      led.visible = tt % 2 < 0.15;
    },
  });
  return g;
}

/** ABC fire extinguisher hanging on a wall bracket (with an expired inspection tag). */
export function extinguisher(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const red = ctx.mats.getBasic('extinguisher');
  const body = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.075, 0),
    new THREE.Vector2(0.08, 0.02),
    new THREE.Vector2(0.08, 0.48),
    new THREE.Vector2(0.06, 0.53),
    new THREE.Vector2(0.02, 0.56),
    new THREE.Vector2(0, 0.56),
  ];
  g.add(mesh(new THREE.LatheGeometry(body, 16), red, 0, 0, 0));
  g.add(mesh(cbox(0.06, 0.04, 0.03), ctx.mats.getBasic('black_plastic'), 0, 0.6, 0));
  g.add(mesh(new THREE.TorusGeometry(0.06, 0.008, 5, 12, Math.PI * 1.3), ctx.mats.getBasic('black_plastic'), 0.06, 0.45, 0.04));
  const tag = decal(label('EXP 03/2014', 128, 64, '#e8d36a', '#1a1a1a'), 0.07, 0.035);
  tag.position.set(0, 0.3, 0.082);
  g.add(tag);
  return g;
}

/** Cork notice board with an aluminium frame. Returns group; notices are attached by caller. */
export function noticeBoard(ctx: WorldCtx, w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cbox(w, h, 0.025), new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 1 }), 0, 0, 0, false));
  const al = ctx.mats.getBasic('steel');
  g.add(mesh(cbox(w + 0.04, 0.03, 0.035), al, 0, h / 2, 0, false));
  g.add(mesh(cbox(w + 0.04, 0.03, 0.035), al, 0, -h / 2, 0, false));
  g.add(mesh(cbox(0.03, h, 0.035), al, -w / 2, 0, 0, false));
  g.add(mesh(cbox(0.03, h, 0.035), al, w / 2, 0, 0, false));
  return g;
}

/** Steel water cooler with three taps and a drip tray. */
export function waterCooler(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const steel = ctx.mats.getBasic('steel');
  g.add(mesh(new RoundedBoxGeometry(0.8, 1.2, 0.6, 2, 0.02), steel, 0, 0.6, 0));
  g.add(mesh(cbox(0.75, 0.05, 0.2), steel, 0, 0.45, 0.38));
  for (let i = 0; i < 3; i++) {
    g.add(mesh(rod(V(-0.2 + i * 0.2, 0.75, 0.3), V(-0.2 + i * 0.2, 0.75, 0.36), 0.012), ctx.mats.getBasic('chrome'), 0, 0, 0, false));
    g.add(mesh(rod(V(-0.2 + i * 0.2, 0.75, 0.36), V(-0.2 + i * 0.2, 0.7, 0.37), 0.01), ctx.mats.getBasic('chrome'), 0, 0, 0, false));
  }
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), ctx.mats.getBasic('water'));
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(0.1, 0.004, 0.6);
  puddle.scale.set(1.3, 0.7, 1);
  g.add(puddle);
  return g;
}

/** Wall-hung washbasin with a pillar tap. Faces +Z. */
export function washbasin(ctx: WorldCtx): THREE.Group {
  const g = new THREE.Group();
  const c = ctx.mats.get('ceramic', 1);
  const pts = [
    new THREE.Vector2(0, -0.12),
    new THREE.Vector2(0.16, -0.1),
    new THREE.Vector2(0.24, 0),
    new THREE.Vector2(0.25, 0.02),
    new THREE.Vector2(0.22, 0.02),
    new THREE.Vector2(0.18, -0.06),
    new THREE.Vector2(0, -0.08),
  ];
  const basin = mesh(new THREE.LatheGeometry(pts, 24), c, 0, 0, 0.22);
  basin.scale.set(1, 1, 0.8);
  g.add(basin);
  g.add(mesh(rod(V(0, 0.02, 0.06), V(0, 0.16, 0.06), 0.012), ctx.mats.getBasic('chrome'), 0, 0, 0, false));
  g.add(mesh(rod(V(0, 0.16, 0.06), V(0, 0.14, 0.16), 0.01), ctx.mats.getBasic('chrome'), 0, 0, 0, false));
  g.add(mesh(rod(V(0, -0.1, 0.2), V(0, -0.8, 0.05), 0.02), ctx.mats.getBasic('white_plastic'), 0, 0, 0, false));
  return g;
}

/** Electrical distribution board (grey steel box) with conduit pipes running up. Faces +Z. */
export function distributionBoard(ctx: WorldCtx, w = 0.6, h = 0.8): THREE.Group {
  const g = new THREE.Group();
  const m = ctx.mats.get('metal_almirah', 1);
  g.add(mesh(cbox(w, h, 0.16), m, 0, 0, 0));
  g.add(mesh(cbox(w - 0.04, h - 0.04, 0.01), ctx.mats.get('metal_cream', 1), 0, 0, 0.085, false));
  for (let i = 0; i < 4; i++)
    g.add(
      mesh(
        rod(V(-w / 2 + 0.1 + i * 0.12, h / 2, -0.03), V(-w / 2 + 0.1 + i * 0.12, h / 2 + 2.0, -0.03), 0.014),
        ctx.mats.getBasic('black_plastic'),
        0,
        0,
        0,
        false,
      ),
    );
  const warn = decal(label('⚡ DANGER 440V', 256, 80, '#d9b21c', '#111'), 0.24, 0.075);
  warn.position.set(0, h / 2 - 0.1, 0.092);
  g.add(warn);
  return g;
}

/** Exposed pipe run (for bathrooms, terrace, water tank area). */
export function pipeRun(ctx: WorldCtx, pts: THREE.Vector3[], r = 0.03, mat = 'rust'): THREE.Group {
  const g = new THREE.Group();
  const m = ctx.mats.get(mat, 1);
  for (let i = 0; i < pts.length - 1; i++) {
    g.add(mesh(rod(pts[i]!, pts[i + 1]!, r, 8), m, 0, 0, 0, false));
    if (i > 0) g.add(mesh(new THREE.SphereGeometry(r * 1.35, 8, 6), m, pts[i]!.x, pts[i]!.y, pts[i]!.z, false));
  }
  return g;
}
