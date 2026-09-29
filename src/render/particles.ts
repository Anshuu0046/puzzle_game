import { Container, Sprite, Texture } from 'pixi.js';

/** Upper bound on live particles; extra emits are dropped so big combos stay at 60 FPS. */
const MAX_PARTICLES = 500;

type Kind = 'dot' | 'petal' | 'sparkle';

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  spin: number;
  life: number;
  age: number;
  scale0: number;
  gravity: number;
}

function makeTexture(kind: Kind, size: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  if (kind === 'dot') {
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  } else if (kind === 'petal') {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(c, c, size * 0.42, size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? c * 0.95 : c * 0.22;
      const a = (i * Math.PI) / 4;
      ctx.lineTo(c + r * Math.cos(a), c + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
  }
  return Texture.from(canvas);
}

/** Pooled sprite particles, advanced by the app ticker (no per-particle tweens). */
export class Particles {
  readonly root = new Container();
  private readonly textures: Record<Kind, Texture>;
  private readonly pool: Sprite[] = [];
  private readonly live: Particle[] = [];
  /** 0..1 multiplier on particle counts (lowered for reduced motion). */
  density = 1;

  constructor() {
    this.textures = { dot: makeTexture('dot', 32), petal: makeTexture('petal', 32), sparkle: makeTexture('sparkle', 32) };
  }

  get count(): number {
    return this.live.length;
  }

  /** A candy pop: colored dots, petals and a couple of white sparkles flying out and falling. */
  pop(x: number, y: number, color: number, cell: number, strength = 1): void {
    const n = Math.round(7 * strength * this.density);
    for (let i = 0; i < n; i++) {
      const kind: Kind = i < 2 ? 'sparkle' : i % 3 === 0 ? 'petal' : 'dot';
      const angle = Math.random() * Math.PI * 2;
      const speed = cell * (1.6 + Math.random() * 2.4) * strength;
      this.spawn(kind, x, y, kind === 'sparkle' ? 0xffffff : color, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - cell * 1.5,
        size: cell * (kind === 'sparkle' ? 0.32 : kind === 'petal' ? 0.28 : 0.2) * (0.7 + Math.random() * 0.6),
        life: 0.45 + Math.random() * 0.35,
        gravity: cell * 9,
      });
    }
  }

  /** A ring of sparkles (special created, big hits). */
  sparkleRing(x: number, y: number, radius: number, color: number): void {
    const n = Math.round(12 * this.density);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(i % 2 ? 'sparkle' : 'dot', x, y, i % 2 ? 0xffffff : color, {
        vx: Math.cos(a) * radius * 3,
        vy: Math.sin(a) * radius * 3,
        size: radius * 0.25,
        life: 0.5,
        gravity: 0,
      });
    }
  }

  private spawn(kind: Kind, x: number, y: number, tint: number, o: { vx: number; vy: number; size: number; life: number; gravity: number }): void {
    if (this.live.length >= MAX_PARTICLES) return;
    const sprite = this.pool.pop() ?? new Sprite();
    sprite.texture = this.textures[kind];
    sprite.anchor.set(0.5);
    sprite.tint = tint;
    sprite.alpha = 1;
    sprite.position.set(x, y);
    sprite.rotation = Math.random() * Math.PI;
    const scale0 = o.size / 32;
    sprite.scale.set(scale0);
    sprite.visible = true;
    this.root.addChild(sprite);
    this.live.push({ sprite, vx: o.vx, vy: o.vy, spin: (Math.random() - 0.5) * 8, life: o.life, age: 0, scale0, gravity: o.gravity });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.sprite.visible = false;
        this.root.removeChild(p.sprite);
        this.pool.push(p.sprite);
        this.live[i] = this.live[this.live.length - 1]!;
        this.live.pop();
        continue;
      }
      p.vx *= 1 - 2.5 * dt;
      p.vy += p.gravity * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      // Ease out: full size for most of the life, then shrink and fade.
      const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      p.sprite.alpha = fade;
      p.sprite.scale.set(p.scale0 * (0.4 + 0.6 * fade));
    }
  }

  clear(): void {
    for (const p of this.live) {
      p.sprite.visible = false;
      this.root.removeChild(p.sprite);
      this.pool.push(p.sprite);
    }
    this.live.length = 0;
  }
}
