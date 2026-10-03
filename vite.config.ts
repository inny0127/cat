import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: 'index.html', painted: 'painted.html', smooth: 'smooth.html' } },
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
  },
  server: { host: true },
});
