import * as THREE from 'three';
import { SOUNDS, impulseResponse, renderSound } from './synth';
import { bus } from '../core/events';
import type { CollisionWorld } from '../world/collision';

export type MusicState = 'NORMAL' | 'TENSION' | 'CHASE' | 'DISCOVERY' | 'ENDING' | 'SILENT';

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode | null;
  panner: PannerNode | null;
  pos: THREE.Vector3 | null;
  occlusion: number;
}

interface LoopHandle {
  name: string;
  voice: Voice;
  target: number;
  current: number;
}

/**
 * Web Audio engine. All buffers are synthesised at load (see synth.ts) and can be replaced by
 * recorded files: put `public/audio/<name>.ogg` and list it in OVERRIDES — it will be decoded and
 * used instead of the synthesised version.
 *
 * Features: HRTF positional sources with distance rolloff, occlusion low-pass through walls,
 * a convolution reverb send, ambience beds (rain/wind) that open up outdoors, crossfaded music
 * states, and pooled positional loops for world emitters (fans, buzzing tubes, radios).
 */
export class AudioSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private musicBus!: GainNode;
  private reverbSend!: GainNode;
  private ambFilter!: BiquadFilterNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly voices = new Set<Voice>();
  private readonly loops = new Map<string, LoopHandle>();
  private music: { state: MusicState; handle: LoopHandle | null; old: LoopHandle[] } = { state: 'SILENT', handle: null, old: [] };
  private readonly listenerPos = new THREE.Vector3();
  private occlusionT = 0;
  volumes = { master: 0.9, music: 0.6, sfx: 1, ambience: 0.85 };
  hrtf = true;
  col: CollisionWorld | null = null;
  outdoor = 0;
  /** 0..1 how muffled the outside is (inside the building = 1). */
  private ready = false;

  /** Must be called from a user gesture on mobile browsers. */
  async init(onProgress?: (f: number) => void): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.ambFilter = ctx.createBiquadFilter();
    this.ambFilter.type = 'lowpass';
    this.ambFilter.frequency.value = 1200;
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.ambFilter).connect(this.master);
    this.musicBus.connect(this.master);
    // Reverb.
    const conv = ctx.createConvolver();
    const ir = impulseResponse(ctx.sampleRate, 2.4, 3.2);
    const irBuf = ctx.createBuffer(2, ir[0]!.length, ctx.sampleRate);
    irBuf.copyToChannel(ir[0]! as Float32Array<ArrayBuffer>, 0);
    irBuf.copyToChannel(ir[1]! as Float32Array<ArrayBuffer>, 1);
    conv.buffer = irBuf;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(conv).connect(this.master);
    this.applyVolumes();
    await this.generate(onProgress);
    this.ready = true;
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  }

  /** Synthesises every buffer, yielding between sounds so the loading screen stays responsive. */
  private async generate(onProgress?: (f: number) => void): Promise<void> {
    const ctx = this.ctx!;
    const names = Object.keys(SOUNDS);
    // Lower sample rate for synthesis keeps memory and load time down; Web Audio resamples.
    const sr = 22050;
    let i = 0;
    for (const name of names) {
      const r = renderSound(name, sr);
      const b = ctx.createBuffer(r.channels.length, r.channels[0]!.length, r.sampleRate);
      r.channels.forEach((c, k) => b.copyToChannel(c as Float32Array<ArrayBuffer>, k));
      this.buffers.set(name, b);
      i++;
      onProgress?.(i / names.length);
      if (i % 4 === 0) await new Promise((res) => setTimeout(res, 0));
    }
    await this.loadOverrides();
  }

  /** Optional recorded replacements (none shipped). */
  private async loadOverrides(): Promise<void> {
    const OVERRIDES: string[] = [];
    for (const name of OVERRIDES) {
      try {
        const res = await fetch(`./audio/${name}.ogg`);
        if (!res.ok) continue;
        const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(name, buf);
      } catch {
        /* keep synthesised version */
      }
    }
  }

  get isReady(): boolean {
    return this.ready && !!this.ctx;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.volumes.ambience, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.05);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  private makeVoice(
    name: string,
    opts: { pos?: THREE.Vector3 | null; volume?: number; rate?: number; loop?: boolean; bus?: 'sfx' | 'amb' | 'music'; reverb?: number },
  ): Voice | null {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !buffer) return null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = !!opts.loop;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    let node: AudioNode = src;
    let filter: BiquadFilterNode | null = null;
    let panner: PannerNode | null = null;
    if (opts.pos) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
      panner = ctx.createPanner();
      panner.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1.3;
      panner.maxDistance = 60;
      panner.rolloffFactor = 1.3;
      panner.positionX.value = opts.pos.x;
      panner.positionY.value = opts.pos.y;
      panner.positionZ.value = opts.pos.z;
      node.connect(filter);
      filter.connect(panner);
      node = panner;
    }
    node.connect(gain);
    const out = opts.bus === 'amb' ? this.ambBus : opts.bus === 'music' ? this.musicBus : this.sfxBus;
    gain.connect(out);
    if ((opts.reverb ?? 0.4) > 0 && opts.bus !== 'music') {
      const send = ctx.createGain();
      send.gain.value = (opts.reverb ?? 0.4) * (1 - this.outdoor * 0.7);
      gain.connect(send).connect(this.reverbSend);
    }
    const v: Voice = { src, gain, filter, panner, pos: opts.pos ? opts.pos.clone() : null, occlusion: 0 };
    if (v.pos && this.col) this.updateOcclusion(v, true);
    src.start();
    this.voices.add(v);
    src.onended = () => {
      this.voices.delete(v);
      gain.disconnect();
    };
    return v;
  }

  play(name: string, opts: { pos?: THREE.Vector3 | null; volume?: number; rate?: number; reverb?: number } = {}): void {
    if (!this.ready) return;
    // Variant groups ("step:tile" → random step_tile_N).
    let n = name;
    if (name.startsWith('step:')) n = `step_${name.slice(5)}_${Math.floor(Math.random() * 4)}`;
    if (name === 'breathingHeavyOnce') {
      this.makeVoice('breathingHeavy', { volume: (opts.volume ?? 1) * 0.6, reverb: 0.1 });
      return;
    }
    this.makeVoice(n, { ...opts, pos: opts.pos ?? null });
  }

  /** Starts (or retargets) a named loop. Positional when `pos` is given. */
  loop(id: string, name: string, volume: number, pos?: THREE.Vector3, bus: 'sfx' | 'amb' = 'amb'): void {
    if (!this.ready) return;
    const h = this.loops.get(id);
    if (h) {
      h.target = volume;
      if (pos && h.voice.panner) {
        h.voice.pos!.copy(pos);
        const p = h.voice.panner;
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      }
      return;
    }
    if (volume <= 0.001) return;
    const v = this.makeVoice(name, { pos: pos ?? null, volume: 0, loop: true, bus, reverb: pos ? 0.3 : 0 });
    if (!v) return;
    // Random start offset so identical loops don't phase.
    this.loops.set(id, { name, voice: v, target: volume, current: 0 });
  }

  stopLoop(id: string): void {
    const h = this.loops.get(id);
    if (h) h.target = 0;
  }

  setMusic(state: MusicState): void {
    if (this.music.state === state) return;
    this.music.state = state;
    if (this.music.handle) {
      this.music.handle.target = 0;
      this.music.old.push(this.music.handle);
      this.music.handle = null;
    }
    const name = {
      NORMAL: 'musicNormal',
      TENSION: 'musicTension',
      CHASE: 'musicChase',
      DISCOVERY: 'musicDiscovery',
      ENDING: 'musicEnding',
      SILENT: '',
    }[state];
    if (!name || !this.ready) return;
    const v = this.makeVoice(name, { volume: 0, loop: true, bus: 'music' });
    if (v) this.music.handle = { name, voice: v, target: state === 'CHASE' ? 1 : 0.8, current: 0 };
  }

  private updateOcclusion(v: Voice, instant = false): void {
    if (!v.pos || !v.filter || !this.col) return;
    const p = this.listenerPos;
    const blocked = this.col.segmentBlocked(p.x, p.y, p.z, v.pos.x, v.pos.y, v.pos.z, 'door') ? 1 : 0;
    const d = p.distanceTo(v.pos);
    const target = blocked ? Math.max(500, 2200 - d * 60) : 18000;
    const t = this.ctx!.currentTime;
    if (instant) v.filter.frequency.value = target;
    else v.filter.frequency.setTargetAtTime(target, t, 0.15);
  }

  update(dt: number, camera: THREE.Camera): void {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    // Listener.
    camera.getWorldPosition(this.listenerPos);
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const L = ctx.listener;
    if (L.positionX) {
      const t = ctx.currentTime;
      L.positionX.setTargetAtTime(this.listenerPos.x, t, 0.02);
      L.positionY.setTargetAtTime(this.listenerPos.y, t, 0.02);
      L.positionZ.setTargetAtTime(this.listenerPos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      L.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.setTargetAtTime(up.x, t, 0.02);
      L.upY.setTargetAtTime(up.y, t, 0.02);
      L.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      L.setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
    // Outdoor ambience opens up; indoors the rain is muffled through walls.
    this.ambFilter.frequency.setTargetAtTime(600 + this.outdoor * 14000, ctx.currentTime, 0.3);
    // Occlusion refresh (throttled).
    this.occlusionT -= dt;
    if (this.occlusionT <= 0) {
      this.occlusionT = 0.2;
      for (const v of this.voices) this.updateOcclusion(v);
    }
    // Loop fades.
    for (const [id, h] of this.loops) {
      h.current += (h.target - h.current) * Math.min(1, dt * 2.5);
      h.voice.gain.gain.value = h.current;
      if (h.target === 0 && h.current < 0.002) {
        try {
          h.voice.src.stop();
        } catch {
          /* already stopped */
        }
        this.loops.delete(id);
      }
    }
    const m = this.music;
    if (m.handle) {
      m.handle.current += (m.handle.target - m.handle.current) * Math.min(1, dt * 0.6);
      m.handle.voice.gain.gain.value = m.handle.current;
    }
    m.old = m.old.filter((h) => {
      h.current *= Math.max(0, 1 - dt * 0.8);
      h.voice.gain.gain.value = h.current;
      if (h.current < 0.003) {
        try {
          h.voice.src.stop();
        } catch {
          /* ignore */
        }
        return false;
      }
      return true;
    });
  }

  /** Wires the bus: sfx events become sounds. */
  bindEvents(): void {
    bus.on('sfx', (e) => this.play(e.name, { pos: e.pos ?? null, volume: e.volume, rate: e.rate }));
    bus.on('musicState', (e) => this.setMusic(e.state));
  }

  stopAll(): void {
    for (const id of [...this.loops.keys()]) this.stopLoop(id);
    this.setMusic('SILENT');
  }
}
