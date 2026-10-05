import type { Input, Action } from '../player/input';
import type { ControlLayout } from '../core/settings';
import { DEFAULT_BUTTONS } from '../core/settings';
import { h, uiRoot } from './dom';
import { t } from '../core/i18n';

const ICONS: Record<string, string> = {
  interact:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11V5a1.5 1.5 0 013 0v5M12 10V3.5a1.5 1.5 0 013 0V10M15 10V5.5a1.5 1.5 0 013 0V14c0 4-2.5 7-6 7s-5-1.5-7-5l-1.5-3a1.5 1.5 0 012.6-1.5L9 14"/></svg>',
  flashlight:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3h10l-2 6H9zM9 9h6v11a1 1 0 01-1 1h-4a1 1 0 01-1-1z"/><path d="M12 13v3"/></svg>',
  crouch:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="5" r="2"/><path d="M12 8l-3 5h6l-1 7M9 13l-3 6"/></svg>',
  sprint:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="15" cy="4" r="2"/><path d="M8 21l3-6 3 2v5M6 11l4-3 4 1 3 4 3 1M11 15l-1-5"/></svg>',
  jump: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  inventory:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5a3 3 0 016 0v2"/></svg>',
  phone:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5v14M15 5v14"/></svg>',
  breath:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h10a3 3 0 10-3-3M4 16h13a3 3 0 11-3 3"/></svg>',
};

/**
 * Touch controls: a floating virtual joystick on the left, a drag-to-look area on the right, and
 * large buttons whose position, size and opacity the player can customise.
 */
export class MobileControls {
  readonly el: HTMLDivElement;
  private readonly joy: HTMLDivElement;
  private readonly knob: HTMLElement;
  private readonly buttons = new Map<string, HTMLDivElement>();
  private moveId: number | null = null;
  private lookId: number | null = null;
  private moveOrigin = { x: 0, y: 0 };
  private lookLast = { x: 0, y: 0 };
  editing = false;
  /** Context state set by the game every frame. */
  context = { canInteract: false, hiding: false, flashlightOn: true, crouching: false, sprinting: false };

  constructor(
    private readonly input: Input,
    private layout: ControlLayout,
    private readonly onLayoutChange: (l: ControlLayout) => void,
  ) {
    const moveZone = h('div', { class: 'zone move' });
    const lookZone = h('div', { class: 'zone look' });
    this.knob = h('i');
    this.joy = h('div', { class: 'joy', style: 'opacity:0' }, this.knob);
    this.el = h('div', { class: 'touch-ui' }, moveZone, lookZone, this.joy);
    uiRoot().append(this.el);
    this.el.style.display = 'none';

    moveZone.addEventListener('pointerdown', (e) => {
      if (this.editing || this.moveId !== null) return;
      this.moveId = e.pointerId;
      moveZone.setPointerCapture(e.pointerId);
      this.moveOrigin = { x: e.clientX, y: e.clientY };
      this.joy.style.left = `${e.clientX}px`;
      this.joy.style.top = `${e.clientY}px`;
      this.joy.style.opacity = String(Math.max(0.5, layout.opacity));
      this.knob.style.transform = '';
    });
    const endMove = (e: PointerEvent) => {
      if (e.pointerId !== this.moveId) return;
      this.moveId = null;
      this.input.stick.x = this.input.stick.y = 0;
      this.joy.style.opacity = '0';
    };
    moveZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.moveId) return;
      const dx = e.clientX - this.moveOrigin.x;
      const dy = e.clientY - this.moveOrigin.y;
      const r = 52;
      const len = Math.hypot(dx, dy);
      const k = len > r ? r / len : 1;
      this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const dead = 0.12;
      let sx = (dx * k) / r;
      let sy = (-dy * k) / r;
      if (Math.hypot(sx, sy) < dead) sx = sy = 0;
      this.input.stick.x = sx;
      this.input.stick.y = sy;
      // Pushing the stick all the way forward sprints (when sprint isn't toggled on).
      if (!layout.sprintToggle) this.input.setHeld('sprint', len > r * 1.35 && sy > 0.6);
    });
    moveZone.addEventListener('pointerup', endMove);
    moveZone.addEventListener('pointercancel', endMove);

    lookZone.addEventListener('pointerdown', (e) => {
      if (this.editing || this.lookId !== null) return;
      this.lookId = e.pointerId;
      lookZone.setPointerCapture(e.pointerId);
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      const scale = 1.6;
      this.input.look.x += (e.clientX - this.lookLast.x) * scale;
      this.input.look.y += (e.clientY - this.lookLast.y) * scale;
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => {
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);

    const actions: Record<string, Action> = {
      interact: 'interact',
      flashlight: 'flashlight',
      crouch: 'crouch',
      jump: 'jump',
      inventory: 'inventory',
      phone: 'phone',
      pause: 'pause',
    };
    for (const id of Object.keys(DEFAULT_BUTTONS)) {
      const label = id === 'breath' ? t('hud.holdBreath') : id === 'interact' ? t('hud.interact') : '';
      const b = h('div', { class: 'tbtn', 'data-id': id, html: (ICONS[id] ?? '') + (label ? `<span>${label.split(' ')[0]}</span>` : '') });
      this.el.append(b);
      this.buttons.set(id, b);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (this.editing) {
          this.startDrag(id, b, e);
          return;
        }
        b.setPointerCapture(e.pointerId);
        b.classList.add('pressed');
        if (id === 'sprint') {
          if (layout.sprintToggle) this.input.sprintToggled = !this.input.sprintToggled;
          else this.input.setHeld('sprint', true);
        } else if (id === 'breath') this.input.setHeld('breath', true);
        else if (actions[id]) this.input.press(actions[id]!);
        if (navigator.vibrate) navigator.vibrate(8);
      });
      const up = () => {
        b.classList.remove('pressed');
        if (id === 'sprint' && !layout.sprintToggle) this.input.setHeld('sprint', false);
        if (id === 'breath') this.input.setHeld('breath', false);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    }
    this.applyLayout(layout);
  }

  applyLayout(l: ControlLayout): void {
    this.layout = l;
    this.el.classList.toggle('left-handed', l.leftHanded);
    for (const [id, b] of this.buttons) {
      const p = l.buttons[id] ?? DEFAULT_BUTTONS[id]!;
      const x = l.leftHanded ? 1 - p.x : p.x;
      b.style.left = `${x * 100}%`;
      b.style.top = `${p.y * 100}%`;
      const s = p.s * l.scale;
      b.style.transform = `scale(${s})`;
      b.style.opacity = String(l.opacity + 0.25);
    }
  }

  private startDrag(id: string, b: HTMLDivElement, e: PointerEvent): void {
    b.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = Math.min(0.98, Math.max(0.02, ev.clientX / window.innerWidth));
      const y = Math.min(0.98, Math.max(0.02, ev.clientY / window.innerHeight));
      const cur = this.layout.buttons[id] ?? { ...DEFAULT_BUTTONS[id]! };
      this.layout.buttons[id] = { ...cur, x: this.layout.leftHanded ? 1 - x : x, y };
      this.applyLayout(this.layout);
    };
    const up = () => {
      b.removeEventListener('pointermove', move);
      b.removeEventListener('pointerup', up);
      this.onLayoutChange(this.layout);
    };
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', up);
  }

  /** Opens the drag-to-customise editor. */
  edit(onDone: () => void): void {
    this.editing = true;
    this.show(true);
    this.el.classList.add('editing');
    for (const b of this.buttons.values()) b.classList.remove('hidden', 'dim');
    const scale = h('input', { type: 'range', min: '0.7', max: '1.5', step: '0.05', value: String(this.layout.scale) }) as HTMLInputElement;
    scale.oninput = () => {
      this.layout.scale = Number(scale.value);
      this.applyLayout(this.layout);
    };
    const op = h('input', {
      type: 'range',
      min: '0.15',
      max: '0.75',
      step: '0.05',
      value: String(this.layout.opacity),
    }) as HTMLInputElement;
    op.oninput = () => {
      this.layout.opacity = Number(op.value);
      this.applyLayout(this.layout);
    };
    const bar = h(
      'div',
      { class: 'editor-bar' },
      h('span', {}, t('set.dragHint')),
      h('label', {}, `${t('set.btnScale')} `, scale),
      h('label', {}, `${t('set.opacity')} `, op),
    );
    const reset = h('button', { class: 'hh-btn small' }, t('set.reset'));
    reset.onclick = () => {
      this.layout.buttons = structuredClone(DEFAULT_BUTTONS);
      this.layout.scale = 1;
      this.applyLayout(this.layout);
    };
    const done = h('button', { class: 'hh-btn small' }, t('set.done'));
    done.onclick = () => {
      this.editing = false;
      this.el.classList.remove('editing');
      bar.remove();
      this.onLayoutChange(this.layout);
      onDone();
    };
    bar.append(reset, done);
    this.el.append(bar);
  }

  show(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
    if (!on) {
      this.moveId = this.lookId = null;
      this.input.stick.x = this.input.stick.y = 0;
      this.joy.style.opacity = '0';
    }
  }

  update(): void {
    if (this.editing) return;
    const c = this.context;
    const b = (id: string) => this.buttons.get(id)!;
    b('interact').classList.toggle('hot', c.canInteract || c.hiding);
    b('interact').classList.toggle('dim', !c.canInteract && !c.hiding);
    b('breath').classList.toggle('hidden', !c.hiding);
    b('flashlight').classList.toggle('on', c.flashlightOn);
    b('crouch').classList.toggle('on', c.crouching);
    b('sprint').classList.toggle('on', c.sprinting);
    for (const id of ['sprint', 'jump', 'crouch']) b(id).classList.toggle('hidden', c.hiding);
  }
}
