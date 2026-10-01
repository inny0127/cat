// Builds a single-page version of the app for publishing as a claude.ai Artifact preview:
// one HTML fragment with the bundle inlined, plus the painting assets beside it.
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'artifact';
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
    rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: 'app.js' } },
  },
});
const js = fs.readFileSync(path.join(tmp, 'app.js'), 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = html.match(/<body>([\s\S]*?)<script/)[1];
const page = `<title>창가의 고양이</title>
<meta name="theme-color" content="#fffbfa">
<style>${style}</style>
${body.trim()}
<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>
`;
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), page);
for (const f of fs.readdirSync('public/assets')) fs.copyFileSync(path.join('public/assets', f), path.join(out, 'assets', f));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('artifact page', (page.length / 1024).toFixed(0) + 'KB', fs.readdirSync(path.join(out, 'assets')));
