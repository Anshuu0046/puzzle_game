import { h, screen } from '../ui/dom';
import { t } from '../core/i18n';
import { bus } from '../core/events';

export interface PhoneMessage {
  from: string;
  text: string;
  time: string;
}

export type PhoneMode = 'closed' | 'home' | 'camera';

/**
 * The player's smartphone: messages (including the ones that shouldn't be possible), a torch
 * shortcut, a camera whose viewfinder sees things the eye doesn't, notes and an emergency call.
 */
export class PhoneSystem {
  messages: PhoneMessage[] = [];
  unread = 0;
  battery = 0.64;
  mode: PhoneMode = 'closed';
  private ui: { el: HTMLElement; close: () => void } | null = null;
  private screenEl!: HTMLElement;
  /** Provided by the game. */
  hooks = {
    toggleTorch: () => {},
    torchOn: () => true,
    notes: (): { text: string; done: boolean }[] => [],
    onClose: () => {},
    onCamera: (_on: boolean) => {},
    onCapture: () => {},
    onEmergency: (): string[] | null => null,
  };
  private calledOnce = false;

  receive(from: string, text: string, silent = false): void {
    const d = new Date();
    const time = `02:${String(7 + Math.floor((Date.now() / 60000) % 50)).padStart(2, '0')}`;
    void d;
    this.messages.push({ from, text, time });
    this.unread++;
    if (!silent) {
      bus.emit('sfx', { name: 'phoneVibrate', volume: 0.9 });
      bus.emit('vibrate', { ms: [120, 80, 120] });
      bus.emit('toast', { text: `${from}: “${text}”`, duration: 5 });
    }
    if (this.mode === 'home') this.home();
  }

  open(): void {
    if (this.mode !== 'closed') return;
    this.mode = 'home';
    this.ui = screen('phone-wrap');
    const phone = h('div', { class: 'phone' });
    const bar = h(
      'div',
      { class: 'bar' },
      h('span', {}, '02:07'),
      h('span', {}, `${t('phone.noSignal')} · ${Math.round(this.battery * 100)}%`),
    );
    this.screenEl = h('div', { class: 'screen' });
    phone.append(bar, this.screenEl);
    this.ui.el.append(phone);
    this.ui.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.ui?.el) this.close();
    });
    this.home();
    bus.emit('sfx', { name: 'uiClick', volume: 0.5 });
  }

  close(): void {
    if (this.mode === 'camera') this.hooks.onCamera(false);
    this.mode = 'closed';
    this.ui?.close();
    this.ui = null;
    this.hooks.onClose();
  }

  private app(icon: string, label: string, bg: string, onClick: () => void, badge = 0): HTMLElement {
    const b = h('button', { class: 'app' }, h('i', { style: `background:${bg}` }, icon), label);
    if (badge) b.append(h('span', { class: 'badge' }, String(badge)));
    b.onclick = () => {
      bus.emit('sfx', { name: 'uiClick', volume: 0.4 });
      onClick();
    };
    return b;
  }

  private header(title: string): HTMLElement {
    const back = h('button', {}, `‹ ${t('phone.back')}`);
    back.onclick = () => this.home();
    return h('div', { class: 'head' }, back, h('span', {}, title));
  }

  home(): void {
    if (!this.ui) return;
    this.screenEl.replaceChildren(
      h('div', { class: 'clock' }, '02:07'),
      h('div', { class: 'dateline' }, 'Monday, 14 November'),
      h(
        'div',
        { class: 'apps' },
        this.app('✉', t('phone.messages'), '#2f6f4f', () => this.showMessages(), this.unread),
        this.app('☀', t('phone.torch'), this.hooks.torchOn() ? '#c9a35d' : '#3a3f48', () => {
          this.hooks.toggleTorch();
          this.home();
        }),
        this.app('◉', t('phone.camera'), '#3a3f48', () => this.camera()),
        this.app('✎', t('phone.notes'), '#b58f3a', () => this.showNotes()),
        this.app('☎', t('phone.emergency'), '#8e1d16', () => this.emergency()),
      ),
    );
  }

  private showMessages(): void {
    this.unread = 0;
    const list = h('div', { class: 'msgs' });
    for (const m of this.messages)
      list.append(
        h('div', { class: `bubble ${m.from === t('phone.unknown') ? 'unknown' : ''}` }, h('small', {}, `${m.from} · ${m.time}`), m.text),
      );
    this.screenEl.replaceChildren(this.header(t('phone.messages')), list);
    this.screenEl.scrollTop = this.screenEl.scrollHeight;
  }

  private showNotes(): void {
    const notes = this.hooks.notes();
    const ul = h('ul');
    for (const n of notes) ul.append(h('li', { class: n.done ? 'done' : '' }, n.text));
    this.screenEl.replaceChildren(this.header(t('phone.notes')), h('div', { class: 'notes' }, notes.length ? ul : t('phone.notesEmpty')));
  }

  private emergency(): void {
    const status = h('div', {}, t('phone.calling'));
    const end = h('button', { class: 'end' }, '✕');
    end.onclick = () => this.home();
    this.screenEl.replaceChildren(h('div', { class: 'call' }, h('div', { style: 'font-size:20px' }, 'Warden R.K.'), status, end));
    bus.emit('sfx', { name: 'phoneNotify', volume: 0.3 });
    setTimeout(() => {
      const lines = !this.calledOnce ? this.hooks.onEmergency() : null;
      if (lines) {
        this.calledOnce = true;
        status.textContent = '00:0' + lines.length;
        bus.emit('sfx', { name: 'radioStatic', volume: 0.6 });
        lines.forEach((l, i) => setTimeout(() => bus.emit('subtitle', { text: l, speaker: '???', duration: 3 }), i * 2200));
      } else status.textContent = t('phone.callFailed');
    }, 2200);
  }

  private camera(): void {
    this.mode = 'camera';
    this.ui?.close();
    this.ui = screen('phone-cam');
    const shutter = h('button', { class: 'shutter' });
    shutter.onclick = () => {
      this.ui?.el.append(h('div', { class: 'flash' }));
      this.battery = Math.max(0.05, this.battery - 0.01);
      bus.emit('sfx', { name: 'switchClick', volume: 0.8 });
      this.hooks.onCapture();
    };
    const back = h('button', { class: 'hh-btn small' }, t('phone.back'));
    back.onclick = () => {
      this.hooks.onCamera(false);
      this.mode = 'closed';
      this.ui?.close();
      this.ui = null;
      this.open();
    };
    this.ui.el.append(
      h('div', { class: 'frame' }),
      h('div', { class: 'top' }, h('span', {}, '● 1080p'), h('span', {}, `${Math.round(this.battery * 100)}%`)),
      h('div', { style: 'display:flex;gap:24px;align-items:center' }, back, shutter),
    );
    this.hooks.onCamera(true);
  }

  update(dt: number): void {
    this.battery = Math.max(0.05, this.battery - dt / (this.mode === 'camera' ? 900 : 7200));
  }
}
