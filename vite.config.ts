import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: 'index.html', pixel: 'pixel.html' } },
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
  },
  server: { host: true },
});
