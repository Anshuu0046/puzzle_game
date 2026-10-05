import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../render/textures/materials';
import { Rng } from '../core/rng';

/**
 * Procedural ghost: a gaunt young woman in a stained salwar kameez with long, wet black hair
 * hanging over her face. Built from smooth lathe/sculpted geometry on a bone-like hierarchy so it
 * can be animated procedurally (see ghostAnim.ts). All materials share a dissolve uniform used to
 * make her fade in and out of existence.
 */
export interface GhostRig {
  root: THREE.Group;
  hips: THREE.Object3D;
  spine: THREE.Object3D;
  chest: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  jaw: THREE.Object3D;
  shoulderL: THREE.Object3D;
  shoulderR: THREE.Object3D;
  elbowL: THREE.Object3D;
  elbowR: THREE.Object3D;
  wristL: THREE.Object3D;
  wristR: THREE.Object3D;
  fingersL: THREE.Object3D[];
  fingersR: THREE.Object3D[];
  thighL: THREE.Object3D;
  thighR: THREE.Object3D;
  kneeL: THREE.Object3D;
  kneeR: THREE.Object3D;
  /** Shared uniforms: dissolve (0 visible … 1 gone), time, cloth swing. */
  uniforms: { uDissolve: { value: number }; uTime: { value: number }; uSwing: { value: number }; uGlow: { value: number } };
  materials: THREE.Material[];
  eyes: THREE.Mesh[];
}

/** Tapered capsule hanging from its origin along −Y. */
function limb(len: number, r0: number, r1: number, seg = 14): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.sin(a) * r0, Math.cos(a) * r0));
  }
  // Slight muscle bulge then taper — bony, not tubular.
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const r = r0 + (r1 - r0) * t + Math.sin(t * Math.PI) * (r0 * 0.12);
    pts.push(new THREE.Vector2(r, -len * t));
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * 0.5 + (i / n) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.sin(a) * r1, -len + Math.cos(a) * r1));
  }
  const g = new THREE.LatheGeometry(pts.reverse(), seg);
  return g;
}

/** Sculpted head: a deformed sphere with eye sockets, cheekbones, nose ridge and a hollow mouth. */
function headGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.1, 48, 36);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = v.x / 0.1;
    const ny = v.y / 0.1;
    const nz = v.z / 0.1;
    // Elongated, narrow skull; long jaw tapering to a pointed chin.
    let sx = 0.82;
    let sy = 1.18;
    let sz = 0.95;
    if (ny < 0) {
      sx *= 1 - Math.pow(-ny, 1.6) * 0.38;
      sz *= 1 - Math.pow(-ny, 2) * 0.15;
      sy *= 1.1;
    }
    let x = v.x * sx;
    let y = v.y * sy;
    let z = v.z * sz;
    let shade = 1;
    if (nz > 0.2) {
      // Face (front is +Z).
      const eyeY = 0.18;
      for (const ex of [-0.36, 0.36]) {
        const d = Math.hypot(nx - ex, ny - eyeY);
        if (d < 0.32) {
          const k = Math.cos((d / 0.32) * Math.PI * 0.5);
          z -= k * 0.022;
          shade = Math.min(shade, 1 - k * 0.92);
        }
      }
      // Cheekbones jut out, cheeks hollow below them.
      for (const cx of [-0.55, 0.55]) {
        const dc = Math.hypot(nx - cx, ny + 0.05);
        if (dc < 0.25) z += Math.cos((dc / 0.25) * Math.PI * 0.5) * 0.008;
        const dh = Math.hypot(nx - cx * 0.8, ny + 0.38);
        if (dh < 0.3) {
          z -= Math.cos((dh / 0.3) * Math.PI * 0.5) * 0.012;
          shade = Math.min(shade, 0.75);
        }
      }
      // Nose ridge.
      const dn = Math.abs(nx);
      if (dn < 0.12 && ny < 0.15 && ny > -0.35) z += (1 - dn / 0.12) * 0.016 * (1 - Math.abs(ny + 0.1) / 0.3);
      // Mouth: a dark, slightly open slit stretched too wide.
      const dm = Math.hypot(nx / 1.8, (ny + 0.55) / 0.5);
      if (dm < 0.22) {
        z -= (1 - dm / 0.22) * 0.02;
        shade = Math.min(shade, 0.05 + dm * 2);
      }
    }
    pos.setXYZ(i, x, y, z);
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade * 1.02;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Long hair as hundreds of ribbon strands, merged into one mesh. Roots on the scalp. */
function hairGeometry(rng: Rng): THREE.BufferGeometry {
  const strands: THREE.BufferGeometry[] = [];
  const N = 240;
  for (let i = 0; i < N; i++) {
    // Root on the upper skull, biased to the back and the crown; some at the front fall over the face.
    const theta = rng.range(0, Math.PI * 2);
    const phi = rng.range(0.05, Math.PI * 0.55);
    const front = Math.cos(theta) > 0.75;
    const root = new THREE.Vector3(
      Math.sin(phi) * Math.sin(theta) * 0.086,
      Math.cos(phi) * 0.118 + 0.005,
      Math.sin(phi) * Math.cos(theta) * 0.098,
    );
    const len = front ? rng.range(0.45, 0.62) : rng.range(0.6, 0.85);
    const pts: THREE.Vector3[] = [root.clone()];
    // First part follows the skull outward, then hangs straight down with a slight wave.
    const out = new THREE.Vector3(root.x, 0, root.z).normalize();
    const segs = 12;
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      const p = root.clone();
      const drop = t * len;
      const hug = Math.min(1, drop / 0.15);
      p.addScaledVector(out, 0.022 * hug + (front ? 0.04 * hug : 0.012));
      p.y -= drop;
      p.x += Math.sin(t * 7 + i) * 0.006 + rng.range(-0.004, 0.004);
      p.z += Math.cos(t * 5 + i) * 0.006;
      pts.push(p);
    }
    const w = rng.range(0.012, 0.03);
    const curve = new THREE.CatmullRomCurve3(pts);
    const posArr: number[] = [];
    const uvArr: number[] = [];
    const idx: number[] = [];
    const side = new THREE.Vector3(-out.z, 0, out.x);
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const c = curve.getPoint(t);
      const ww = w * (1 - t * 0.6);
      posArr.push(c.x - side.x * ww, c.y, c.z - side.z * ww, c.x + side.x * ww, c.y, c.z + side.z * ww);
      const u0 = (i % 16) / 16;
      uvArr.push(u0, 1 - t, u0 + 1 / 16, 1 - t);
      if (s < segs) {
        const b = s * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    strands.push(g);
  }
  return mergeGeometries(strands)!;
}

/** Injects dissolve + faint glow (+ optional cloth/hair sway) into a standard material. */
function ghostify(mat: THREE.MeshStandardMaterial, u: GhostRig['uniforms'], sway: 'none' | 'cloth' | 'hair'): THREE.MeshStandardMaterial {
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDissolve = u.uDissolve;
    sh.uniforms.uTime = u.uTime;
    sh.uniforms.uSwing = u.uSwing;
    sh.uniforms.uGlow = u.uGlow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSwing;\nvarying vec3 vGhostPos;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${
          sway === 'cloth'
            ? `float hang = clamp(-position.y * 1.6, 0.0, 1.0);
               transformed.x += sin(uTime * 2.1 + position.y * 9.0 + position.z * 4.0) * 0.012 * hang;
               transformed.z += (sin(uTime * 1.6 + position.y * 7.0 + position.x * 5.0) * 0.015 - uSwing * 0.12) * hang;`
            : sway === 'hair'
              ? `float hang = 1.0 - uv.y;
                 transformed.x += sin(uTime * 1.3 + position.x * 30.0) * 0.012 * hang;
                 transformed.z += (sin(uTime * 1.1 + position.z * 25.0) * 0.01 - uSwing * 0.18) * hang * hang;`
              : ''
        }`,
      )
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGhostPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uDissolve;
         uniform float uGlow;
         varying vec3 vGhostPos;
         float gh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
         float gnoise(vec3 p) {
           vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
           return mix(mix(mix(gh(i), gh(i + vec3(1,0,0)), f.x), mix(gh(i + vec3(0,1,0)), gh(i + vec3(1,1,0)), f.x), f.y),
                      mix(mix(gh(i + vec3(0,0,1)), gh(i + vec3(1,0,1)), f.x), mix(gh(i + vec3(0,1,1)), gh(i + vec3(1,1,1)), f.x), f.y), f.z);
         }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
         float dn = gnoise(vGhostPos * 9.0) * 0.6 + gnoise(vGhostPos * 23.0) * 0.4;
         if (dn < uDissolve) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float edgeGlow = smoothstep(uDissolve + 0.08, uDissolve, dn) * step(0.001, uDissolve);
         totalEmissiveRadiance += vec3(0.55, 0.65, 0.75) * edgeGlow * 2.0 + vec3(0.05, 0.065, 0.075) * uGlow;`,
      );
  };
  m.customProgramCacheKey = () => `ghost-${sway}`;
  return m;
}

export function buildGhost(mats: MaterialLibrary): GhostRig {
  const rng = new Rng(1411);
  const uniforms = { uDissolve: { value: 0 }, uTime: { value: 0 }, uSwing: { value: 0 }, uGlow: { value: 1 } };
  const skin = ghostify(mats.get('ghost_skin', 0.5), uniforms, 'none');
  skin.roughness = 0.7;
  const face = ghostify(mats.get('ghost_skin', 0.3), uniforms, 'none');
  face.vertexColors = true;
  const cloth = ghostify(mats.get('ghost_cloth', 0.6), uniforms, 'cloth');
  const salwar = ghostify(mats.get('ghost_cloth', 0.6), uniforms, 'cloth');
  salwar.color.setHex(0x8a7f88);
  const hairM = ghostify(mats.get('hair', 1), uniforms, 'hair');
  hairM.color.setHex(0x111111);
  hairM.roughness = 0.35;
  const dark = ghostify(new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 1 }), uniforms, 'none');
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xc8d4d0 });
  const materials: THREE.Material[] = [skin, face, cloth, salwar, hairM, dark];

  const node = (parent: THREE.Object3D, x: number, y: number, z: number, name: string) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const me = new THREE.Mesh(g, m);
    me.position.set(x, y, z);
    me.castShadow = true;
    me.receiveShadow = true;
    parent.add(me);
    return me;
  };

  const root = new THREE.Group();
  root.name = 'ghost';
  const hips = node(root, 0, 0.96, 0, 'hips');
  const spine = node(hips, 0, 0.1, 0, 'spine');
  const chest = node(spine, 0, 0.2, 0, 'chest');
  const neck = node(chest, 0, 0.21, 0.01, 'neck');
  const head = node(neck, 0, 0.1, 0.01, 'head');

  // Torso core (mostly hidden by the kurta), thin and bony.
  const torso = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, -0.12),
      new THREE.Vector2(0.13, -0.1),
      new THREE.Vector2(0.12, 0.05),
      new THREE.Vector2(0.14, 0.2),
      new THREE.Vector2(0.15, 0.3),
      new THREE.Vector2(0.06, 0.38),
      new THREE.Vector2(0.0, 0.39),
    ],
    18,
  );
  torso.scale(1, 1, 0.62);
  add(spine, torso, skin, 0, 0, 0);
  add(neck, limb(0.12, 0.034, 0.038), skin, 0, 0.11, -0.005);
  // Collarbones visible above the neckline.
  for (const s of [-1, 1]) {
    const cb = add(chest, limb(0.14, 0.012, 0.01, 8), skin, s * 0.01, 0.17, 0.05);
    cb.rotation.z = s * 1.35;
  }

  // Kurta: knee-length tunic with side slits, flaring from the waist, torn hem.
  const kurtaPts: THREE.Vector2[] = [];
  const kp: [number, number][] = [
    [0.07, 0.39],
    [0.15, 0.34],
    [0.165, 0.22],
    [0.145, 0.05],
    [0.15, -0.1],
    [0.2, -0.35],
    [0.25, -0.62],
    [0.27, -0.72],
  ];
  for (const [r, y] of kp) kurtaPts.push(new THREE.Vector2(r, y));
  const kurta = new THREE.LatheGeometry(kurtaPts, 40);
  const kpos = kurta.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < kpos.count; i++) {
    const x = kpos.getX(i);
    const y = kpos.getY(i);
    const z = kpos.getZ(i);
    const a = Math.atan2(x, z);
    // Folds and a ragged hem.
    const fold = Math.sin(a * 9 + y * 3) * 0.01 * Math.min(1, -y * 2);
    const r = Math.hypot(x, z) + fold;
    let ny = y;
    if (y < -0.6) ny += Math.sin(a * 13) * 0.04 + Math.sin(a * 31) * 0.02;
    kpos.setXYZ(i, Math.sin(a) * r, ny, Math.cos(a) * r * 0.72);
  }
  kurta.computeVertexNormals();
  add(spine, kurta, cloth, 0, 0, 0);

  // Shoulders, arms (with sleeves to the elbow), long-fingered hands.
  const armSide = (s: 1 | -1) => {
    const shoulder = node(chest, s * 0.16, 0.2, -0.01, s < 0 ? 'shoulderL' : 'shoulderR');
    add(shoulder, limb(0.29, 0.038, 0.03), skin);
    const sleeve = add(shoulder, limb(0.24, 0.058, 0.055, 16), cloth, 0, 0.01, 0);
    sleeve.scale.set(1, 1, 0.9);
    const elbow = node(shoulder, 0, -0.29, 0, s < 0 ? 'elbowL' : 'elbowR');
    add(elbow, limb(0.27, 0.028, 0.02), skin);
    const wrist = node(elbow, 0, -0.27, 0, s < 0 ? 'wristL' : 'wristR');
    const palm = add(wrist, limb(0.08, 0.022, 0.018, 10), skin);
    palm.scale.set(1.3, 1, 0.55);
    const fingers: THREE.Object3D[] = [];
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.011;
      const knuckle = node(wrist, fx, -0.085, 0.002, 'finger');
      add(knuckle, limb(0.06 + (f === 1 || f === 2 ? 0.015 : 0), 0.0055, 0.004, 6), skin);
      const tip = node(knuckle, 0, -0.065, 0, 'tip');
      add(tip, limb(0.05, 0.0045, 0.003, 6), skin);
      // Long, dark, broken nails.
      add(tip, limb(0.015, 0.004, 0.002, 5), dark, 0, -0.05, 0.002);
      fingers.push(knuckle, tip);
    }
    const thumb = node(wrist, s * -0.018, -0.03, 0.012, 'thumb');
    thumb.rotation.z = s * 0.6;
    add(thumb, limb(0.05, 0.006, 0.0045, 6), skin);
    return { shoulder, elbow, wrist, fingers };
  };
  const L = armSide(-1);
  const R = armSide(1);

  // Legs: salwar (loose trousers gathered at the ankle) over thin legs, bare feet.
  const legSide = (s: 1 | -1) => {
    const thigh = node(hips, s * 0.085, -0.02, 0, s < 0 ? 'thighL' : 'thighR');
    const sal = add(thigh, limb(0.46, 0.085, 0.07, 16), salwar);
    sal.scale.set(1, 1, 0.95);
    const knee = node(thigh, 0, -0.46, 0, s < 0 ? 'kneeL' : 'kneeR');
    add(knee, limb(0.42, 0.07, 0.045, 16), salwar);
    const ankle = node(knee, 0, -0.43, 0, 'ankle');
    add(ankle, limb(0.06, 0.03, 0.028, 10), skin);
    const foot = add(ankle, limb(0.2, 0.032, 0.024, 10), skin, 0, -0.06, 0.03);
    foot.rotation.x = Math.PI / 2;
    foot.scale.set(1, 1, 0.55);
    return { thigh, knee };
  };
  const LL = legSide(-1);
  const RL = legSide(1);

  // Head, eyes, jaw/mouth, hair.
  add(head, headGeometry(), face, 0, 0.09, 0.0);
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const socket = add(head, new THREE.SphereGeometry(0.014, 12, 10), dark, s * 0.03, 0.111, 0.077);
    socket.scale.set(1.2, 0.8, 0.6);
    // Tiny pale irises that catch the flashlight.
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), eyeM);
    eye.position.set(s * 0.03, 0.111, 0.084);
    head.add(eye);
    eyes.push(eye);
  }
  const jaw = node(head, 0, 0.035, 0.07, 'jaw');
  const mouth = add(jaw, new THREE.SphereGeometry(0.018, 14, 10), dark, 0, 0, 0.008);
  mouth.scale.set(1.6, 0.35, 0.5);
  const hair = new THREE.Mesh(hairGeometry(rng), hairM);
  hair.position.y = 0.09;
  hair.castShadow = true;
  head.add(hair);
  // Scalp cap so the roots don't show skin.
  const cap = add(head, new THREE.SphereGeometry(0.104, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.096, -0.006);
  cap.scale.set(0.86, 1.18, 0.98);

  root.traverse((o) => {
    o.userData.dynamic = true;
    o.frustumCulled = (o as THREE.Mesh).isMesh ? false : o.frustumCulled;
  });
  return {
    root,
    hips,
    spine,
    chest,
    neck,
    head,
    jaw,
    shoulderL: L.shoulder,
    shoulderR: R.shoulder,
    elbowL: L.elbow,
    elbowR: R.elbow,
    wristL: L.wrist,
    wristR: R.wrist,
    fingersL: L.fingers,
    fingersR: R.fingers,
    thighL: LL.thigh,
    thighR: RL.thigh,
    kneeL: LL.knee,
    kneeR: RL.knee,
    uniforms,
    materials,
    eyes,
  };
}
