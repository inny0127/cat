// Builds the smooth cat (smooth.html) as one page for publishing as a claude.ai Artifact: an HTML
// fragment with the bundle and the cat model inlined (an Artifact serves no binary files, so the
// model rides in the page as base64; main.ts reads it from window.__CAT_MODEL__).
//   node tools/smooth/artifact.mjs [outDir=artifact-smooth]
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'artifact-smooth';
const tmp = path.join(out, '.build');
fs.rmSync(out, { recursive: true, force: true });
await build({
  configFile: false,
  base: './',
  logLevel: 'warn',
  publicDir: false,
  build: {
    outDir: tmp,
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    rollupOptions: { input: 'smooth.html', output: { inlineDynamicImports: true, entryFileNames: 'app.js' } },
  },
});
const js = fs.readFileSync(path.join(tmp, 'app.js'), 'utf8');
const html = fs.readFileSync('smooth.html', 'utf8');
const title = html.match(/<title>([\s\S]*?)<\/title>/)[1];
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = html.match(/<body>([\s\S]*?)<script/)[1];
const page = `<title>${title}</title>
<meta name="theme-color" content="#f3efe9">
<style>${style}</style>
${body.trim()}
<script>window.__CAT_MODEL__ = "${fs.readFileSync('public/cat3d/fri.bin').toString('base64')}";</script>
<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>
`;
fs.writeFileSync(path.join(out, 'index.html'), page);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('artifact page', (page.length / 1024).toFixed(0) + 'KB');
