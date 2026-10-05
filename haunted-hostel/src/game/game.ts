import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Engine } from '../render/engine';
import { MaterialLibrary } from '../render/textures/materials';
import { Weather } from '../render/weather';
import { loadSettings, saveSettings, lightPoolSize, textureSize, isTouchDevice, type Settings } from '../core/settings';
import { setLanguage, t } from '../core/i18n';
import { bus } from '../core/events';
import { buildWorld, type World } from '../world/world';
import { LightingSystem } from '../systems/lighting';
import { power } from '../systems/power';
import { AudioSystem } from '../audio/audioSystem';
import { Input } from '../player/input';
import { PlayerController } from '../player/controller';
import { Flashlight } from '../player/flashlight';
import { InteractionSystem } from '../player/interaction';
import { HidingSystem } from '../player/hiding';
import { GhostBody } from '../enemy/ghost';
import { GhostAI } from '../enemy/ghostAI';
import { ApparitionSystem } from '../enemy/apparitions';
import { buildNavGraph } from '../enemy/nav';
import { CctvSystem, CCTV_LAYER } from '../systems/cctv';
import { PhoneSystem } from '../systems/phone';
import { RandomEvents } from '../systems/randomEvents';
import { saves } from '../systems/save';
import { state, type SaveData } from '../systems/gameState';
import { Story } from '../story/story';
import { Hud } from '../ui/hud';
import { MobileControls } from '../ui/mobileControls';
import { LoadingScreen, endingScreen, fader, howToPlay, mainMenu, pauseMenu, rotateHint, settingsScreen, tapToStart } from '../ui/menus';
import { documentScreen, inventoryScreen } from '../ui/panels';
import { setClickSound, uiRoot } from '../ui/dom';
import { setUnboundHandler } from '../world/actions';
import { ROOMS, roomBounds, XMAX, OUTER } from '../world/layout';
import { SPAWN } from '../world/exterior';
import { EVIDENCE_IDS } from '../data/items';

export const MIRROR_LAYER = 3;
export const PHONE_LAYER = 4;

export type Mode = 'loading' | 'menu' | 'play' | 'paused' | 'overlay' | 'cctv' | 'phone' | 'caught' | 'ending';

/**
 * Owns every system and runs the frame loop. Modes gate which systems update: menus keep the
 * world alive in the background (title screen), overlays freeze the player but not the
 * atmosphere, and the CCTV/phone camera modes swap the render camera.
 */
export class Game {
  settings: Settings = loadSettings();
  readonly engine: Engine;
  readonly audio = new AudioSystem();
  mats!: MaterialLibrary;
  world!: World;
  lighting!: LightingSystem;
  weather!: Weather;
  readonly input: Input;
  player!: PlayerController;
  flashlight!: Flashlight;
  interaction!: InteractionSystem;
  hiding!: HidingSystem;
  ghost!: GhostBody;
  ai!: GhostAI;
  apparitions!: ApparitionSystem;
  cctvPhantom!: GhostBody;
  mirrorPhantom!: GhostBody;
  phonePhantom!: GhostBody;
  cctv!: CctvSystem;
  readonly phone = new PhoneSystem();
  events!: RandomEvents;
  story!: Story;
  hud!: Hud;
  mobile!: MobileControls;
  mirror: Reflector | null = null;
  mode: Mode = 'loading';
  private overlayClose: (() => void) | null = null;
  private menuClose: (() => void) | null = null;
  time = 0;
  fear = 0;
  private heartT = 0;
  private fps = { frames: 0, t: 0, show: location.search.includes('fps') };
  private readonly touch: boolean;
  private fade = fader();
  private menuShadowT = 6;
  private caughtT = 0;
  damage = 0;
  /** Extra fear pulse from scares (decays). */
  scarePulse = 0;
  phoneCamera = false;
  readonly debug = location.search.includes('debug');
  /** Automation: fixed 50 ms steps per animation frame with rendering disabled (0 = off). */
  simOnly = 0;

  constructor() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.engine = new Engine(canvas, this.settings.graphics);
    this.input = new Input(canvas);
    this.touch = isTouchDevice() || location.search.includes('touch');
    setLanguage(this.settings.language);
  }

  // -------------------------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------------------------
  async boot(): Promise<void> {
    const loading = new LoadingScreen();
    const g = this.settings.graphics;
    loading.progress(0.02, 'load.loading');
    await document.fonts?.ready?.catch(() => {});
    await Promise.all(
      ['600 20px "Cormorant Garamond"', '400 20px "Special Elite"', '500 20px Caveat', '600 20px Inter'].map((f) =>
        document.fonts?.load(f).catch(() => {}),
      ),
    );
    this.mats = new MaterialLibrary(this.engine.renderer.capabilities.getMaxAnisotropy() >= 8 && g.textureQuality >= 2 ? 8 : 4);
    this.mats.envMap = this.engine.buildEnvironment();
    await this.mats.generate(textureSize(g.textureQuality), (f) => loading.progress(0.05 + f * 0.45, 'load.textures'));
    this.mats.buildBasics();
    this.world = await buildWorld(this.engine.scene, this.mats, g.textureQuality, (f) => loading.progress(0.5 + f * 0.2, 'load.world'));
    loading.progress(0.7, 'load.audio');
    this.audio.col = this.world.ctx.col;
    this.audio.hrtf = g.effectsQuality >= 1;
    await this.audio.init((f) => loading.progress(0.7 + f * 0.15, 'load.audio'));
    this.audio.bindEvents();
    setClickSound(() => this.audio.play('uiClick', { volume: 0.6 }));
    this.setupSystems();
    loading.progress(0.88, 'load.shaders');
    // Compile every shader up front so the first minute of play doesn't hitch.
    try {
      await this.engine.renderer.compileAsync(this.engine.scene, this.engine.camera);
    } catch {
      /* compileAsync unsupported — shaders compile lazily */
    }
    loading.progress(1, 'load.shaders');
    await new Promise((r) => setTimeout(r, 300));
    loading.close();
    this.applySettings();
    this.startLoop();
    if (this.touch && window.innerHeight > window.innerWidth) rotateHint();
    (window as unknown as { __hh: Game }).__hh = this;
    (window as unknown as { __ready: boolean }).__ready = true;
    if (!location.search.includes('autostart')) await tapToStart();
    await this.audio.init();
    this.showMenu();
  }

  private setupSystems(): void {
    const ctx = this.world.ctx;
    const scene = this.engine.scene;
    const g = this.settings.graphics;
    this.lighting = new LightingSystem(scene, ctx.fixtures, lightPoolSize(g.effectsQuality));
    this.weather = new Weather(scene, this.world.shelters, [2500, 4500, 7000, 10000][g.effectsQuality]!, this.engine.shadowSize);
    this.player = new PlayerController(this.engine.camera, ctx.col, this.input);
    this.flashlight = new Flashlight(scene, this.engine.camera, this.engine.shadowSize, g.effectsQuality);
    this.interaction = new InteractionSystem(ctx);
    this.hiding = new HidingSystem(this.player);
    this.ghost = new GhostBody(scene, this.mats);
    const nav = buildNavGraph();
    this.ai = new GhostAI(this.ghost, nav, ctx.col, {
      onCaught: () => this.caught(),
      onChaseStart: () => {
        bus.emit('musicState', { state: 'CHASE' });
        this.story?.onChase(true);
      },
      onChaseEnd: () => {
        bus.emit('musicState', { state: 'TENSION' });
        this.story?.onChase(false);
      },
      doors: this.world.doors,
      safeRooms: new Set(['room214', 'security']),
    });
    const appBody = new GhostBody(scene, this.mats);
    this.apparitions = new ApparitionSystem(appBody, ctx.col);
    this.cctvPhantom = new GhostBody(scene, this.mats, CCTV_LAYER);
    this.cctvPhantom.rig.uniforms.uGlow.value = 6;
    this.mirrorPhantom = new GhostBody(scene, this.mats, MIRROR_LAYER);
    this.phonePhantom = new GhostBody(scene, this.mats, PHONE_LAYER);
    this.cctv = new CctvSystem(ctx, this.cctvPhantom);
    this.buildMirror();
    this.hud = new Hud(this.touch);
    this.mobile = new MobileControls(this.input, this.settings.controls, (l) => {
      this.settings.controls = l;
      saveSettings(this.settings);
    });
    this.events = new RandomEvents(this);
    this.story = new Story(this);
    this.buildCullList();
    setUnboundHandler((_id, d) => {
      if (d.inspect) this.hud.toast(d.inspect, 6);
      else this.hud.toast('inspect.generic');
    });

    bus.on('toast', (e) => this.hud.toast(e.text, e.duration));
    bus.on('subtitle', (e) => this.hud.subtitle(e.text, e.duration, e.speaker));
    bus.on('itemAdded', (e) => {
      this.hud.pickup(e.id);
      this.audio.play('pickup');
      if (EVIDENCE_IDS.includes(e.id)) state.evidence.add(e.id);
    });
    bus.on('vibrate', (e) => {
      if (this.settings.vibration && navigator.vibrate) navigator.vibrate(e.ms);
    });
    bus.on('scare', (e) => this.onScare(e.kind));
    this.phone.hooks = {
      toggleTorch: () => this.flashlight.toggle(),
      torchOn: () => this.flashlight.on,
      notes: () => this.story.notes(),
      onClose: () => {
        if (this.mode === 'phone') this.resumePlay();
      },
      onCamera: (on) => {
        this.phoneCamera = on;
        if (on) this.engine.camera.layers.enable(PHONE_LAYER);
        else this.engine.camera.layers.disable(PHONE_LAYER);
      },
      onCapture: () => this.story.onPhoto(),
      onEmergency: () => this.story.emergencyCall(),
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.mode === 'play') this.pause();
        this.audio.suspend();
      } else this.audio.resume();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.mode === 'play' && !this.touch && !this.debug) this.pause();
    });
  }

  private cullList: { o: THREE.Object3D; c: THREE.Vector3; r: number; indoor: boolean }[] = [];
  private cullT = 0;

  /**
   * Cheap interior culling: furniture, doors, fixtures and decals inside the building are hidden
   * when they are far away or on another storey (walls and slabs hide them anyway). Static
   * architecture is handled by batching + frustum culling.
   */
  private buildCullList(): void {
    const box = new THREE.Box3();
    for (const o of this.engine.scene.children) {
      if (!o.userData.dynamic || o.userData.noCull || (o as THREE.Light).isLight || o.name === 'ghost' || o.name === 'liftCar') continue;
      if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).frustumCulled) continue;
      box.setFromObject(o, false);
      if (box.isEmpty()) continue;
      const c = box.getCenter(new THREE.Vector3());
      const r = box.getSize(new THREE.Vector3()).length() / 2;
      const indoor = c.x > -0.3 && c.x < XMAX + 0.3 && Math.abs(c.z) < OUTER + 0.3 && c.y < 10.1;
      this.cullList.push({ o, c, r, indoor });
    }
    // Shadow casters for the flashlight: only those near the camera are drawn into its shadow map.
    const sphere = new THREE.Sphere();
    this.engine.scene.updateMatrixWorld(true);
    this.engine.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.castShadow || m.userData.archCaster) return;
      let p: THREE.Object3D | null = m;
      while (p) {
        if (p.name === 'ghost' || p.name === 'liftCar') return;
        p = p.parent;
      }
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      sphere.copy(m.geometry.boundingSphere!).applyMatrix4(m.matrixWorld);
      this.casters.push({ m, c: sphere.center.clone(), r: sphere.radius });
    });
  }

  private readonly casters: { m: THREE.Mesh; c: THREE.Vector3; r: number }[] = [];

  private updateCulling(dt: number): void {
    this.cullT -= dt;
    if (this.cullT > 0) return;
    this.cullT = 0.2;
    const cam = this.engine.camera.position;
    const outside = this.player.outdoors || this.mode === 'cctv';
    const camFloor = Math.round((cam.y - 1.4) / 3.4);
    const ref = this.mode === 'cctv' ? this.cctv.camera.position : cam;
    for (const s of this.casters) s.m.castShadow = s.c.distanceTo(cam) - s.r < 9;
    for (const e of this.cullList) {
      const d = e.c.distanceTo(ref) - e.r;
      let vis: boolean;
      if (!e.indoor) vis = d < 60;
      else if (outside) vis = d < 34;
      else vis = d < 26 && Math.abs(Math.round((e.c.y - 1.4) / 3.4) - camFloor) <= (d < 6 ? 1 : 0);
      void 0;
      if (e.o.userData.cullHidden !== !vis) {
        e.o.userData.cullHidden = !vis;
        if (!e.o.userData.storyHidden) e.o.visible = vis;
      }
    }
  }

  /** Bathroom mirror: a real planar reflection that also sees the mirror-only phantom. */
  private buildMirror(): void {
    const p = this.world.ctx.points.get('mirrorBath');
    const yaw = this.world.ctx.points.get('mirrorBathYaw');
    if (!p || !yaw) return;
    const q = this.settings.graphics.effectsQuality;
    const res = q >= 2 ? 512 : 256;
    const m = new Reflector(new THREE.PlaneGeometry(2.1, 0.95), {
      textureWidth: res,
      textureHeight: Math.round(res * 0.45),
      color: 0x9aa3a6,
      clipBias: 0.003,
      multisample: 0,
    });
    m.position.set(p.x, p.y, p.z);
    m.rotation.y = yaw.x;
    m.getReflectionCamera(this.engine.camera).layers.enable(MIRROR_LAYER);
    this.engine.scene.add(m);
    // Dirty frame around the glass.
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.05, 0.02), this.mats.getBasic('mirror_back'));
    frame.position.copy(m.position).add(new THREE.Vector3(0, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.x));
    frame.rotation.y = yaw.x;
    frame.translateZ(-0.012);
    this.engine.scene.add(frame);
    this.mirror = m;
  }

  // -------------------------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------------------------
  applySettings(): void {
    const s = this.settings;
    const g = s.graphics;
    this.engine.applyGraphics(g);
    this.engine.camera.fov = s.fov;
    this.engine.camera.updateProjectionMatrix();
    this.engine.fx.uniforms.uBrightness!.value = s.brightness;
    this.engine.fx.uniforms.uQuality!.value = g.effectsQuality;
    this.engine.fx.uniforms.uGrain!.value = g.effectsQuality === 0 ? 0.02 : 0.045;
    this.engine.fx.uniforms.uChroma!.value = g.effectsQuality >= 2 ? 0.0012 : 0;
    this.lighting?.setPoolSize(lightPoolSize(g.effectsQuality));
    this.weather?.setQuality([2500, 4500, 7000, 10000][g.effectsQuality]!);
    if (this.player) {
      this.player.sensitivity = s.sensitivity;
      this.player.invertY = s.invertY;
      this.player.headBob = s.headBob;
    }
    this.audio.volumes = { ...s.volumes };
    this.audio.applyVolumes();
    if (this.hud) this.hud.subtitlesOn = s.subtitles;
    this.mobile?.applyLayout(s.controls);
    this.hud?.setFps(this.fps.show ? '' : null);
  }

  // -------------------------------------------------------------------------------------------
  // Modes
  // -------------------------------------------------------------------------------------------
  showMenu(): void {
    this.mode = 'menu';
    this.hud.show(false);
    this.mobile.show(false);
    this.input.enabled = false;
    this.input.unlock();
    this.ai.deactivate();
    this.apparitions.end(true);
    this.ghost.hide();
    // Title scene: the second floor corridor at night, the balcony door open to the rain.
    power.restore({ GF: false, FF: false, SF: true, EXT: true, EMERGENCY: false, BATTERY: true, STREET: true });
    this.player.place(new THREE.Vector3(XMAX - 9.5, 6.8, -0.35), -Math.PI / 2 - 0.12, 0.04);
    this.flashlight.on = false;
    this.weather.lightningEnabled = true;
    this.audio.setMusic('NORMAL');
    const save = saves.latest();
    this.menuClose = mainMenu({
      play: () => this.newGame(),
      cont: save ? () => this.continueGame(save) : null,
      saveInfo: save ? saves.describe(save) : null,
      settings: () => {
        this.menuClose?.();
        settingsScreen(this.settings, {
          apply: () => this.applySettings(),
          customizeControls: () => this.customizeControls(() => this.showMenu()),
          close: () => this.showMenu(),
          touch: this.touch,
        });
      },
      howto: () => {
        this.menuClose?.();
        howToPlay(() => this.showMenu());
      },
      exit: () => this.exit(),
    });
  }

  private customizeControls(after: () => void): void {
    this.mobile.edit(() => {
      this.mobile.show(false);
      after();
    });
  }

  private exit(): void {
    const cap = (window as unknown as { Capacitor?: { Plugins?: { App?: { exitApp?: () => void } } } }).Capacitor;
    if (cap?.Plugins?.App?.exitApp) cap.Plugins.App.exitApp();
    else {
      this.menuClose?.();
      uiRoot().append(
        Object.assign(document.createElement('div'), {
          className: 'hh-screen show ending',
          innerHTML: `<h1>HAUNTED HOSTEL</h1><p class="stats">${t('menu.thanks')}</p>`,
        }),
      );
      window.close();
    }
  }

  async newGame(): Promise<void> {
    this.menuClose?.();
    await this.fade.to(true);
    state.reset();
    this.resetWorld();
    this.story.begin();
    this.enterPlay();
    await this.fade.to(false);
  }

  async continueGame(save: SaveData): Promise<void> {
    this.menuClose?.();
    await this.fade.to(true);
    this.resetWorld();
    this.load(save);
    this.enterPlay();
    await this.fade.to(false);
  }

  private enterPlay(): void {
    this.mode = 'play';
    this.hud.show(true);
    this.mobile.show(this.touch);
    this.input.enabled = true;
    this.input.lock();
    this.flashlight.on = true;
    this.hud.setObjective(this.story.objectiveText());
  }

  resumePlay(): void {
    this.overlayClose = null;
    this.mode = 'play';
    this.engine.fx.uniforms.uDim!.value = 0;
    this.input.enabled = true;
    this.mobile.show(this.touch);
    this.hud.show(true);
    this.input.lock();
    this.audio.resume();
  }

  pause(): void {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.input.enabled = false;
    this.input.unlock();
    this.mobile.show(false);
    const inDanger = this.ai.hunting;
    this.overlayClose = pauseMenu({
      resume: () => {
        this.overlayClose?.();
        this.resumePlay();
      },
      save: inDanger ? null : () => this.manualSave(),
      loadCheckpoint: () => {
        this.overlayClose?.();
        this.loadCheckpoint();
      },
      settings: () => {
        this.overlayClose?.();
        settingsScreen(this.settings, {
          apply: () => this.applySettings(),
          customizeControls: () => this.customizeControls(() => ((this.mode = 'play'), this.pause())),
          close: () => ((this.mode = 'play'), this.pause()),
          touch: this.touch,
        });
      },
      howto: () => {
        this.overlayClose?.();
        howToPlay(() => ((this.mode = 'play'), this.pause()));
      },
      mainMenu: () => {
        this.overlayClose?.();
        this.audio.stopAll();
        this.showMenu();
      },
      objective: this.story.objectiveText(),
    });
  }

  /** Opens a modal UI over the game (documents, puzzles, inventory). */
  openOverlay(open: (done: () => void) => () => void): void {
    if (this.mode !== 'play') return;
    this.mode = 'overlay';
    this.input.enabled = false;
    this.input.unlock();
    this.mobile.show(false);
    this.engine.fx.uniforms.uDim!.value = 0.35;
    this.overlayClose = open(() => this.resumePlay());
  }

  readDocument(id: string): void {
    state.addDocument(id);
    this.audio.play('pageTurn');
    if (this.mode === 'overlay') {
      // From the inventory: stack the reader on top.
      documentScreen(
        id,
        () => {},
        () => this.audio.play('pageTurn'),
      );
      return;
    }
    this.openOverlay((done) =>
      documentScreen(
        id,
        () => {
          done();
          this.story.onDocumentClosed(id);
        },
        () => this.audio.play('pageTurn'),
      ),
    );
  }

  openInventory(): void {
    this.openOverlay((done) => inventoryScreen(state.inventory, state.batteries, state.documents, (doc) => this.readDocument(doc), done));
  }

  openCctv(): void {
    if (this.mode !== 'play') return;
    this.mode = 'cctv';
    this.input.enabled = false;
    this.input.unlock();
    this.mobile.show(false);
    this.hud.show(false);
    this.cctv.onClose = () => {
      this.engine.fx.uniforms.uCctv!.value = 0;
      this.engine.fx.uniforms.uGlitch!.value = 0;
      this.resumePlay();
      this.story.onCctvClosed();
    };
    this.cctv.show();
  }

  openPhone(): void {
    if (this.mode !== 'play') return;
    this.mode = 'phone';
    this.input.enabled = false;
    this.input.unlock();
    this.mobile.show(false);
    this.phone.open();
  }

  // -------------------------------------------------------------------------------------------
  // Saving
  // -------------------------------------------------------------------------------------------
  snapshot(): SaveData {
    const doors: SaveData['doors'] = {};
    for (const [id, d] of this.world.doors) doors[id] = { open: d.isOpen, locked: d.locked };
    const p = this.player;
    return {
      version: 1,
      savedAt: Date.now(),
      chapter: state.chapter,
      objective: state.objective,
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch },
      inventory: [...state.inventory],
      usedItems: [...state.usedItems],
      flags: [...state.flags],
      doors,
      puzzles: { ...state.puzzles },
      evidence: [...state.evidence],
      documents: [...state.documents],
      phone: { messages: [...this.phone.messages], battery: this.phone.battery },
      flashlightBattery: this.flashlight.battery,
      batteries: state.batteries,
      lift: this.world.lift.current,
      power: power.snapshot(),
      ending: state.ending,
      playTime: state.playTime,
      scaresUsed: [...state.scaresUsed],
    };
  }

  checkpoint(): void {
    if (this.mode === 'menu') return;
    saves.write(this.snapshot(), false);
    this.hud.saved(t('hud.autosaved'));
  }

  manualSave(): void {
    saves.write(this.snapshot(), true);
    this.hud.saved(t('hud.saved'));
    this.hud.toast('hud.saved');
  }

  private load(s: SaveData): void {
    state.reset();
    state.chapter = s.chapter;
    state.objective = s.objective;
    state.inventory = [...s.inventory];
    s.usedItems.forEach((i) => state.usedItems.add(i));
    s.flags.forEach((f) => state.flags.add(f));
    s.evidence.forEach((e) => state.evidence.add(e));
    state.documents = [...s.documents];
    state.puzzles = { ...s.puzzles };
    state.playTime = s.playTime;
    state.batteries = s.batteries ?? 0;
    s.scaresUsed.forEach((x) => state.scaresUsed.add(x));
    this.phone.messages = [...s.phone.messages];
    this.phone.battery = s.phone.battery;
    this.phone.unread = 0;
    this.flashlight.battery = s.flashlightBattery;
    power.restore(s.power as Record<string, boolean>);
    for (const [id, d] of Object.entries(s.doors)) {
      const door = this.world.doors.get(id);
      if (!door) continue;
      if (!d.locked && door.locked) door.unlock();
      else if (d.locked && !door.locked) door.setLocked('story');
      door.snap(d.open);
    }
    if (s.lift) this.world.lift.snap(s.lift as 'G' | '1' | '2' | '3');
    this.story.restore();
    this.player.place(new THREE.Vector3(s.player.x, s.player.y, s.player.z), s.player.yaw, s.player.pitch);
  }

  async loadCheckpoint(): Promise<void> {
    const s = saves.latest();
    if (!s) {
      this.showMenu();
      return;
    }
    await this.fade.to(true);
    this.resetWorld();
    this.load(s);
    this.enterPlay();
    await this.fade.to(false);
  }

  /** Puts every dynamic piece of the world back to its initial state. */
  private resetWorld(): void {
    this.ai.deactivate();
    this.ghost.hide();
    this.apparitions.end(true);
    this.hiding.eject();
    this.cctv.reset();
    this.damage = 0;
    this.fear = 0;
    this.caughtT = 0;
    this.engine.fx.uniforms.uFade!.value = 0;
    this.engine.fx.uniforms.uDamage!.value = 0;
    this.phone.messages = [];
    this.phone.unread = 0;
    this.phone.battery = 0.64;
    this.flashlight.battery = 1;
    this.flashlight.override = 1;
    this.world.lift.snap('G');
    this.world.lift.hiddenThird = true;
    this.story.resetWorld();
  }

  // -------------------------------------------------------------------------------------------
  // Danger
  // -------------------------------------------------------------------------------------------
  private caught(): void {
    if (this.mode !== 'play' && this.mode !== 'overlay') return;
    this.mode = 'caught';
    this.caughtT = 0;
    this.input.enabled = false;
    this.hiding.eject();
    this.player.frozen = true;
    this.player.lookAt(this.ghost.pos.clone().setY(this.ghost.pos.y + 1.6), 0.15);
    this.player.trauma = 1;
    bus.emit('vibrate', { ms: [200, 60, 400] });
  }

  ending(kind: 'good' | 'bad' | 'secret'): void {
    state.ending = kind;
    this.mode = 'ending';
    this.input.enabled = false;
    this.input.unlock();
    this.hud.show(false);
    this.mobile.show(false);
    this.ai.deactivate();
    this.audio.setMusic(kind === 'bad' ? 'TENSION' : 'ENDING');
    const mins = Math.floor(state.playTime / 60);
    const secs = Math.floor(state.playTime % 60);
    const stats = t('end.stats', { time: `${mins}:${String(secs).padStart(2, '0')}`, ev: state.evidence.size });
    if (kind !== 'bad') saves.clear();
    endingScreen(kind, stats, { retry: kind === 'bad' ? () => this.loadCheckpoint() : null, menu: () => this.showMenu() });
  }

  private onScare(kind: string): void {
    this.scarePulse = 1;
    this.player.trauma = Math.min(1, this.player.trauma + (kind === 'attack' ? 1 : 0.55));
    if (kind !== 'attack') this.audio.play('stinger', { volume: kind === 'cctvBehind' ? 0.7 : 0.9 });
    this.engine.fx.uniforms.uGlitch!.value = 0.6;
    bus.emit('vibrate', { ms: [80, 40, 160] });
  }

  /** Which room (if any) is the player standing in. */
  playerRoom(): string | null {
    const p = this.player.pos;
    const f = Math.round(p.y / 3.4);
    for (const r of ROOMS) {
      if (r.floor !== f) continue;
      const b = roomBounds(r);
      if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1) return r.id;
    }
    return null;
  }

  private surface(): 'tile' | 'concrete' | 'wet' | 'metal' | 'mud' {
    const p = this.player.pos;
    if (this.world.lift.contains(p)) return 'metal';
    if (this.player.outdoors) {
      if (p.y > 9) return 'wet';
      if (Math.abs(p.x - 18) < 2.6 || p.z < OUTER + 3.4 || p.z > 32) return 'wet';
      return 'mud';
    }
    if (p.x < 3.6 && p.z < -1.3) return 'concrete';
    const r = this.playerRoom();
    if (r === 'bathroom2') return 'wet';
    return 'tile';
  }

  // -------------------------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------------------------
  private startLoop(): void {
    let last = performance.now();
    const frame = (now: number) => {
      requestAnimationFrame(frame);
      if (!this.engine.shouldRender(now)) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try {
        if (this.simOnly > 0) {
          // Test mode: advance the simulation in fixed steps without drawing.
          for (let i = 0; i < this.simOnly; i++) this.update(0.05);
          return;
        }
        this.update(dt);
        this.render();
      } catch (err) {
        console.error(err);
      }
      this.fps.frames++;
      this.fps.t += dt;
      if (this.fps.t >= 0.5) {
        if (this.fps.show) {
          const info = this.engine.renderer.info;
          this.hud.setFps(
            `${Math.round(this.fps.frames / this.fps.t)} fps · ${info.render.calls} calls · ${Math.round(info.render.triangles / 1000)}k tris`,
          );
        }
        this.fps.frames = 0;
        this.fps.t = 0;
      }
    };
    requestAnimationFrame(frame);
  }

  private cctvGlitch = 0;

  private update(dt: number): void {
    this.time += dt;
    const input = this.input;
    input.poll();
    const playing = this.mode === 'play';
    if (playing) state.playTime += dt;

    if (playing) this.handleActions();
    else if (this.mode === 'overlay' || this.mode === 'paused') {
      if (input.consume('back') || input.consume('pause') || input.consume('inventory')) {
        if (this.mode === 'overlay' && this.overlayClose) this.overlayClose();
        else if (this.mode === 'paused' && this.overlayClose) {
          this.overlayClose();
          this.resumePlay();
        }
      }
    } else if (this.mode === 'phone' && (input.consume('back') || input.consume('phone'))) this.phone.close();
    else if (this.mode === 'cctv' && input.consume('back')) this.cctv.hide();

    // Player & camera.
    if (this.mode === 'play' || this.mode === 'overlay' || this.mode === 'phone' || this.mode === 'caught' || this.mode === 'cctv') {
      this.player.surface = this.surface();
      if (!this.hiding.spot) this.player.update(this.mode === 'play' || this.mode === 'caught' ? dt : 0);
      this.hiding.update(dt, playing && input.isHeld('breath'));
      if (this.hiding.spot) this.hiding.applyCamera(this.engine.camera, this.time);
    } else if (this.mode === 'menu') {
      this.menuCamera(dt);
    }
    // World.
    const ctx = this.world.ctx;
    for (const a of ctx.animated) a.update(dt, this.time);
    for (const d of this.world.doors.values()) d.update(dt);
    this.world.lift.update(dt);
    this.flashlight.update(dt, this.time, () => {
      if (state.batteries > 0) {
        state.batteries--;
        this.hud.toast('msg.battery');
        return true;
      }
      return false;
    });
    if (playing || this.mode === 'overlay' || this.mode === 'phone' || this.mode === 'cctv' || this.mode === 'caught') {
      this.story.update(dt);
      const view = {
        pos: this.player.pos,
        eye: this.engine.camera.position,
        floor: this.player.floor,
        hidden: this.hiding.hidden ? this.hiding.spot : null,
        seenHiding: this.hiding.seenEntering,
        holdingBreath: this.hiding.holdingBreath,
        crouching: this.player.crouching,
        flashlightOn: this.flashlight.emitting,
        room: this.playerRoom(),
      };
      if (this.mode !== 'caught') this.ai.update(dt, view);
      else this.ghost.update(dt, this.time, 0, 0);
      if (playing) this.events.update(dt);
    }
    this.apparitions.update(dt, this.engine.camera);
    this.updateCulling(dt);
    if (this.mode === 'cctv') this.cctvGlitch = this.cctv.update(dt).glitch;
    this.mirrorPhantom.update(dt, this.time, 0, 99);
    this.phonePhantom.update(dt, this.time, 0, 99);
    this.phone.update(dt);
    if (this.mirror) {
      const near = this.mirror.position.distanceTo(this.engine.camera.position) < 7;
      this.mirror.visible = near;
    }
    if (this.mode === 'menu') this.menuEvents(dt);
    if (this.mode === 'caught') this.updateCaught(dt);

    // Lighting / weather / audio.
    const camFloor = Math.round((this.engine.camera.position.y - 1.2) / 3.4);
    this.lighting.update(dt, this.engine.camera, camFloor);
    this.weather.update(dt, this.engine.camera);
    const ext = this.world.ext;
    ext.sky.position.copy(this.engine.camera.position);
    ext.skyUniforms.uFlash.value = this.weather.flash;
    ext.skyUniforms.uTime.value = this.time;
    const outdoor = this.player.outdoors && this.mode !== 'menu' ? 1 : 0;
    this.audio.outdoor += (outdoor - this.audio.outdoor) * Math.min(1, dt * 2);
    const fogQ = this.settings.graphics.fogQuality;
    const targetFog = outdoor ? 0.024 : 0.05 + (fogQ === 0 ? -0.01 : 0);
    this.engine.fog.density += (targetFog - this.engine.fog.density) * Math.min(1, dt * 1.5);
    this.updateAmbience(dt);
    this.audio.update(dt, this.engine.camera);
    this.updateFear(dt);

    // HUD.
    if (playing) {
      this.interaction.enabled = !this.hiding.spot;
      this.interaction.update(this.engine.camera);
      this.hud.setPrompt(this.hiding.spot ? null : this.interaction.prompt);
      this.hud.setStamina(this.player.stamina);
      this.hud.setBattery(this.flashlight.battery, this.flashlight.on);
      this.hud.setHiding(this.hiding.hidden, this.hiding.breath);
      this.mobile.context = {
        canInteract: !!this.interaction.current,
        hiding: this.hiding.hidden,
        flashlightOn: this.flashlight.on,
        crouching: this.player.crouching,
        sprinting: this.player.sprinting,
      };
      this.mobile.update();
    }
    this.hud.update(dt);
    input.endFrame();
  }

  private handleActions(): void {
    const input = this.input;
    if (input.consume('pause')) {
      this.pause();
      return;
    }
    if (input.consume('flashlight')) this.flashlight.toggle();
    if (input.consume('inventory')) {
      this.openInventory();
      return;
    }
    if (input.consume('phone')) {
      this.openPhone();
      return;
    }
    if (input.consume('interact')) {
      if (this.hiding.hidden) this.hiding.leave();
      else if (!this.interaction.interact()) this.hud.peekObjective();
    }
  }

  private updateCaught(dt: number): void {
    this.caughtT += dt;
    const fx = this.engine.fx.uniforms;
    fx.uDamage!.value = Math.min(1, this.caughtT * 1.5);
    fx.uGlitch!.value = Math.min(1, this.caughtT);
    if (this.caughtT > 0.25 && this.caughtT < 0.3) {
      // She is right in your face.
      const cam = this.engine.camera;
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      const p = cam.position.clone().addScaledVector(fwd, 0.55);
      p.y = this.player.pos.y + this.player.height - 1.75;
      this.ghost.snapIn(p, Math.atan2(-fwd.x, -fwd.z));
      this.ghost.play('attack');
    }
    fx.uFade!.value = Math.max(0, (this.caughtT - 1.4) / 0.8);
    if (this.caughtT > 2.3 && this.mode === 'caught') {
      fx.uFade!.value = 0;
      fx.uDamage!.value = 0;
      fx.uGlitch!.value = 0;
      this.ghost.hide();
      this.ending('bad');
    }
  }

  private menuCamera(dt: number): void {
    const cam = this.engine.camera;
    const t = this.time;
    cam.position.set(XMAX - 9.5 + Math.sin(t * 0.07) * 0.3, 6.8 + 1.55 + Math.sin(t * 0.5) * 0.01, -0.35);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(0.03 + Math.sin(t * 0.21) * 0.01, -Math.PI / 2 - 0.08 + Math.sin(t * 0.11) * 0.05, 0);
    void dt;
  }

  /** Title screen: a tube light dies and returns, and sometimes a shadow crosses the far end. */
  private menuEvents(dt: number): void {
    this.menuShadowT -= dt;
    if (this.menuShadowT <= 0 && !this.apparitions.busy) {
      this.menuShadowT = 14 + Math.random() * 10;
      const z0 = Math.random() < 0.5 ? -1.5 : 1.5;
      this.apparitions.show(
        {
          pos: new THREE.Vector3(XMAX - 1.6, 6.8, z0),
          yaw: null,
          walkTo: new THREE.Vector3(XMAX - 1.6, 6.8, -z0),
          walkSpeed: 1.3,
          duration: 4,
        },
        this.engine.camera,
      );
    }
  }

  private emitterSlots = new Set<string>();

  private updateAmbience(dt: number): void {
    const a = this.audio;
    if (!a.isReady) return;
    const inGame = this.mode !== 'loading';
    const out = a.outdoor;
    a.loop('rain', 'rainOutdoor', inGame ? 0.5 + out * 0.4 : 0);
    a.loop('wind', 'wind', inGame ? 0.08 + out * 0.3 : 0);
    // Nearest world emitters (fans, radios, drips, TV) as positional loops.
    const cam = this.engine.camera.position;
    const ctx = this.world.ctx;
    const near = ctx.emitters
      .filter((e) => e.active())
      .map((e) => ({ e, d: e.pos.distanceTo(cam) }))
      .filter((x) => x.d < 14)
      .sort((x, y) => x.d - y.d)
      .slice(0, 5);
    const want = new Set(near.map((x) => x.e.id));
    for (const x of near) a.loop(`em:${x.e.id}`, x.e.sound, x.e.volume, x.e.pos, 'sfx');
    for (const id of this.emitterSlots) if (!want.has(id)) a.stopLoop(`em:${id}`);
    this.emitterSlots = want;
    // Buzz from the nearest lit tube light.
    let best: { pos: THREE.Vector3; level: number } | null = null;
    let bd = 5;
    for (const f of ctx.fixtures) {
      if (!f.buzz || f.level < 0.05) continue;
      const d = f.pos.distanceTo(cam);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    a.loop('buzz', 'tubeBuzz', best ? 0.18 * best.level : 0, best?.pos, 'sfx');
    // Player breathing and heartbeat follow fear and exhaustion.
    const exhausted = 1 - this.player.stamina;
    const breathVol =
      this.mode === 'play'
        ? Math.min(0.9, exhausted * 0.6 + this.fear * 0.5 + (this.hiding.hidden && !this.hiding.holdingBreath ? 0.35 : 0))
        : 0;
    a.loop('breath', this.fear > 0.5 || exhausted > 0.5 ? 'breathingHeavy' : 'breathing', breathVol, undefined, 'sfx');
    void dt;
  }

  private updateFear(dt: number): void {
    let target = 0;
    const g = this.ghost;
    if (g.visible) {
      const d = g.pos.distanceTo(this.player.pos);
      target = Math.max(target, 1 - d / 18);
    }
    if (this.ai.state === 'CHASE') target = Math.max(target, 0.85);
    if (this.ai.state === 'INSPECT') target = 1;
    if (this.apparitions.busy) target = Math.max(target, 0.5);
    target = Math.max(target, this.scarePulse * 0.8);
    this.scarePulse = Math.max(0, this.scarePulse - dt * 0.4);
    this.fear += (target - this.fear) * Math.min(1, dt * (target > this.fear ? 3 : 0.5));
    this.player.fear = this.fear;
    const fx = this.engine.fx.uniforms;
    fx.uFear!.value = this.fear * 0.8;
    fx.uTime!.value = this.time;
    if (this.mode !== 'caught') fx.uGlitch!.value = Math.max(0, (fx.uGlitch!.value as number) - dt * 1.2);
    // Heartbeat.
    if (this.mode === 'play' && this.fear > 0.25) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 1.1 - this.fear * 0.6;
        this.audio.play('heartbeat', { volume: 0.25 + this.fear * 0.6 });
      }
    }
  }

  private render(): void {
    const fx = this.engine.fx.uniforms;
    if (this.mode === 'cctv') {
      fx.uCctv!.value = 1;
      fx.uGlitch!.value = Math.max(this.cctvGlitch, fx.uGlitch!.value as number);
      const main = this.engine.camera;
      (this.engine.composer.passes[0] as unknown as { camera: THREE.Camera }).camera = this.cctv.camera;
      this.engine.render();
      (this.engine.composer.passes[0] as unknown as { camera: THREE.Camera }).camera = main;
      return;
    }
    fx.uCctv!.value = 0;
    const moon = this.weather.moon;
    const refreshMoon = moon.castShadow && moon.shadow.needsUpdate;
    if (refreshMoon) this.setArchCasters(true);
    this.engine.render();
    if (refreshMoon) this.setArchCasters(false);
  }

  private archCasters: THREE.Mesh[] | null = null;
  private setArchCasters(on: boolean): void {
    if (!this.archCasters) {
      this.archCasters = [];
      this.engine.scene.traverse((o) => {
        if (o.userData.archCaster) this.archCasters!.push(o as THREE.Mesh);
      });
    }
    for (const m of this.archCasters) m.castShadow = on;
  }

  /** Debug helpers for tests and screenshots (window.__hh). */
  teleport(name: string): void {
    const p = this.world.ctx.points.get(name);
    if (p) this.player.place(p.clone(), this.player.yaw, 0);
  }

  /** Automation / QA hooks used by scripts/playtest.mjs (window.__hh.dbg). */
  get dbg() {
    const ctx = this.world.ctx;
    return {
      tp: (x: number, y: number, z: number, yaw = 0, pitch = 0) => this.player.place(new THREE.Vector3(x, y, z), yaw, pitch),
      tpPoint: (name: string, yaw = 0) => {
        const p = ctx.points.get(name);
        if (p) this.player.place(p.clone(), yaw, 0);
        return !!p;
      },
      point: (name: string) => ctx.points.get(name)?.toArray() ?? null,
      act: (id: string) => {
        const it = ctx.interactables.find((i) => i.id === id);
        if (!it) return `missing:${id}`;
        const p = it.prompt();
        it.onInteract();
        return p;
      },
      prompt: (id: string) => ctx.interactables.find((i) => i.id === id)?.prompt() ?? 'missing',
      doorCenter: (id: string) => this.world.doors.get(id)?.center.toArray() ?? null,
      lookAt: (x: number, y: number, z: number) => {
        const dx = x - this.player.pos.x;
        const dz = z - this.player.pos.z;
        this.player.yaw = Math.atan2(-dx, -dz);
        this.player.pitch = Math.atan2(y - (this.player.pos.y + 1.6), Math.hypot(dx, dz));
      },
      info: () => ({
        mode: this.mode,
        chapter: state.chapter,
        objective: state.objective,
        flags: [...state.flags].filter((f) => !f.startsWith('trig:')),
        triggers: [...state.flags].filter((f) => f.startsWith('trig:')).length,
        inventory: [...state.inventory],
        evidence: [...state.evidence],
        ai: this.ai.state,
        ghost: this.ghost.pos.toArray().map((v) => Math.round(v * 10) / 10),
        player: this.player.pos.toArray().map((v) => Math.round(v * 10) / 10),
        room: this.playerRoom(),
        lift: `${this.world.lift.current}:${this.world.lift.state}`,
        scares: [...state.scaresUsed],
        ending: state.ending,
        playTime: Math.round(state.playTime),
        prompt: this.interaction.prompt,
        calls: this.engine.renderer.info.render.calls,
        tris: this.engine.renderer.info.render.triangles,
      }),
      give: (id: string) => state.give(id),
      setChapter: (n: number) => (state.chapter = n),
      power: (c: 'GF' | 'FF' | 'SF' | 'EMERGENCY', on: boolean) => power.set(c, on),
      sim: (steps: number) => (this.simOnly = steps),
      frame: () => this.render(),
      flag: (f: string) => state.set(f),
      godMode: (on: boolean) => {
        this.ai.aggression = on ? 0 : 0.5;
        if (on) this.ai.deactivate();
      },
    };
  }

  spawnPoint(): THREE.Vector3 {
    return SPAWN.clone();
  }
}
