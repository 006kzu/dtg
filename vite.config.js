import { defineConfig } from 'vite';

export default defineConfig({
  // relative paths so the built game works from any host/subfolder (itch.io, GitHub Pages, Vercel…)
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
});
