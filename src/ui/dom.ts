type Attrs = Record<string, string | number | boolean | undefined | EventListener>;
type Child = Node | string | null | undefined | false;

/**
 * Tiny element builder. Strings become text nodes (never parsed as HTML); `on*` attributes become
 * event listeners; boolean attributes are set when true.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = String(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

let svgCounter = 0;

/**
 * Parses a trusted, code-generated SVG string (never user or level data) into an element.
 * Internal ids (gradients, clips) get a unique suffix: shared ids across inline SVGs resolve to the
 * first copy in the document, which renders nothing if that copy sits inside a hidden element.
 */
export function svg(markup: string, className?: string): SVGSVGElement {
  const suffix = `-s${++svgCounter}`;
  const unique = markup.replace(/id="([^"]+)"/g, `id="$1${suffix}"`).replace(/url\(#([^)]+)\)/g, `url(#$1${suffix})`);
  const doc = new DOMParser().parseFromString(unique, 'image/svg+xml');
  const el = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  if (className) el.setAttribute('class', className);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}
