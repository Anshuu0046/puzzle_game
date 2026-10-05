import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Face flags for `boxGeo` so hidden faces (against floors, inside walls) can be skipped. */
export const Face = { PX: 1, NX: 2, PY: 4, NY: 8, PZ: 16, NZ: 32, ALL: 63 } as const;

/**
 * Axis-aligned box in world coordinates with UVs in metres (planar per face).
 * `vBase` offsets the vertical UV so wall textures line up with the floor they stand on.
 */
export function boxGeo(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  faces: number = Face.ALL,
  vBase = 0,
): THREE.BufferGeometry {
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (y0 > y1) [y0, y1] = [y1, y0];
  if (z0 > z1) [z0, z1] = [z1, z0];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], uvs: number[][]) => {
    const base = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) nor.push(...n);
    for (const t of uvs) uv.push(t[0]!, t[1]!);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const yb0 = y0 - vBase;
  const yb1 = y1 - vBase;
  if (faces & Face.PZ)
    quad(
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
      [0, 0, 1],
      [
        [x0, yb0],
        [x1, yb0],
        [x1, yb1],
        [x0, yb1],
      ],
    );
  if (faces & Face.NZ)
    quad(
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0],
      [0, 0, -1],
      [
        [-x1, yb0],
        [-x0, yb0],
        [-x0, yb1],
        [-x1, yb1],
      ],
    );
  if (faces & Face.PX)
    quad(
      [x1, y0, z1],
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [1, 0, 0],
      [
        [-z1, yb0],
        [-z0, yb0],
        [-z0, yb1],
        [-z1, yb1],
      ],
    );
  if (faces & Face.NX)
    quad(
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
      [-1, 0, 0],
      [
        [z0, yb0],
        [z1, yb0],
        [z1, yb1],
        [z0, yb1],
      ],
    );
  if (faces & Face.PY)
    quad(
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0],
      [0, 1, 0],
      [
        [x0, -z1],
        [x1, -z1],
        [x1, -z0],
        [x0, -z0],
      ],
    );
  if (faces & Face.NY)
    quad(
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
      [0, -1, 0],
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ],
    );
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Centered box (local space) with metre UVs. Handy for props. */
export function cbox(w: number, h: number, d: number, faces: number = Face.ALL): THREE.BufferGeometry {
  return boxGeo(-w / 2, -h / 2, -d / 2, w / 2, h / 2, d / 2, faces);
}

/** Box with bevelled vertical edges (chamfer) — reads much less "primitive" under a flashlight. */
export function bevelBox(w: number, h: number, d: number, bevel: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const hw = w / 2 - bevel;
  const hd = d / 2 - bevel;
  s.moveTo(-hw, -d / 2);
  s.lineTo(hw, -d / 2);
  s.lineTo(w / 2, -hd);
  s.lineTo(w / 2, hd);
  s.lineTo(hw, d / 2);
  s.lineTo(-hw, d / 2);
  s.lineTo(-w / 2, hd);
  s.lineTo(-w / 2, -hd);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.5, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -h / 2, 0);
  normalizeUv(g, 1);
  return g;
}

/** Rescales UVs of generated geometry to approximately metre units. */
export function normalizeUv(g: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * scale, uv.getY(i) * scale);
  uv.needsUpdate = true;
  return g;
}

/** Cylinder between two points (pipes, bars, cables). */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate(mid.x, mid.y, mid.z);
  normalizeUv(g, len);
  return g;
}

/** Sagging cable as a tube along a catenary-like curve. */
export function cable(a: THREE.Vector3, b: THREE.Vector3, sag: number, r = 0.012): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 5, false);
}

/** Ensure attributes are uniform so geometries can be merged. */
export function prepForMerge(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.getAttribute('uv')) {
    const n = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.index) {
    const n = g.getAttribute('position').count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

interface BatchEntry {
  geos: THREE.BufferGeometry[];
  material: THREE.Material;
  cast: boolean;
  receive: boolean;
}

/**
 * Collects static geometry and merges it per material and per spatial cell, which keeps the draw
 * call count low while still letting frustum culling drop whole chunks of the building.
 */
export class StaticBatcher {
  private readonly entries = new Map<string, BatchEntry>();
  private readonly v = new THREE.Vector3();

  constructor(private readonly cellSize = 10.8) {}

  add(geo: THREE.BufferGeometry, material: THREE.Material, cast = true, receive = true): void {
    geo.computeBoundingBox();
    geo.boundingBox!.getCenter(this.v);
    const cx = Math.floor(this.v.x / this.cellSize);
    const cy = Math.floor((this.v.y + 0.5) / 3.4);
    const cz = Math.floor(this.v.z / this.cellSize);
    const key = `${material.uuid}|${cx}|${cy}|${cz}|${cast ? 1 : 0}`;
    let e = this.entries.get(key);
    if (!e) this.entries.set(key, (e = { geos: [], material, cast, receive }));
    e.geos.push(prepForMerge(geo));
  }

  /** Bakes every mesh inside `obj` (using its world transform) into the batch. */
  addObject(obj: THREE.Object3D, cast = true, receive = true): void {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.dynamic) return;
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      const mat = Array.isArray(m.material) ? m.material[0]! : m.material;
      this.add(g, mat, m.castShadow || cast, receive);
    });
  }

  build(parent: THREE.Object3D): number {
    let count = 0;
    for (const e of this.entries.values()) {
      const merged = e.geos.length === 1 ? e.geos[0]! : mergeGeometries(e.geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, e.material);
      mesh.castShadow = e.cast;
      mesh.receiveShadow = e.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      count++;
      for (const g of e.geos) if (g !== merged) g.dispose();
    }
    this.entries.clear();
    return count;
  }
}

/** Positions an object and returns it (Object3D.position is read-only, so Object.assign cannot be used). */
export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

export function rotAt<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.rotation.set(x, y, z);
  return o;
}
