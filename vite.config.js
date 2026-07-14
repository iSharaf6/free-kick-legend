import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built game runs from any folder/iframe on game portals
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    target: 'es2018',
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 1600
  }
});
