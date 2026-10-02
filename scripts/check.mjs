import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

async function filesIn(directory) {
  const entries = await readdir(path.join(root, directory), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const name = path.join(directory, entry.name);
    if (name === path.join("docs", "archive")) continue;
    if (entry.isDirectory()) files.push(...(await filesIn(name)));
    else files.push(name);
  }
  return files;
}

async function checkLink(file, link) {
  if (
    !link ||
    link.startsWith("#") ||
    /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link)
  )
    return;
  const pathname = decodeURIComponent(link.split(/[?#]/)[0]);
  const target = path.resolve(path.dirname(path.join(root, file)), pathname);
  try {
    await stat(target);
  } catch {
    failures.push(`${file}: missing local target ${link}`);
  }
}

const files = [
  "README.md",
  ...(await filesIn("docs")),
  ...(await filesIn("public")),
  ...(await filesIn("functions")),
  ...(await filesIn("server")),
  ...(await filesIn("scripts")),
];

for (const file of files) {
  if (/\.(?:js|mjs)$/.test(file)) {
    const result = spawnSync(
      process.execPath,
      ["--check", path.join(root, file)],
      { encoding: "utf8" },
    );
    if (result.status !== 0)
      failures.push(`${file}: ${result.stderr || result.error?.message}`);
    const source = await readFile(path.join(root, file), "utf8");
    for (const match of source.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g))
      await checkLink(file, match[1]);
  }
  if (/\.(?:md|html)$/.test(file)) {
    const source = await readFile(path.join(root, file), "utf8");
    for (const match of source.matchAll(
      /\b(?:href|src|srcset)=["']([^"']+)["']/g,
    ))
      await checkLink(file, match[1]);
    if (file.endsWith(".md")) {
      for (const match of source.matchAll(/\]\(([^\s)]+)(?:\s+[^)]*)?\)/g))
        await checkLink(file, match[1]);
    }
  }
}

const routes = JSON.parse(
  await readFile(path.join(root, "public/_routes.json"), "utf8"),
);
if (
  routes.version !== 1 ||
  JSON.stringify(routes.include) !== '["/api/interest"]' ||
  routes.exclude.length !== 0
) {
  failures.push("public/_routes.json: expected only the interest API route");
}
const wrangler = await readFile(
  path.join(root, "wrangler.example.toml"),
  "utf8",
);
if (!/^pages_build_output_dir\s*=\s*"\.\/public"$/m.test(wrangler))
  failures.push("Pages output must remain ./public");
for (const template of ["rendering-report.yml", "feature-request.yml"]) {
  await checkLink("README.md", `.github/ISSUE_TEMPLATE/${template}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("JavaScript syntax, local links and Pages configuration passed.");
}
