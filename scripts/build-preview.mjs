import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
let html = await readFile(path.join(publicDir, "index.html"), "utf8");
const css = await readFile(path.join(publicDir, "styles.css"), "utf8");
const js = await readFile(path.join(publicDir, "app.js"), "utf8");
function replaceRequired(pattern, replacement) {
  if (!pattern.test(html))
    throw new Error(`Missing preview source: ${pattern}`);
  html = html.replace(pattern, replacement);
}
replaceRequired(
  /<link\b[^>]*href="styles\.css"[^>]*>/,
  () => `<style>${css}</style>`,
);
replaceRequired(/<script\b[^>]*src="config\.js"[^>]*>\s*<\/script>/, "");
replaceRequired(/<script\b[^>]*src="app\.js"[^>]*>\s*<\/script>/, "");
for (const file of ["logo.png", "favicon.png"]) {
  const data = await readFile(path.join(publicDir, "assets", file));
  html = html.replaceAll(
    `assets/${file}`,
    `data:image/png;base64,${data.toString("base64")}`,
  );
}
const config =
  'window.Z2PL_CONFIG = Object.freeze({ previewMode: true, apiEndpoint: "/api/interest", turnstileSiteKey: "" });';
html = html.replace(
  "</body>",
  () => `<script>${config}</script>\n<script>${js}</script>\n</body>`,
);
const outputDir = path.join(root, "artifacts");
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "preview.html"), html);
console.log(
  "Created artifacts/preview.html (self-contained; forms deliberately in preview mode).",
);
