import * as THREE from 'three';
import { Rng } from '../core/rng';

/**
 * Canvas-drawn decals: room number plates, notices, posters, newspaper clippings, photographs,
 * calendars and graffiti. Text drawn here is part of the environment (signage in the world), so it
 * stays English like real Indian college signage; UI strings live in the i18n tables.
 */

export const FONT_TYPE = '"Special Elite", "Courier New", monospace';
export const FONT_HAND = '"Caveat", "Comic Sans MS", cursive';
export const FONT_SERIF = '"Cormorant Garamond", Georgia, serif';
export const FONT_SANS = 'Inter, Arial, sans-serif';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Paper grain, stains and folds to age any canvas. */
export function agePaper(g: CanvasRenderingContext2D, w: number, h: number, rng: Rng, amount = 1): void {
  for (let i = 0; i < 1800 * amount; i++) {
    g.fillStyle = `rgba(${rng.int(60, 120)},${rng.int(50, 90)},${rng.int(20, 50)},${rng.range(0.02, 0.07) * amount})`;
    g.fillRect(rng.next() * w, rng.next() * h, rng.range(1, 3), rng.range(1, 3));
  }
  for (let i = 0; i < 4 * amount; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const r = rng.range(w * 0.05, w * 0.22);
    const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    gr.addColorStop(0, 'rgba(120,90,40,0)');
    gr.addColorStop(0.85, `rgba(120,85,35,${0.12 * amount})`);
    gr.addColorStop(1, 'rgba(120,85,35,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  const edge = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, `rgba(70,45,15,${0.35 * amount})`);
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  // Fold lines.
  g.strokeStyle = `rgba(0,0,0,${0.08 * amount})`;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, h / 2 + rng.range(-4, 4));
  g.lineTo(w, h / 2 + rng.range(-4, 4));
  g.stroke();
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): number {
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width > maxW && line) {
        g.fillText(line, x, y);
        y += lh;
        line = w;
      } else line = test;
    }
    g.fillText(line, x, y);
    y += lh;
  }
  return y;
}

/** Painted room number plate (black enamel plate with white numerals). */
export function roomPlate(label: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#16181a';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#8a8478';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 240, 112);
  g.fillStyle = '#e8e2d0';
  g.font = `bold 78px ${FONT_SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 128, 68);
  agePaper(g, 256, 128, new Rng(label.length * 31 + label.charCodeAt(0)), 0.6);
  return tex(c);
}

/** Large painted sign (building name, gate arch). */
export function paintedSign(lines: string[], w: number, h: number, bg: string, fg: string, font = FONT_SERIF): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lh = h / (lines.length + 0.6);
  lines.forEach((l, i) => {
    const size = i === 0 ? lh * 0.7 : lh * 0.42;
    g.font = `700 ${size}px ${font}`;
    g.fillText(l, w / 2, lh * (i + 0.8));
  });
  const rng = new Rng(w + h);
  // Rust run-off and flaking.
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(80,40,15,${rng.range(0.05, 0.25)})`;
    const x = rng.next() * w;
    g.fillRect(x, rng.next() * h * 0.3, rng.range(2, 6), rng.range(h * 0.2, h * 0.9));
  }
  agePaper(g, w, h, rng, 0.8);
  return tex(c);
}

export interface NoticeSpec {
  title: string;
  body: string;
  footer?: string;
  stamp?: string;
  hand?: string;
  seed: number;
  paper?: string;
}

/** Typed office notice on yellowed paper — the staple of every Indian hostel notice board. */
export function notice(spec: NoticeSpec, w = 512, h = 680): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  const rng = new Rng(spec.seed);
  g.fillStyle = spec.paper ?? '#e6dcc0';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1e1a14';
  g.textAlign = 'center';
  g.font = `bold 22px ${FONT_TYPE}`;
  g.fillText('VIDYANAGAR INSTITUTE OF TECHNOLOGY', w / 2, 52);
  g.font = `16px ${FONT_TYPE}`;
  g.fillText('Office of the Chief Warden — Kaveri Hostel', w / 2, 78);
  g.fillRect(40, 92, w - 80, 2);
  g.font = `bold 30px ${FONT_TYPE}`;
  g.fillText(spec.title, w / 2, 140);
  g.textAlign = 'left';
  g.font = `19px ${FONT_TYPE}`;
  const y = wrap(g, spec.body, 44, 190, w - 88, 28);
  if (spec.footer) {
    g.font = `17px ${FONT_TYPE}`;
    g.textAlign = 'right';
    g.fillText(spec.footer, w - 44, Math.max(y + 30, h - 70));
  }
  if (spec.stamp) {
    g.save();
    g.translate(w * 0.3, h - 110);
    g.rotate(-0.25);
    g.strokeStyle = 'rgba(40,50,140,0.7)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, 0, 54, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(40,50,140,0.7)';
    g.font = `bold 15px ${FONT_SANS}`;
    g.textAlign = 'center';
    g.fillText(spec.stamp, 0, 6);
    g.restore();
  }
  if (spec.hand) {
    g.save();
    g.translate(60, h - 40);
    g.rotate(-0.05);
    g.fillStyle = 'rgba(150,20,15,0.85)';
    g.font = `34px ${FONT_HAND}`;
    g.textAlign = 'left';
    g.fillText(spec.hand, 0, 0);
    g.restore();
  }
  agePaper(g, w, h, rng, 1);
  // Pin holes / tape.
  g.fillStyle = 'rgba(200,190,150,0.6)';
  g.fillRect(w / 2 - 40, -6, 80, 26);
  return tex(c);
}

/** Old newspaper clipping with a headline, a halftone photo block and justified columns. */
export function newspaper(headline: string, sub: string, body: string, seed: number): THREE.CanvasTexture {
  const w = 512;
  const h = 640;
  const [c, g] = canvas(w, h);
  const rng = new Rng(seed);
  g.fillStyle = '#d9d0b6';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#141210';
  g.font = `bold 15px ${FONT_SERIF}`;
  g.fillText('THE DECCAN EVENING POST · CITY', 24, 30);
  g.fillRect(24, 38, w - 48, 2);
  g.font = `700 40px ${FONT_SERIF}`;
  let y = wrap(g, headline, 24, 82, w - 48, 40);
  g.font = `italic 19px ${FONT_SERIF}`;
  y = wrap(g, sub, 24, y + 4, w - 48, 22);
  // Halftone photograph block.
  const py = y + 6;
  g.fillStyle = '#7a7466';
  g.fillRect(24, py, 210, 150);
  for (let yy = 0; yy < 150; yy += 4) {
    for (let xx = 0; xx < 210; xx += 4) {
      const dx = xx - 105;
      const dy = yy - 70;
      const shade = 0.5 + 0.5 * Math.sin(xx * 0.04) * Math.cos(yy * 0.05) - (dx * dx + dy * dy < 1800 ? 0.4 : 0);
      g.fillStyle = `rgba(20,18,15,${Math.max(0, 0.75 - shade * 0.6)})`;
      g.beginPath();
      g.arc(24 + xx + 2, py + yy + 2, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = '#141210';
  g.font = `15px ${FONT_SERIF}`;
  wrap(g, body, 246, py + 12, w - 270, 18);
  wrap(g, body.split('. ').reverse().join('. '), 24, py + 172, w - 48, 18);
  agePaper(g, w, h, rng, 1.2);
  return tex(c);
}

/** A printed wall calendar frozen on one month with a circled date. */
export function calendar(month: string, year: number, startDay: number, days: number, circled: number, seed: number): THREE.CanvasTexture {
  const w = 384;
  const h = 512;
  const [c, g] = canvas(w, h);
  const rng = new Rng(seed);
  g.fillStyle = '#e9e3d2';
  g.fillRect(0, 0, w, h);
  // Devotional print at the top, like the free calendars from the local sweet shop.
  const grd = g.createLinearGradient(0, 0, 0, 220);
  grd.addColorStop(0, '#c4692a');
  grd.addColorStop(1, '#6d1f14');
  g.fillStyle = grd;
  g.fillRect(16, 16, w - 32, 200);
  g.fillStyle = 'rgba(255,220,150,0.8)';
  g.beginPath();
  g.arc(w / 2, 110, 60, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3d1209';
  g.beginPath();
  g.ellipse(w / 2, 130, 26, 52, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#efe6cf';
  g.font = `bold 15px ${FONT_SANS}`;
  g.textAlign = 'center';
  g.fillText('SRI LAKSHMI SWEETS & BAKERY', w / 2, 204);
  g.fillStyle = '#1c1a17';
  g.font = `bold 30px ${FONT_SANS}`;
  g.fillText(`${month} ${year}`, w / 2, 256);
  const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  g.font = `bold 15px ${FONT_SANS}`;
  names.forEach((n, i) => {
    g.fillStyle = i === 0 ? '#9a1b14' : '#1c1a17';
    g.fillText(n, 40 + i * 50, 290);
  });
  g.font = `20px ${FONT_SANS}`;
  for (let d = 1; d <= days; d++) {
    const idx = startDay + d - 1;
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    const x = 40 + col * 50;
    const y = 325 + row * 36;
    g.fillStyle = col === 0 ? '#9a1b14' : '#1c1a17';
    g.fillText(String(d), x, y);
    if (d === circled) {
      g.strokeStyle = 'rgba(160,10,10,0.9)';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(x, y - 7, 20, 16, 0.2, 0, Math.PI * 2);
      g.stroke();
    } else if (d > circled) {
      // Every date after it is crossed out in the same pen.
      g.strokeStyle = 'rgba(30,30,30,0.15)';
      g.lineWidth = 1;
    }
  }
  agePaper(g, w, h, rng, 1);
  return tex(c);
}

/** Group photograph with one face scratched out — drawn as silhouettes in faded colour. */
export function groupPhoto(seed: number, scratchIndex: number, people = 6, faded = true): THREE.CanvasTexture {
  const w = 512;
  const h = 360;
  const [c, g] = canvas(w, h);
  const rng = new Rng(seed);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#8a8f86');
  bg.addColorStop(0.55, '#a39a83');
  bg.addColorStop(1, '#5f574a');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // The hostel facade behind them.
  g.fillStyle = 'rgba(200,180,130,0.6)';
  g.fillRect(0, 40, w, 150);
  g.fillStyle = 'rgba(40,40,40,0.5)';
  for (let i = 0; i < 6; i++) g.fillRect(20 + i * 85, 70, 40, 50);
  for (let i = 0; i < people; i++) {
    const cx = 60 + i * ((w - 120) / (people - 1)) + rng.range(-8, 8);
    const top = 150 + rng.range(-10, 10);
    const cloth = rng.pick(['#5d3a5a', '#2f4f6f', '#7a3b2e', '#d8cfb8', '#3b5a3a', '#6d6a2e']);
    g.fillStyle = cloth;
    g.beginPath();
    g.moveTo(cx - 34, h);
    g.quadraticCurveTo(cx - 36, top + 60, cx, top + 55);
    g.quadraticCurveTo(cx + 36, top + 60, cx + 34, h);
    g.fill();
    g.fillStyle = '#8a5f45';
    g.beginPath();
    g.ellipse(cx, top + 28, 17, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#16120f';
    g.beginPath();
    g.ellipse(cx, top + 16, 19, 14, 0, Math.PI, Math.PI * 2);
    g.fill();
    if (i === scratchIndex) {
      // Long hair falling over shoulders.
      g.fillRect(cx - 19, top + 16, 6, 70);
      g.fillRect(cx + 13, top + 16, 6, 70);
      // Violent scratches over the face.
      g.strokeStyle = 'rgba(235,230,215,0.95)';
      g.lineWidth = 2;
      for (let k = 0; k < 26; k++) {
        g.beginPath();
        g.moveTo(cx + rng.range(-24, 24), top + rng.range(-4, 10));
        g.lineTo(cx + rng.range(-24, 24), top + rng.range(40, 60));
        g.stroke();
      }
    }
  }
  if (faded) {
    g.fillStyle = 'rgba(190,150,90,0.22)';
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = `16px ${FONT_HAND}`;
  g.fillText('ECE batch — Kaveri Hostel, Aug 2016', 16, h - 14);
  agePaper(g, w, h, rng, 0.7);
  // White border.
  g.strokeStyle = '#e8e2d2';
  g.lineWidth = 14;
  g.strokeRect(0, 0, w, h);
  return tex(c);
}

/** Film poster / motivational poster / band poster style wall art. */
export function poster(kind: number, seed: number): THREE.CanvasTexture {
  const w = 384;
  const h = 540;
  const [c, g] = canvas(w, h);
  const rng = new Rng(seed);
  const palettes = [
    ['#141b2e', '#e0b13a', '#d8d2c0'],
    ['#4a1414', '#f0d6a0', '#e8e0cc'],
    ['#0f2a24', '#8fd0b0', '#e8e0cc'],
    ['#262626', '#ff6a3d', '#eeeeee'],
    ['#e4dccb', '#1d1d1d', '#9a1b14'],
  ];
  const [bg, fg, tx] = palettes[kind % palettes.length]!;
  g.fillStyle = bg!;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg!;
  const titles = [
    'GATE 2017 — CRACK IT!',
    'ROCK NIGHT · AARAMBH FEST',
    'KEEP CALM & CODE ON',
    'CIRCUIT THEORY · UNIT 3',
    'NO RAGGING — IT IS A CRIME',
  ];
  if (kind % 5 === 0) {
    for (let i = 0; i < 6; i++) g.fillRect(30, 80 + i * 60, w - 60 - i * 30, 30);
  } else if (kind % 5 === 1) {
    g.beginPath();
    g.arc(w / 2, 230, 120, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = bg!;
    g.fillRect(w / 2 - 10, 150, 20, 220);
  } else if (kind % 5 === 2) {
    g.font = `bold 160px ${FONT_SANS}`;
    g.textAlign = 'center';
    g.fillText('{ }', w / 2, 290);
  } else if (kind % 5 === 3) {
    g.strokeStyle = fg!;
    g.lineWidth = 4;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.moveTo(40, 100 + i * 36);
      g.lineTo(100 + rng.next() * 240, 100 + i * 36);
      g.lineTo(100 + rng.next() * 240, 120 + i * 36);
      g.stroke();
    }
  } else {
    g.fillStyle = '#9a1b14';
    g.beginPath();
    g.arc(w / 2, 240, 110, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = bg!;
    g.beginPath();
    g.arc(w / 2, 240, 90, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#9a1b14';
    g.lineWidth = 20;
    g.beginPath();
    g.moveTo(w / 2 - 64, 176);
    g.lineTo(w / 2 + 64, 304);
    g.stroke();
  }
  g.fillStyle = tx!;
  g.font = `bold 34px ${FONT_SANS}`;
  g.textAlign = 'center';
  wrap(g, titles[kind % titles.length]!, w / 2, 440, w - 40, 38);
  agePaper(g, w, h, rng, 1.1);
  // Torn corner.
  g.fillStyle = 'rgba(0,0,0,0)';
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(w, 0);
  g.lineTo(w - rng.range(30, 70), 0);
  g.lineTo(w, rng.range(30, 80));
  g.fill();
  g.globalCompositeOperation = 'source-over';
  return tex(c);
}

/** Wall writing: scratches, handprints, words written in something dark. */
export function graffiti(text: string, seed: number, color = 'rgba(70,8,6,0.92)', w = 512, h = 256, scratches = 0): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  const rng = new Rng(seed);
  g.clearRect(0, 0, w, h);
  if (text) {
    g.fillStyle = color;
    g.font = `${h * 0.42}px ${FONT_HAND}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
    // Drips.
    for (let i = 0; i < 18; i++) {
      const x = w * 0.15 + rng.next() * w * 0.7;
      const y = h * 0.55 + rng.range(-10, 10);
      g.fillRect(x, y, rng.range(1.5, 3.5), rng.range(10, h * 0.4));
    }
  }
  g.strokeStyle = 'rgba(230,225,210,0.55)';
  for (let i = 0; i < scratches; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h * 0.5;
    g.lineWidth = rng.range(0.8, 2.2);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) g.lineTo(x + k * rng.range(4, 8), y + k * rng.range(20, 40));
    g.stroke();
  }
  const t = tex(c);
  return t;
}

/** Handprint smear. */
export function handprint(seed: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const rng = new Rng(seed);
  g.fillStyle = 'rgba(60,8,6,0.85)';
  g.beginPath();
  g.ellipse(128, 160, 52, 60, 0, 0, Math.PI * 2);
  g.fill();
  const fingers = [
    [-45, -30, 12, 50],
    [-18, -75, 12, 60],
    [10, -82, 12, 64],
    [36, -70, 11, 56],
    [66, 0, 12, 40],
  ];
  for (const [dx, dy, rx, ry] of fingers) {
    g.beginPath();
    g.ellipse(128 + dx!, 140 + dy!, rx!, ry!, dx! * 0.006, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 30; i++) g.fillRect(90 + rng.next() * 80, 200 + rng.next() * 20, 3, rng.range(10, 50));
  return tex(c);
}

/** Chalkboard with lecture scribbles and (optionally) the cipher table the diary refers to. */
export function blackboard(withCipher: boolean): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const [c, g] = canvas(w, h);
  const rng = new Rng(77);
  g.fillStyle = '#1d2a22';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(255,255,255,${rng.range(0.01, 0.04)})`;
    g.fillRect(rng.next() * w, rng.next() * h, rng.range(2, 30), rng.range(1, 3));
  }
  g.fillStyle = 'rgba(235,235,225,0.85)';
  g.font = `38px ${FONT_HAND}`;
  g.fillText('V = IR    P = VI    τ = RC', 40, 70);
  g.fillText('Op-Amp: Vo = -(Rf/Rin)·Vin', 40, 120);
  g.fillText('GATE study group — Tue/Thu 10 PM', 40, 170);
  if (withCipher) {
    g.fillText('Our code (A.R.):', 520, 70);
    const sym = ['☾', '✶', '△', '○', '◇', '✕'];
    const val = ['2', '7', '0', '9', '4', '1'];
    sym.forEach((s, i) => {
      g.font = `46px ${FONT_SANS}`;
      g.fillText(s, 540 + (i % 3) * 150, 150 + Math.floor(i / 3) * 80);
      g.font = `42px ${FONT_HAND}`;
      g.fillText(`= ${val[i]}`, 590 + (i % 3) * 150, 150 + Math.floor(i / 3) * 80);
    });
  }
  g.font = `30px ${FONT_HAND}`;
  g.fillText('Do NOT erase — 3rd yr ECE', 40, h - 40);
  return tex(c);
}

/** Generic small label (switchboards, breaker panel, cupboard tags). */
export function label(text: string, w = 256, h = 64, bg = '#e8e2cf', fg = '#1a1a1a', font = FONT_SANS, size = 30): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `bold ${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  agePaper(g, w, h, new Rng(text.length * 13), 0.5);
  return tex(c);
}

/** Lift floor indicator / CCTV-style seven segment readout texture, redrawn on demand. */
export class DynamicLabel {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  constructor(
    w: number,
    h: number,
    private readonly fg = '#ff5a2a',
    private readonly bg = '#120604',
  ) {
    [this.canvas, this.g] = canvas(w, h);
    this.texture = tex(this.canvas);
  }
  set(text: string): void {
    const { g, canvas: c } = this;
    g.fillStyle = this.bg;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = this.fg;
    g.shadowColor = this.fg;
    g.shadowBlur = 12;
    g.font = `bold ${c.height * 0.7}px ${FONT_SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 2);
    g.shadowBlur = 0;
    this.texture.needsUpdate = true;
  }
}

/** Simple decal plane material for canvas textures. */
export function decalMaterial(
  t: THREE.Texture,
  opts: { transparent?: boolean; rough?: number; emissive?: boolean } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: t,
    transparent: opts.transparent ?? false,
    alphaTest: opts.transparent ? 0.02 : 0,
    roughness: opts.rough ?? 0.9,
    metalness: 0,
    depthWrite: !opts.transparent,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    emissive: opts.emissive ? 0xffffff : 0x000000,
    emissiveMap: opts.emissive ? t : null,
    emissiveIntensity: opts.emissive ? 0.6 : 0,
  });
}

export function decal(t: THREE.Texture, w: number, h: number, opts?: Parameters<typeof decalMaterial>[1]): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMaterial(t, opts));
  m.userData.dynamic = true;
  m.receiveShadow = true;
  return m;
}
