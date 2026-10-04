import { defineConfig, type ResolvedConfig } from 'vite';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

// the furred 3D cat (public/cat3d/cat.bin, 11 MB) is only for the lab (lab.html, dev server): no
// page that is built loads it, and the app (the web build, and the iOS and Android ones made from
// it) is better off without it
const leaveOutTheLabCat = () => {
  let out = '';
  return {
    name: 'leave-out-the-lab-cat',
    apply: 'build' as const,
    configResolved(c: ResolvedConfig) {
      out = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      rmSync(resolve(out, 'cat3d', 'cat.bin'), { force: true });
    },
  };
};

export default defineConfig({
  base: './',
  plugins: [leaveOutTheLabCat()],
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: 'index.html', painted: 'painted.html' } },
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
  },
  server: { host: true },
});
