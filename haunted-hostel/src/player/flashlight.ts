import * as THREE from 'three';
import { bus } from '../core/events';

/**
 * Hand-held torch: a shadow-casting spot light with a lens "cookie" (hot centre, rings, dirt),
 * lagging slightly behind the view for weight, a faint visible beam cone and lit dust motes.
 * Battery drains while on; it flickers when low and dies at zero.
 */
export class Flashlight {
  readonly light: THREE.SpotLight;
  private readonly pivot = new THREE.Object3D();
  private readonly beam: THREE.Mesh;
  private readonly dust: THREE.Points;
  private readonly dustUniforms = { uTime: { value: 0 }, uOn: { value: 1 } };
  on = true;
  battery = 1;
  /** Seconds of light per full battery. */
  readonly capacity = 420;
  private flickerT = 0;
  private level = 1;
  private readonly lagQ = new THREE.Quaternion();
  private warned = false;
  /** External multiplier (scares can make the torch die briefly). */
  override = 1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    shadowSize: number,
    effects: number,
  ) {
    this.light = new THREE.SpotLight(0xfff0d8, 26, 26, 0.52, 0.55, 1.6);
    this.light.castShadow = shadowSize > 0;
    if (shadowSize > 0) {
      this.light.shadow.mapSize.set(shadowSize, shadowSize);
      this.light.shadow.bias = -0.0004;
      this.light.shadow.normalBias = 0.02;
      this.light.shadow.camera.near = 0.15;
      this.light.shadow.camera.far = 26;
      this.light.map = makeCookie();
    }
    this.pivot.add(this.light);
    this.light.position.set(0.18, -0.16, 0.05);
    this.pivot.add(this.light.target);
    this.light.target.position.set(0.05, -0.12, -4);
    scene.add(this.pivot);

    // Visible beam: a soft additive cone (effects ≥ medium).
    const len = 7;
    const cone = new THREE.ConeGeometry(Math.tan(0.42) * len, len, 24, 1, true);
    cone.translate(0, -len / 2, 0);
    cone.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(
      cone,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uOn: this.dustUniforms.uOn },
        vertexShader: /* glsl */ `
          varying float vZ; varying vec3 vN; varying vec3 vV;
          void main() {
            vZ = position.z / 7.0;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uOn; varying float vZ; varying vec3 vN; varying vec3 vV;
          void main() {
            float edge = pow(abs(dot(vN, vV)), 2.0);
            float a = edge * (1.0 - vZ) * smoothstep(0.0, 0.15, vZ) * 0.035 * uOn;
            gl_FragColor = vec4(1.0, 0.94, 0.82, a);
          }`,
      }),
    );
    this.beam.position.copy(this.light.position);
    this.beam.lookAt(this.light.target.position);
    this.beam.visible = effects >= 2;
    this.beam.frustumCulled = false;
    this.pivot.add(this.beam);

    // Dust motes that only show inside the beam.
    const n = effects >= 2 ? 500 : effects >= 1 ? 220 : 0;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 3;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3;
      pos[i * 3 + 2] = -Math.random() * 6 - 0.3;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      dg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.dustUniforms,
        vertexShader: /* glsl */ `
          uniform float uTime; varying float vA;
          void main() {
            vec3 p = position;
            p.x += sin(uTime * 0.3 + position.z * 3.0) * 0.15;
            p.y += mod(position.y + uTime * 0.03 + 1.5, 3.0) - 1.5 - position.y + sin(uTime * 0.2 + position.x) * 0.1;
            vec2 d = p.xy / max(0.1, -p.z);
            float inBeam = smoothstep(0.5, 0.25, length(d - vec2(0.03, -0.02)));
            vA = inBeam * smoothstep(6.5, 1.0, -p.z);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = 2.2 * (2.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uOn; varying float vA;
          void main() {
            float r = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(1.0, 0.95, 0.85, smoothstep(0.5, 0.0, r) * vA * 0.5 * uOn);
          }`,
      }),
    );
    this.dust.frustumCulled = false;
    camera.add(this.dust);
  }

  toggle(): void {
    if (this.battery <= 0) {
      bus.emit('toast', { text: 'hud.flashlightDead' });
      bus.emit('sfx', { name: 'switchClick', volume: 0.4 });
      return;
    }
    this.on = !this.on;
    bus.emit('sfx', { name: 'switchClick', volume: 0.5 });
  }

  addBattery(amount = 0.6): void {
    this.battery = Math.min(1, this.battery + amount);
    this.warned = false;
  }

  /** True while the light is actually emitting (used by the AI for detection). */
  get emitting(): boolean {
    return this.level > 0.2;
  }

  update(dt: number, time: number, autoReload: () => boolean): void {
    // Lag the beam slightly behind the camera for a hand-held feel.
    this.camera.getWorldQuaternion(this.lagQ);
    this.pivot.quaternion.slerp(this.lagQ, Math.min(1, dt * 14));
    this.camera.getWorldPosition(this.pivot.position);
    if (this.on) {
      this.battery = Math.max(0, this.battery - dt / this.capacity);
      if (this.battery < 0.15 && !this.warned) {
        this.warned = true;
        bus.emit('toast', { text: 'hud.lowBattery' });
      }
      if (this.battery <= 0) {
        if (autoReload()) this.addBattery();
        else {
          this.on = false;
          bus.emit('toast', { text: 'hud.flashlightDead' });
        }
      }
    }
    let target = this.on ? 1 : 0;
    if (this.on && this.battery < 0.15) {
      // Weak battery: dimmer, with stutters.
      this.flickerT -= dt;
      if (this.flickerT <= 0) this.flickerT = Math.random() * (this.battery * 20 + 0.5);
      target *= 0.45 + this.battery * 3;
      if (this.flickerT < 0.12) target *= Math.random() * 0.4;
    }
    target *= this.override;
    this.level += (target - this.level) * Math.min(1, dt * 30);
    const wobble = 1 + Math.sin(time * 3.1) * 0.015;
    this.light.intensity = 26 * this.level * wobble;
    this.light.visible = this.level > 0.01;
    this.dustUniforms.uOn.value = this.level;
    this.dustUniforms.uTime.value = time;
  }

  dispose(): void {
    this.scene.remove(this.pivot);
    this.camera.remove(this.dust);
  }
}

/** Torch lens pattern: bright hotspot, a darker ring, a soft outer halo and smudges. */
function makeCookie(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(250,250,250,0.95)');
  gr.addColorStop(0.3, 'rgba(170,170,170,0.75)');
  gr.addColorStop(0.36, 'rgba(210,210,210,0.8)');
  gr.addColorStop(0.62, 'rgba(110,110,110,0.45)');
  gr.addColorStop(0.9, 'rgba(40,40,40,0.15)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.beginPath();
    g.arc(60 + Math.random() * 136, 60 + Math.random() * 136, 4 + Math.random() * 18, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
