import { button, h, screen } from './dom';
import { t } from '../core/i18n';
import { ITEMS, EVIDENCE_IDS } from '../data/items';
import { getDoc, type DocDef } from '../data/documents';
import { BREAKERS, type BreakerId, type BreakerResult, type BreakerState } from '../systems/puzzles';

// ---------------------------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------------------------
export function inventoryScreen(
  items: string[],
  batteries: number,
  documents: string[],
  onRead: (doc: string) => void,
  onClose: () => void,
): () => void {
  const s = screen('overlay inventory');
  let tab: 'items' | 'documents' = 'items';
  let selected: string | null = items[0] ?? null;
  const body = h('div', { class: 'body' });
  const tabs = h('div', { class: 'tabs' });
  const ev = items.filter((i) => EVIDENCE_IDS.includes(i)).length;
  const close = () => {
    s.close();
    onClose();
  };
  const render = () => {
    tabs.replaceChildren(
      ...(['items', 'documents'] as const).map((n) => {
        const b = h('button', { class: n === tab ? 'on' : '' }, t(`inv.${n}`));
        b.onclick = () => {
          tab = n;
          selected = n === 'items' ? (items[0] ?? null) : (documents[0] ?? null);
          render();
        };
        return b;
      }),
    );
    const slots = h('div', { class: 'slots' });
    const detail = h('div', { class: 'detail' });
    if (tab === 'items') {
      const list = [...items];
      if (batteries > 0) list.push('battery');
      for (const id of list) {
        const def = ITEMS[id];
        if (!def) continue;
        const el = h('div', { class: `slot ${def.evidence ? 'ev' : ''} ${selected === id ? 'sel' : ''}`, html: def.icon, title: def.name });
        if (id === 'battery') el.append(h('span', { class: 'count' }, `×${batteries}`));
        el.onclick = () => {
          selected = id;
          render();
        };
        slots.append(el);
      }
      for (let i = list.length; i < 12; i++) slots.append(h('div', { class: 'slot empty' }));
      const def = selected ? ITEMS[selected] : null;
      if (def) {
        detail.append(
          h('div', { class: 'big-icon', html: def.icon }),
          h('div', { class: 'cat' }, def.evidence ? t('inv.evidence') : def.category.toUpperCase()),
          h('h3', {}, def.name),
          h('p', {}, def.desc),
        );
        if (def.doc) detail.append(button(t('inv.read'), () => onRead(def.doc!), 'small'));
      } else detail.append(h('p', {}, t('inv.empty')));
    } else {
      for (const id of documents) {
        const d = getDoc(id);
        if (!d) continue;
        const el = h('div', {
          class: `slot ${selected === id ? 'sel' : ''}`,
          html: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 8h24l10 10v38H16z"/><path d="M40 8v10h10M22 28h20M22 34h20M22 40h14"/></svg>',
          title: d.title,
        });
        el.onclick = () => {
          selected = id;
          render();
        };
        slots.append(el);
      }
      if (!documents.length) slots.append(h('p', { class: 'note' }, t('inv.empty')));
      const d = selected ? getDoc(selected) : null;
      if (d)
        detail.append(
          h('div', { class: 'cat' }, t('inv.documents')),
          h('h3', {}, d.title),
          button(t('inv.read'), () => onRead(d.id), 'small'),
        );
    }
    body.replaceChildren(h('div', { class: 'inv-layout' }, slots, detail));
  };
  render();
  s.el.append(
    h(
      'div',
      { class: 'panel' },
      h(
        'header',
        {},
        h('h2', {}, t('inv.title')),
        tabs,
        h('span', { class: 'ev-count' }, t('inv.evidenceCount', { n: ev })),
        button(t('inv.close'), close, 'small'),
      ),
      body,
    ),
  );
  s.el.addEventListener('pointerdown', (e) => {
    if (e.target === s.el) close();
  });
  return close;
}

// ---------------------------------------------------------------------------------------------
// Document reader
// ---------------------------------------------------------------------------------------------
export function documentScreen(docOrId: string | DocDef, onClose: () => void, onPage?: () => void): () => void {
  const doc = typeof docOrId === 'string' ? getDoc(docOrId) : docOrId;
  const s = screen('docview');
  if (!doc) {
    s.close();
    onClose();
    return () => {};
  }
  let page = 0;
  const paper = h('div', { class: `paper ${doc.style}` });
  const nav = h('div', { class: 'doc-nav' });
  const close = () => {
    s.close();
    onClose();
  };
  const render = () => {
    paper.innerHTML = doc.pages[page]!;
    paper.scrollTop = 0;
    nav.replaceChildren(
      doc.pages.length > 1 ? button('‹', () => ((page = Math.max(0, page - 1)), render(), onPage?.()), 'small') : '',
      doc.pages.length > 1 ? h('span', {}, `${page + 1} / ${doc.pages.length}`) : '',
      doc.pages.length > 1 ? button('›', () => ((page = Math.min(doc.pages.length - 1, page + 1)), render(), onPage?.()), 'small') : '',
      button(t('inv.close'), close, 'small'),
    );
  };
  render();
  s.el.append(h('div', { class: 'doc-nav' }, doc.title.toUpperCase()), paper, nav);
  return close;
}

// ---------------------------------------------------------------------------------------------
// Breaker panel
// ---------------------------------------------------------------------------------------------
export function breakerScreen(state: BreakerState, flip: (id: BreakerId) => BreakerResult, onClose: () => void): () => void {
  const s = screen('puzzle');
  const panel = h('div', { class: 'breaker-panel' });
  const status = h('div', { class: 'breaker-status' });
  const close = () => {
    s.close();
    onClose();
  };
  const render = () => {
    panel.replaceChildren(
      ...BREAKERS.map((id) => {
        const b = h(
          'div',
          { class: `breaker ${id === 'MAIN' ? 'main' : ''} ${state.on[id] ? 'on' : ''}` },
          h('div', { class: 'lamp' }),
          h('div', { class: 'slot-b' }, h('div', { class: 'lever' })),
          h('span', {}, id === 'MAIN' ? 'MAIN' : id === 'PUMP' ? 'PUMP' : id),
        );
        b.onclick = () => {
          const r = flip(id);
          status.className = 'breaker-status';
          if (r === 'trip') {
            status.textContent = t('pz.tripped');
            status.classList.add('bad');
          } else if (r === 'solved') {
            status.textContent = t('pz.power');
            status.classList.add('good');
            setTimeout(close, 1400);
          } else status.textContent = '';
          render();
        };
        return b;
      }),
    );
  };
  render();
  s.el.append(
    h('h2', {}, t('pz.breakers')),
    h('div', { class: 'hint' }, t('pz.breakersHint')),
    panel,
    h('div', { class: 'hint' }, '1 — G.F.   ·   2 — F.F.   ·   3 — S.F.   ·   PUMP — TANK MOTOR'),
    status,
    button(t('pz.close'), close, 'small'),
  );
  return close;
}

// ---------------------------------------------------------------------------------------------
// Combination lock (digits or symbols)
// ---------------------------------------------------------------------------------------------
export function codeLockScreen(
  title: string,
  symbols: string[],
  length: number,
  onTry: (code: string) => boolean,
  onClose: () => void,
  onTick?: () => void,
): () => void {
  const s = screen('puzzle');
  const values = new Array(length).fill(0) as number[];
  const dials = h('div', { class: 'dials' });
  const close = () => {
    s.close();
    onClose();
  };
  const render = () => {
    dials.replaceChildren(
      ...values.map((v, i) => {
        const up = h('button', {}, '▲');
        const down = h('button', {}, '▼');
        up.onclick = () => {
          values[i] = (v + 1) % symbols.length;
          onTick?.();
          render();
        };
        down.onclick = () => {
          values[i] = (v - 1 + symbols.length) % symbols.length;
          onTick?.();
          render();
        };
        return h('div', { class: 'dial' }, up, h('div', { class: 'digit' }, symbols[v]!), down);
      }),
    );
  };
  render();
  const tryBtn = button(
    t('pz.enter'),
    () => {
      const code = values.map((v) => symbols[v]).join('');
      if (onTry(code)) setTimeout(close, 700);
      else {
        dials.classList.remove('shake');
        void dials.offsetWidth;
        dials.classList.add('shake');
      }
    },
    'small',
  );
  s.el.append(h('h2', {}, title), dials, h('div', { style: 'display:flex;gap:16px' }, tryBtn, button(t('pz.close'), close, 'small')));
  return close;
}

// ---------------------------------------------------------------------------------------------
// Lift panel
// ---------------------------------------------------------------------------------------------
export function liftPanelScreen(showThird: boolean, pick: (floor: 'G' | '1' | '2' | '3') => void, onClose: () => void): () => void {
  const s = screen('puzzle');
  const close = () => {
    s.close();
    onClose();
  };
  const panel = h('div', { class: 'lift-panel' });
  for (const f of ['3', '2', '1', 'G'] as const) {
    if (f === '3' && !showThird) continue;
    const b = h('button', { class: f === '3' ? 'three' : '' }, f);
    b.onclick = () => {
      close();
      pick(f);
    };
    panel.append(b);
  }
  s.el.append(h('h2', {}, t('pz.liftTitle')), panel, button(t('pz.close'), close, 'small'));
  return close;
}
