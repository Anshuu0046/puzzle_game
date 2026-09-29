import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Content Security Policy for production builds (the dev server needs inline scripts and a
 * websocket, so it is left alone). Blob URLs carry the synthesized audio; data URIs carry the
 * generated SVG art; Pixi runs without eval thanks to `pixi.js/unsafe-eval`.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' blob: data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'sugar-bloom-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      ),
  };
}

/**
 * Writes sw.js with every built file precached, so the game works offline after the first visit.
 * The cache name carries a hash of the file list: a new deploy gets a fresh cache and the old one
 * is dropped when the new worker activates.
 */
function serviceWorker(): Plugin {
  return {
    name: 'sugar-bloom-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['./', ...Object.keys(bundle).map((f) => `./${f}`)].filter((f) => !f.endsWith('.map'));
      const publicFiles = [
        './manifest.webmanifest',
        './icons/icon.svg',
        './icons/icon-192.png',
        './icons/icon-512.png',
        './icons/icon-maskable-512.png',
        './icons/apple-touch-icon.png',
      ];
      const precache = [...new Set([...files, ...publicFiles])].sort();
      let hash = 0;
      for (const ch of precache.join('|')) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
      const source = `// Generated at build time by vite.config.ts. Precaches the whole game for offline play.
const CACHE = 'sugar-bloom-${hash.toString(36)}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sugar-bloom-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Network first for the page so new deploys show up; cached page when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./', { ignoreVary: true })),
    );
    return;
  }
  // Hashed assets never change: cache first. ignoreVary: module scripts carry an Origin header that
  // the precache requests did not, and servers commonly answer with Vary: Origin.
  event.respondWith(caches.match(request, { ignoreVary: true }).then((hit) => hit ?? fetch(request)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative asset URLs so the build can be hosted from any path.
  base: './',
  plugins: [csp(), serviceWorker()],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  // Pre-bundle up front so the dev server never reloads mid-session to optimize a late import.
  optimizeDeps: { include: ['pixi.js', 'gsap', 'howler'] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
