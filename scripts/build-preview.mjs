import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
let html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
const css = await readFile(path.join(publicDir, 'styles.css'), 'utf8');
const js = await readFile(path.join(publicDir, 'app.js'), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`)
  .replace('  <script src="config.js" defer></script>\n', '')
  .replace('  <script src="app.js" defer></script>\n', '');
for (const file of ['logo.png', 'favicon.png']) {
  const data = await readFile(path.join(publicDir, 'assets', file));
  html = html.replaceAll(`assets/${file}`, `data:image/png;base64,${data.toString('base64')}`);
}
const config = 'window.Z2PL_CONFIG = Object.freeze({ previewMode: true, apiEndpoint: "/api/interest", turnstileSiteKey: "" });';
html = html.replace('</body>', () => `<script>${config}</script>\n<script>${js}</script>\n</body>`);
await writeFile(path.join(root, 'OPEN-PREVIEW.html'), html);
console.log('Created OPEN-PREVIEW.html (self-contained; forms deliberately in preview mode).');
