import { button, h, screen, uiRoot } from './dom';
import { t } from '../core/i18n';
import { applyPreset, saveSettings, type Level, type Settings } from '../core/settings';

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------
export class LoadingScreen {
  private readonly s = screen('loading grain');
  private readonly fill: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly tip: HTMLElement;
  private tipTimer: number;

  constructor() {
    this.fill = h('i', { style: 'width:0%' });
    this.stage = h('div', { class: 'stage' }, t('load.loading'));
    this.tip = h('div', { class: 'tip' });
    this.s.el.append(
      h('h1', { class: 'title-mark' }, 'HAUNTED ', h('span', { class: 'flick' }, 'HOSTEL')),
      h('div', { class: 'bar' }, this.fill),
      this.stage,
      this.tip,
    );
    let i = Math.floor(Math.random() * 9);
    const next = () => {
      this.tip.style.opacity = '0';
      setTimeout(() => {
        this.tip.textContent = `“${t(`tip.${i++ % 9}`)}”`;
        this.tip.style.opacity = '1';
      }, 600);
    };
    next();
    this.tipTimer = window.setInterval(next, 4500);
  }

  progress(f: number, stageKey: string): void {
    this.fill.style.width = `${Math.round(Math.min(1, f) * 100)}%`;
    this.stage.textContent = `${t(stageKey)} — ${Math.round(f * 100)}%`;
  }

  close(): void {
    clearInterval(this.tipTimer);
    this.s.close();
  }
}

/** "Tap to begin" gate — needed so audio can start from a user gesture. */
export function tapToStart(): Promise<void> {
  return new Promise((resolve) => {
    const s = screen('tap-start grain');
    s.el.append(
      h('h1', { class: 'title-mark' }, 'HAUNTED HOSTEL'),
      h('div', { class: 'hint' }, t('menu.tapToStart')),
      h('div', { class: 'hint', style: 'animation:none;opacity:.5' }, t('menu.headphones')),
    );
    const go = () => {
      s.close();
      resolve();
    };
    s.el.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
  });
}

// ---------------------------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------------------------
export interface MenuHandlers {
  play: () => void;
  cont: (() => void) | null;
  settings: () => void;
  howto: () => void;
  exit: () => void;
  saveInfo: string | null;
}

export function mainMenu(hd: MenuHandlers): () => void {
  const s = screen('menu');
  const nav = h('nav');
  if (hd.cont) {
    nav.append(button(t('menu.continue'), hd.cont));
    if (hd.saveInfo) nav.append(h('div', { class: 'save-info' }, hd.saveInfo));
  }
  nav.append(
    button(t('menu.play'), () => {
      if (hd.cont) confirm(t('menu.newGameConfirm'), hd.play);
      else hd.play();
    }),
    button(t('menu.settings'), hd.settings),
    button(t('menu.howto'), hd.howto),
    button(t('menu.exit'), hd.exit),
  );
  s.el.append(
    h('div', {}, h('h1', { class: 'title-mark' }, 'HAUNTED', h('br'), h('span', { class: 'flick' }, 'HOSTEL'))),
    h('div', { class: 'subtitle' }, t('menu.subtitle')),
    nav,
    h('div', { class: 'foot' }, 'KAVERI HOSTEL · BLOCK B · 02:07 AM'),
  );
  return s.close;
}

export function confirm(text: string, yes: () => void, no?: () => void): void {
  const s = screen('overlay');
  const close = s.close;
  s.el.append(
    h(
      'div',
      { class: 'panel', style: 'width:min(460px,100%)' },
      h(
        'div',
        { class: 'confirm' },
        h('p', {}, text),
        h(
          'div',
          { class: 'btns' },
          button(
            t('menu.yes'),
            () => {
              close();
              yes();
            },
            'small',
          ),
          button(
            t('menu.no'),
            () => {
              close();
              no?.();
            },
            'small',
          ),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------
export interface SettingsHooks {
  apply: (s: Settings) => void;
  customizeControls: () => void;
  close: () => void;
  touch: boolean;
}

export function settingsScreen(settings: Settings, hooks: SettingsHooks): void {
  const s = screen('overlay');
  const body = h('div', { class: 'body' });
  const tabs = h('div', { class: 'tabs' });
  const tabNames = ['graphics', 'audio', 'controls', 'access'] as const;
  let current: (typeof tabNames)[number] = 'graphics';
  const changed = () => {
    saveSettings(settings);
    hooks.apply(settings);
  };
  const levels = [t('set.off'), t('set.low'), t('set.medium'), t('set.high')];
  const qlevels = [t('set.low'), t('set.medium'), t('set.high'), t('set.ultra')];

  const seg = (labels: string[], value: number, onPick: (i: number) => void) => {
    const el = h('div', { class: 'seg' });
    labels.forEach((l, i) => {
      const b = h('button', { class: i === value ? 'on' : '' }, l);
      b.onclick = () => {
        onPick(i);
        render();
      };
      el.append(b);
    });
    return el;
  };
  const slider = (min: number, max: number, step: number, value: number, fmt: (v: number) => string, onInput: (v: number) => void) => {
    const val = h('span', { class: 'val' }, fmt(value));
    const inp = h('input', {
      type: 'range',
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(value),
    }) as HTMLInputElement;
    inp.oninput = () => {
      onInput(Number(inp.value));
      val.textContent = fmt(Number(inp.value));
    };
    inp.onchange = changed;
    return h('div', { class: 'ctl' }, inp, val);
  };
  const toggle = (value: boolean, onToggle: (v: boolean) => void) => {
    const el = h('div', { class: `toggle ${value ? 'on' : ''}`, role: 'switch' });
    el.onclick = () => {
      onToggle(!el.classList.contains('on'));
      el.classList.toggle('on');
      changed();
    };
    return el;
  };
  const row = (label: string, ctl: HTMLElement) => h('div', { class: 'row' }, h('label', {}, label), ctl);
  const g = settings.graphics;
  const custom = () => {
    g.preset = 'CUSTOM';
    changed();
  };

  const render = () => {
    tabs.replaceChildren(
      ...tabNames.map((n) => {
        const b = h('button', { class: n === current ? 'on' : '' }, t(`set.${n}`));
        b.onclick = () => {
          current = n;
          render();
        };
        return b;
      }),
    );
    body.replaceChildren();
    if (current === 'graphics') {
      const presets = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as const;
      body.append(
        row(
          t('set.preset'),
          seg(
            [...qlevels, ...(g.preset === 'CUSTOM' ? [t('set.custom')] : [])],
            g.preset === 'CUSTOM' ? 4 : presets.indexOf(g.preset as (typeof presets)[number]),
            (i) => {
              if (i < 4) applyPreset(g, presets[i]!);
              changed();
            },
          ),
        ),
        row(
          t('set.shadows'),
          seg(levels, g.shadowQuality, (i) => {
            g.shadowQuality = i as Level;
            custom();
          }),
        ),
        row(
          t('set.textures'),
          seg(qlevels, g.textureQuality, (i) => {
            g.textureQuality = i as Level;
            custom();
          }),
        ),
        row(
          t('set.effects'),
          seg(qlevels, g.effectsQuality, (i) => {
            g.effectsQuality = i as Level;
            custom();
          }),
        ),
        row(
          t('set.fog'),
          seg(qlevels, g.fogQuality, (i) => {
            g.fogQuality = i as Level;
            custom();
          }),
        ),
        row(
          t('set.renderScale'),
          slider(
            0.5,
            1,
            0.05,
            g.renderScale,
            (v) => `${Math.round(v * 100)}%`,
            (v) => {
              g.renderScale = v;
              g.preset = 'CUSTOM';
            },
          ),
        ),
        row(
          t('set.fps'),
          seg(['30', '60', t('set.unlimited')], g.fpsLimit === 30 ? 0 : g.fpsLimit === 60 ? 1 : 2, (i) => {
            g.fpsLimit = ([30, 60, 0] as const)[i]!;
            custom();
          }),
        ),
        h('div', { class: 'note' }, t('set.restartNote')),
      );
    } else if (current === 'audio') {
      const v = settings.volumes;
      const pct = (x: number) => `${Math.round(x * 100)}%`;
      body.append(
        row(
          t('set.master'),
          slider(0, 1, 0.05, v.master, pct, (x) => ((v.master = x), hooks.apply(settings))),
        ),
        row(
          t('set.music'),
          slider(0, 1, 0.05, v.music, pct, (x) => ((v.music = x), hooks.apply(settings))),
        ),
        row(
          t('set.sfx'),
          slider(0, 1, 0.05, v.sfx, pct, (x) => ((v.sfx = x), hooks.apply(settings))),
        ),
        row(
          t('set.ambience'),
          slider(0, 1, 0.05, v.ambience, pct, (x) => ((v.ambience = x), hooks.apply(settings))),
        ),
      );
    } else if (current === 'controls') {
      body.append(
        row(
          t('set.sensitivity'),
          slider(
            0.2,
            3,
            0.05,
            settings.sensitivity,
            (x) => x.toFixed(2),
            (x) => (settings.sensitivity = x),
          ),
        ),
        row(
          t('set.invert'),
          toggle(settings.invertY, (x) => (settings.invertY = x)),
        ),
        row(
          t('set.fov'),
          slider(
            55,
            95,
            1,
            settings.fov,
            (x) => `${x}°`,
            (x) => ((settings.fov = x), hooks.apply(settings)),
          ),
        ),
        row(
          t('set.headbob'),
          toggle(settings.headBob, (x) => (settings.headBob = x)),
        ),
        row(
          t('set.sprintToggle'),
          toggle(settings.controls.sprintToggle, (x) => (settings.controls.sprintToggle = x)),
        ),
        row(
          t('set.leftHanded'),
          toggle(settings.controls.leftHanded, (x) => (settings.controls.leftHanded = x)),
        ),
        row(
          t('set.opacity'),
          slider(
            0.15,
            0.75,
            0.05,
            settings.controls.opacity,
            (x) => `${Math.round(x * 100)}%`,
            (x) => (settings.controls.opacity = x),
          ),
        ),
        row(
          t('set.customize'),
          button(
            t('set.customize').toUpperCase(),
            () => {
              s.close();
              hooks.customizeControls();
            },
            'small',
          ),
        ),
      );
    } else {
      body.append(
        row(
          t('set.brightness'),
          slider(
            0.6,
            1.8,
            0.05,
            settings.brightness,
            (x) => x.toFixed(2),
            (x) => ((settings.brightness = x), hooks.apply(settings)),
          ),
        ),
        row(
          t('set.subtitles'),
          toggle(settings.subtitles, (x) => (settings.subtitles = x)),
        ),
        row(
          t('set.vibration'),
          toggle(settings.vibration, (x) => (settings.vibration = x)),
        ),
        row(
          t('set.language'),
          seg(['English'], 0, () => {}),
        ),
      );
    }
  };
  render();
  s.el.append(
    h(
      'div',
      { class: 'panel' },
      h(
        'header',
        {},
        h('h2', {}, t('menu.settings')),
        tabs,
        button(
          t('menu.back'),
          () => {
            changed();
            s.close();
            hooks.close();
          },
          'small',
        ),
      ),
      body,
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// How to play
// ---------------------------------------------------------------------------------------------
export function howToPlay(onClose: () => void): void {
  const s = screen('overlay howto');
  const kv = (pairs: [string, string][]) => h('dl', {}, ...pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  s.el.append(
    h(
      'div',
      { class: 'panel' },
      h(
        'header',
        {},
        h('h2', {}, t('how.title')),
        button(
          t('menu.back'),
          () => {
            s.close();
            onClose();
          },
          'small',
        ),
      ),
      h(
        'div',
        { class: 'body' },
        h(
          'div',
          { class: 'grid' },
          h(
            'div',
            {},
            h('h3', {}, t('how.desktop')),
            kv([
              ['W A S D', 'Move'],
              ['Mouse', 'Look (click to capture the mouse)'],
              ['Shift', 'Sprint (uses stamina)'],
              ['C / Ctrl', 'Crouch (quieter)'],
              ['Space', 'Jump · hold breath while hiding'],
              ['E / Click', 'Interact · hide · leave hiding'],
              ['F / Right click', 'Flashlight'],
              ['Tab / I', 'Inventory & documents'],
              ['Q', 'Phone'],
              ['Esc / P', 'Pause'],
            ]),
          ),
          h(
            'div',
            {},
            h('h3', {}, t('how.mobile')),
            kv([
              ['Left side', 'Drag to move · push far forward to sprint'],
              ['Right side', 'Drag to look'],
              ['Hand', 'Interact / hide'],
              ['Torch', 'Flashlight'],
              ['Lungs', 'Hold breath (while hiding)'],
              ['Settings', 'Move and resize every button'],
            ]),
          ),
          h(
            'div',
            {},
            h('h3', {}, t('how.tips')),
            h(
              'ul',
              {},
              h('li', {}, 'She hears running, slammed doors and gasps. Walk or crouch near her.'),
              h('li', {}, 'Your flashlight lets you see — and lets her see you.'),
              h('li', {}, 'Break line of sight, then hide: cupboards, under beds, curtains, toilet stalls.'),
              h('li', {}, 'If she saw you hide, hold your breath when she comes close.'),
              h('li', {}, 'Your room (214) and the security room are safe. She won’t follow you in.'),
              h('li', {}, 'Read everything. Calendars, notes and blackboards hide the codes.'),
              h('li', {}, 'Write in your journal (214) to save. Checkpoints save automatically.'),
            ),
          ),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------------------------
export interface PauseHooks {
  resume: () => void;
  save: (() => void) | null;
  loadCheckpoint: () => void;
  settings: () => void;
  howto: () => void;
  mainMenu: () => void;
  objective: string;
}

export function pauseMenu(hk: PauseHooks): () => void {
  const s = screen('overlay pause');
  s.el.append(
    h(
      'div',
      { class: 'panel', style: 'width:min(460px,100%)' },
      h('header', {}, h('h2', {}, t('menu.paused'))),
      h(
        'nav',
        {},
        button(t('menu.resume'), hk.resume),
        hk.save ? button(t('menu.save'), hk.save) : null,
        button(t('menu.loadCheckpoint'), () => confirm(`${t('menu.loadCheckpoint')}?`, hk.loadCheckpoint)),
        button(t('menu.settings'), hk.settings),
        button(t('menu.howto'), hk.howto),
        button(t('menu.mainMenu'), () => confirm(`${t('menu.mainMenu')}?`, hk.mainMenu)),
      ),
      h('div', { class: 'objective-line' }, `${t('hud.objective')}: ${hk.objective}`),
    ),
  );
  return s.close;
}

// ---------------------------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------------------------
export function endingScreen(
  kind: 'good' | 'bad' | 'secret',
  stats: string,
  hooks: { retry: (() => void) | null; menu: () => void },
): void {
  const s = screen('ending grain');
  s.el.append(
    h('small', {}, t(`end.${kind}`)),
    h('h1', {}, t(`end.${kind}.title`)),
    h('div', { class: 'story' }, t(`end.${kind}.text`)),
    h('div', { class: 'stats' }, stats),
    h(
      'nav',
      {},
      hooks.retry
        ? button(
            t('menu.loadCheckpoint'),
            () => {
              s.close();
              hooks.retry!();
            },
            'small',
          )
        : null,
      button(
        t('menu.mainMenu'),
        () => {
          s.close();
          hooks.menu();
        },
        'small',
      ),
    ),
    kind !== 'bad' ? h('div', { class: 'credits' }, t('end.credits')) : '',
  );
}

export function fader(): { el: HTMLDivElement; to: (on: boolean) => Promise<void> } {
  const el = h('div', { class: 'fader' });
  uiRoot().append(el);
  return {
    el,
    to: (on: boolean) =>
      new Promise((res) => {
        el.classList.toggle('on', on);
        setTimeout(res, 1000);
      }),
  };
}

export function rotateHint(): void {
  const el = h(
    'div',
    { class: 'rotate-hint' },
    h('div', {
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="7" y="2" width="10" height="20" rx="2"/></svg>',
    }),
    h('div', {}, 'ROTATE YOUR DEVICE TO LANDSCAPE'),
  );
  const btn = button('PLAY ANYWAY', () => el.remove(), 'small');
  el.append(btn);
  uiRoot().append(el);
}
