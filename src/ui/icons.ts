import { pieceSvg, prismSvg } from '../render/pieceArt';

/** Data-URI image of a piece, for goal chips and decorations. */
export function pieceImage(color: number | null): string {
  const markup = color === null ? prismSvg() : pieceSvg(color);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

export const STAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4a8"/><stop offset="0.5" stop-color="#ffd43b"/><stop offset="1" stop-color="#f0a500"/></linearGradient></defs><polygon points="50,6 63,36 95,38 70,59 78,92 50,74 22,92 30,59 5,38 37,36" fill="url(#g)" stroke="#d98a00" stroke-width="4" stroke-linejoin="round"/><ellipse cx="42" cy="36" rx="12" ry="7" fill="#fff" opacity="0.7" transform="rotate(-20 42 36)"/></svg>`;

export const STAR_EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,6 63,36 95,38 70,59 78,92 50,74 22,92 30,59 5,38 37,36" fill="#f3dbe7" stroke="#e2bfd1" stroke-width="4" stroke-linejoin="round"/></svg>`;

export const JELLY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="j" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc2dd"/><stop offset="1" stop-color="#ff6fa8"/></linearGradient></defs><rect x="12" y="18" width="76" height="68" rx="22" fill="url(#j)" stroke="#e8468a" stroke-width="4"/><ellipse cx="38" cy="36" rx="16" ry="8" fill="#fff" opacity="0.75"/><path d="M22 70 Q50 84 78 70" stroke="#fff" stroke-width="4" fill="none" opacity="0.5" stroke-linecap="round"/></svg>`;

export const SCORE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#8a63ff"/><circle cx="50" cy="50" r="30" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="6 7"/><polygon points="50,28 56,44 73,45 60,55 64,72 50,63 36,72 40,55 27,45 44,44" fill="#fff"/></svg>`;

export const LOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="24" y="44" width="52" height="40" rx="10" fill="#b9a3bd"/><path d="M34 46 V34 a16 16 0 0 1 32 0 V46" fill="none" stroke="#b9a3bd" stroke-width="9" stroke-linecap="round"/><circle cx="50" cy="62" r="6" fill="#fff"/></svg>`;

export const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/></svg>`;

export const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.3 4.6-.1-1.1 2-1.6-2-3.4-2.4.9a8 8 0 0 0-1.9-1.1L15.5 4h-4l-.4 2.8a8 8 0 0 0-1.9 1.1l-2.4-.9-2 3.4 2 1.6a8 8 0 0 0 0 2.2l-2 1.6 2 3.4 2.4-.9c.6.5 1.2.8 1.9 1.1l.4 2.6h4l.4-2.6c.7-.3 1.3-.6 1.9-1.1l2.4.9 2-3.4-2-1.6.1-1.1Z"/></svg>`;

export const BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#34d399"/><path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
