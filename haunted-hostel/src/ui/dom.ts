/** Tiny DOM helpers for the HTML overlay UI. */
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function uiRoot(): HTMLElement {
  return document.getElementById('ui')!;
}

let clickSound: (() => void) | null = null;
export function setClickSound(fn: () => void): void {
  clickSound = fn;
}

/** A menu button with the house style. */
export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  return h(
    'button',
    {
      class: `hh-btn ${cls}`,
      onclick: (e: Event) => {
        e.stopPropagation();
        clickSound?.();
        onClick();
      },
    },
    h('span', {}, label),
  );
}

/** Screen container that fades in; returns the element and a close function. */
export function screen(cls: string): { el: HTMLDivElement; close: () => void } {
  const el = h('div', { class: `hh-screen ${cls}` });
  uiRoot().append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  return {
    el,
    close: () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 350);
    },
  };
}
