import * as THREE from 'three';
import { bus } from '../core/events';

/** Axis-aligned boxes (minX, minY, minZ, maxX, maxY, maxZ) where it does not rain (roofs). */
export type Shelter = [number, number, number, number, number, number];

/**
 * Monsoon weather: GPU-animated rain streaks around the camera (culled under roofs in the vertex
 * shader), ground ripples, moonlight and lightning with delayed thunder. The moon/lightning light
 * casts a static shadow map that is only re-rendered when lightning strikes, so it costs nothing
 * per frame.
 */
export class Weather {
  readonly moon: THREE.DirectionalLight;
  private readonly rain: THREE.Mesh;
  private readonly ripples: THREE.Mesh;
  private readonly uniforms = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uShelters: { value: [] as THREE.Vector4[] },
    uShelterTops: { value: [] as THREE.Vector4[] },
    uIntensity: { value: 1 },
    uFlash: { value: 0 },
  };
  private readonly rippleUniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uIntensity: { value: 1 } };
  private nextStrike = 8 + Math.random() * 10;
  private flashT = -1;
  private flashPattern: number[] = [];
  flash = 0;
  private thunderAt = -1;
  private time = 0;
  /** 0 disables lightning (menu can still use it). */
  lightningEnabled = true;
  outdoorFactor = 1;

  constructor(scene: THREE.Scene, shelters: Shelter[], dropCount: number, shadowSize: number) {
    this.moon = new THREE.DirectionalLight(0x8fa6d6, 0.14);
    this.moon.position.set(-30, 60, 40);
    this.moon.target.position.set(20, 0, 5);
    scene.add(this.moon, this.moon.target);
    if (shadowSize > 0) {
      this.moon.castShadow = true;
      this.moon.shadow.mapSize.set(Math.min(2048, shadowSize * 2), Math.min(2048, shadowSize * 2));
      const c = this.moon.shadow.camera;
      c.left = -50;
      c.right = 50;
      c.top = 45;
      c.bottom = -45;
      c.near = 10;
      c.far = 160;
      this.moon.shadow.bias = -0.0008;
      this.moon.shadow.normalBias = 0.04;
      this.moon.shadow.autoUpdate = false;
      this.moon.shadow.needsUpdate = true;
    }
    // Shelters as two vec4 arrays (min.xyz + unused, max.xyz + unused).
    const MAXS = 12;
    for (let i = 0; i < MAXS; i++) {
      const s = shelters[i] ?? [0, -999, 0, 0, -998, 0];
      this.uniforms.uShelters.value.push(new THREE.Vector4(s[0], s[1], s[2], 0));
      this.uniforms.uShelterTops.value.push(new THREE.Vector4(s[3], s[4], s[5], 0));
    }

    // Rain: one quad per drop, instanced.
    const base = new THREE.PlaneGeometry(0.012, 0.55);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const offs = new Float32Array(dropCount * 4);
    for (let i = 0; i < dropCount; i++) {
      offs[i * 4] = Math.random() * 44 - 22;
      offs[i * 4 + 1] = Math.random() * 22;
      offs[i * 4 + 2] = Math.random() * 44 - 22;
      offs[i * 4 + 3] = 0.8 + Math.random() * 0.5;
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 4));
    geo.instanceCount = dropCount;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCam;
        uniform vec4 uShelters[12];
        uniform vec4 uShelterTops[12];
        attribute vec4 aOffset;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          float H = 22.0;
          float speed = 11.0 * aOffset.w;
          vec3 p;
          p.y = uCam.y - 6.0 + mod(aOffset.y - uTime * speed, H);
          p.x = uCam.x + mod(aOffset.x - uCam.x + 22.0 + uTime * 0.9, 44.0) - 22.0;
          p.z = uCam.z + mod(aOffset.z - uCam.z + 22.0, 44.0) - 22.0;
          float hidden = 0.0;
          for (int i = 0; i < 12; i++) {
            vec3 mn = uShelters[i].xyz;
            vec3 mx = uShelterTops[i].xyz;
            if (p.x > mn.x && p.x < mx.x && p.z > mn.z && p.z < mx.z && p.y < mx.y && p.y > mn.y) hidden = 1.0;
          }
          if (p.y < 0.0) hidden = 1.0;
          // Billboard horizontally toward the camera, slanted slightly by wind.
          vec3 toCam = normalize(vec3(uCam.x - p.x, 0.0, uCam.z - p.z));
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
          vec3 world = p + right * position.x + vec3(position.y * 0.08, position.y, 0.0);
          float d = length(uCam - p);
          vAlpha = (1.0 - hidden) * smoothstep(22.0, 6.0, d) * smoothstep(0.3, 1.5, d);
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
          if (hidden > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uIntensity;
        uniform float uFlash;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float a = vAlpha * edge * smoothstep(0.0, 0.4, vUv.y) * 0.22 * uIntensity;
          gl_FragColor = vec4(vec3(0.62, 0.68, 0.78) * (1.0 + uFlash * 3.0), a);
        }
      `,
    });
    this.rain = new THREE.Mesh(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 5;
    scene.add(this.rain);

    // Ground ripples on the courtyard and terrace.
    const rCount = Math.floor(dropCount / 12);
    const rbase = new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2);
    const rgeo = new THREE.InstancedBufferGeometry();
    rgeo.index = rbase.index;
    rgeo.setAttribute('position', rbase.getAttribute('position'));
    rgeo.setAttribute('uv', rbase.getAttribute('uv'));
    const roffs = new Float32Array(rCount * 3);
    for (let i = 0; i < rCount; i++) {
      roffs[i * 3] = Math.random() * 30 - 15;
      roffs[i * 3 + 1] = Math.random();
      roffs[i * 3 + 2] = Math.random() * 30 - 15;
    }
    rgeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(roffs, 3));
    rgeo.instanceCount = rCount;
    const rmat = new THREE.ShaderMaterial({
      uniforms: { ...this.rippleUniforms, uShelters: this.uniforms.uShelters, uShelterTops: this.uniforms.uShelterTops },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCam;
        uniform vec4 uShelters[12];
        uniform vec4 uShelterTops[12];
        attribute vec3 aOffset;
        varying vec2 vUv;
        varying float vT;
        varying float vA;
        void main() {
          vUv = uv;
          float cycle = 0.7;
          float t = fract(uTime / cycle + aOffset.y);
          float k = floor(uTime / cycle + aOffset.y);
          vec2 jitter = vec2(fract(sin(k * 12.9 + aOffset.x) * 43758.5), fract(sin(k * 78.2 + aOffset.z) * 12543.1)) * 4.0 - 2.0;
          vec3 p = vec3(uCam.x + mod(aOffset.x + jitter.x - uCam.x + 15.0, 30.0) - 15.0, 0.02, uCam.z + mod(aOffset.z + jitter.y - uCam.z + 15.0, 30.0) - 15.0);
          if (uCam.y > 9.0) p.y = 10.22;
          float hidden = 0.0;
          for (int i = 0; i < 12; i++) {
            vec3 mn = uShelters[i].xyz;
            vec3 mx = uShelterTops[i].xyz;
            if (p.x > mn.x && p.x < mx.x && p.z > mn.z && p.z < mx.z && p.y < mx.y && p.y > mn.y) hidden = 1.0;
          }
          vT = t;
          vA = (1.0 - hidden) * smoothstep(15.0, 5.0, length(uCam.xz - p.xz));
          vec3 world = p + position * (0.3 + t * 0.9);
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
          if (hidden > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uIntensity;
        varying vec2 vUv;
        varying float vT;
        varying float vA;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float ring = smoothstep(0.08, 0.0, abs(r - 0.8)) * (1.0 - vT);
          gl_FragColor = vec4(vec3(0.5, 0.55, 0.62), ring * vA * 0.28 * uIntensity);
        }
      `,
    });
    this.ripples = new THREE.Mesh(rgeo, rmat);
    this.ripples.frustumCulled = false;
    scene.add(this.ripples);
  }

  setQuality(drops: number): void {
    const g = this.rain.geometry as THREE.InstancedBufferGeometry;
    g.instanceCount = Math.min(drops, (g.getAttribute('aOffset') as THREE.InstancedBufferAttribute).count);
  }

  /** Forces a lightning strike now (scripted scares). */
  strike(close = false): void {
    this.flashT = 0;
    this.flashPattern = close ? [0, 0.08, 0.2, 0.32] : [0, 0.12, 0.35];
    const delay = close ? 0.25 : 1.2 + Math.random() * 2.5;
    this.thunderAt = this.time + delay;
    this.thunderClose = close;
    if (this.moon.castShadow) this.moon.shadow.needsUpdate = true;
  }
  private thunderClose = false;

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.rippleUniforms.uTime.value = this.time;
    camera.getWorldPosition(this.uniforms.uCam.value);
    this.rippleUniforms.uCam.value.copy(this.uniforms.uCam.value);
    if (this.lightningEnabled) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 18 + Math.random() * 30;
        this.strike(Math.random() < 0.2);
      }
    }
    // Flash envelope: a few sharp pulses.
    this.flash = 0;
    if (this.flashT >= 0) {
      this.flashT += dt;
      for (const t0 of this.flashPattern) {
        const t = this.flashT - t0;
        if (t >= 0 && t < 0.12) this.flash = Math.max(this.flash, 1 - t / 0.12);
      }
      if (this.flashT > 0.6) this.flashT = -1;
    }
    if (this.thunderAt > 0 && this.time >= this.thunderAt) {
      this.thunderAt = -1;
      bus.emit('sfx', { name: this.thunderClose ? 'thunderClose' : 'thunder', volume: 1 });
      bus.emit('vibrate', { ms: this.thunderClose ? [60, 40, 120] : 40 });
    }
    this.moon.intensity = 0.14 + this.flash * 3.2;
    this.moon.color.setHex(this.flash > 0 ? 0xc9d6ff : 0x8fa6d6);
    this.uniforms.uFlash.value = this.flash;
  }
}
