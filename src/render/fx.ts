import { gsap } from 'gsap';
import { Container, Graphics } from 'pixi.js';

/** Short-lived blast visuals drawn above the pieces. Every effect cleans itself up. */
export class FxLayer {
  readonly root = new Container();

  /** A glowing bar sweeping out from `from` along a row or column. */
  beam(x: number, y: number, horizontal: boolean, length: number, thickness: number, color: number): void {
    const g = new Graphics();
    const half = length / 2;
    if (horizontal) {
      g.roundRect(-half, -thickness / 2, length, thickness, thickness / 2).fill({ color, alpha: 0.55 });
      g.roundRect(-half, -thickness / 5, length, (thickness * 2) / 5, thickness / 5).fill({ color: 0xffffff, alpha: 0.95 });
    } else {
      g.roundRect(-thickness / 2, -half, thickness, length, thickness / 2).fill({ color, alpha: 0.55 });
      g.roundRect(-thickness / 5, -half, (thickness * 2) / 5, length, thickness / 5).fill({ color: 0xffffff, alpha: 0.95 });
    }
    g.position.set(x, y);
    if (horizontal) g.scale.set(0.05, 1);
    else g.scale.set(1, 0.05);
    this.root.addChild(g);
    gsap
      .timeline({ onComplete: () => done(g) })
      .to(g.scale, { x: 1, y: 1, duration: 0.18, ease: 'power3.out' })
      .to(g, { alpha: 0, duration: 0.25, ease: 'power2.in' }, 0.12)
      .to(g.scale, horizontal ? { y: 0.2, duration: 0.25, ease: 'power2.in' } : { x: 0.2, duration: 0.25, ease: 'power2.in' }, 0.12);
  }

  /** An expanding shock ring. */
  ring(x: number, y: number, from: number, to: number, width: number, color: number): void {
    const g = new Graphics();
    g.circle(0, 0, 100).stroke({ color, width: (width / to) * 100, alpha: 0.9 });
    g.circle(0, 0, 100).fill({ color: 0xffffff, alpha: 0.25 });
    g.position.set(x, y);
    g.scale.set(from / 100);
    this.root.addChild(g);
    gsap
      .timeline({ onComplete: () => done(g) })
      .to(g.scale, { x: to / 100, y: to / 100, duration: 0.35, ease: 'power3.out' })
      .to(g, { alpha: 0, duration: 0.3, ease: 'power2.in' }, 0.1);
  }

  /** Sparkling rays from an origin to many targets (Prism Orb). */
  rays(x: number, y: number, targets: readonly { x: number; y: number }[], color: number): void {
    const g = new Graphics();
    for (const t of targets) {
      g.moveTo(x, y).lineTo(t.x, t.y).stroke({ color, width: 6, alpha: 0.35, cap: 'round' });
      g.moveTo(x, y).lineTo(t.x, t.y).stroke({ color: 0xffffff, width: 2, alpha: 0.9, cap: 'round' });
      g.circle(t.x, t.y, 6).fill({ color: 0xffffff, alpha: 0.9 });
    }
    g.alpha = 0;
    this.root.addChild(g);
    gsap
      .timeline({ onComplete: () => done(g) })
      .to(g, { alpha: 1, duration: 0.08, ease: 'power2.out' })
      .to(g, { alpha: 0, duration: 0.35, ease: 'power2.in' }, 0.2);
  }

  /** A soft full-area flash. */
  flash(x: number, y: number, width: number, height: number, radius: number): void {
    const g = new Graphics();
    g.roundRect(x, y, width, height, radius).fill({ color: 0xffffff, alpha: 0.7 });
    this.root.addChild(g);
    gsap.to(g, { alpha: 0, duration: 0.45, ease: 'power2.out', onComplete: () => done(g) });
  }

  clear(): void {
    for (const child of [...this.root.children]) {
      gsap.killTweensOf([child, child.scale]);
      done(child);
    }
  }
}

function done(c: Container): void {
  if (!c.destroyed) c.destroy();
}
