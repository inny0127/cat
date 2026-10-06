// node tools/artifact.mjs outdir: the pixel cat (index.html) built to be shown as a claude.ai
// Artifact. The page there is one HTML fragment (the Artifact wraps it in its own document): the
// app's styles with the pixel font in them as a data URI, the loading picture as one too, and the
// whole bundle inlined as one module script (a frame that loads scripts from nowhere else), and
// in it the cat's model as a data: URL (an Artifact serves no .bin file). Built with
// VITE_ARTIFACT=1: no service worker, no asking for notifications or the motion sensors, which an
// Artifact's frame does not allow.
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'artifact-dist';
const tmp = path.join(out, '.build');
fs.rmSync(out, { recursive: true, force: true });
await build({
  configFile: false,
  base: './',
  logLevel: 'warn',
  publicDir: false,
  define: {
    'import.meta.env.VITE_ARTIFACT': JSON.stringify('1'),
    'import.meta.env.VITE_CAT_MODEL': JSON.stringify('data:application/octet-stream;base64,' + fs.readFileSync('public/cat3d/fri.bin').toString('base64')),
  },
  build: {
    outDir: tmp,
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    // (the font into the page's styles as a data URI)
    assetsInlineLimit: 200000,
    rollupOptions: { input: 'index.html', output: { inlineDynamicImports: true, entryFileNames: 'app.js' } },
  },
});
const js = fs.readFileSync(path.join(tmp, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
if (/url\(\.\/assets\//.test(style)) throw new Error('an asset in the styles was not inlined');
let body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const art = 'data:image/png;base64,' + fs.readFileSync('public/icons/art-64.png').toString('base64');
body = body.replace('./icons/art-64.png', art);
const page = `<title>창가의 고양이</title>
<style>${style}</style>
${body.trim()}
<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>
`;
fs.writeFileSync(path.join(out, 'index.html'), page);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('artifact page', (page.length / 1024).toFixed(0) + 'KB');
