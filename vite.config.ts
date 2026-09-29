import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173 },
  // Pre-bundle up front so the dev server never reloads mid-session to optimize a late import.
  optimizeDeps: { include: ['pixi.js', 'gsap', 'howler'] },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
