import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GraphicsSettings } from '../core/settings';
import { shadowMapSize } from '../core/settings';
import { HorrorFxShader } from './postfx';

/**
 * Owns the WebGL renderer, the scene graph root, the main camera and the post-processing chain.
 * Handles resize, device pixel ratio, render scale and the FPS limiter.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly fx: ShaderPass;
  private readonly renderPass: RenderPass;
  readonly fog: THREE.FogExp2;
  envMap: THREE.Texture | null = null;
  private graphics: GraphicsSettings;
  private lastFrame = 0;
  /** Overlay scene drawn after post (inspected item). */
  overlay: { scene: THREE.Scene; camera: THREE.Camera } | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    graphics: GraphicsSettings,
  ) {
    this.graphics = graphics;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = graphics.shadowQuality > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x020304, 1);
    this.renderer.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 160);
    this.scene.add(this.camera);
    this.fog = new THREE.FogExp2(0x07090c, 0.055);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0x020304);

    const samples = graphics.effectsQuality >= 2 ? 4 : 0;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(new OutputPass());
    this.fx = new ShaderPass(HorrorFxShader);
    this.composer.addPass(this.fx);

    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Dim, neutral environment for specular reflections (wet floors, glass, metal). */
  buildEnvironment(): THREE.Texture {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.06).texture;
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    pmrem.dispose();
    this.envMap = env;
    return env;
  }

  applyGraphics(g: GraphicsSettings): void {
    const shadowChanged = g.shadowQuality > 0 !== this.graphics.shadowQuality > 0;
    this.graphics = g;
    this.renderer.shadowMap.enabled = g.shadowQuality > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    if (shadowChanged) {
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
      });
    }
    this.resize();
  }

  get shadowSize(): number {
    return shadowMapSize(this.graphics.shadowQuality);
  }

  resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.graphics.renderScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.uniforms.uResolution!.value.set(w * dpr, h * dpr);
  }

  /** Returns true if a frame should be rendered now (FPS limiter). */
  shouldRender(now: number): boolean {
    const limit = this.graphics.fpsLimit;
    if (!limit) {
      this.lastFrame = now;
      return true;
    }
    const interval = 1000 / limit;
    if (now - this.lastFrame >= interval - 1.5) {
      this.lastFrame = now - ((now - this.lastFrame) % interval);
      return true;
    }
    return false;
  }

  render(): void {
    this.renderer.info.reset();
    this.composer.render();
    if (this.overlay) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.overlay.scene, this.overlay.camera);
      this.renderer.autoClear = true;
    }
  }
}
