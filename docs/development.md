# Repository guide

This repository owns both the **GitHub product README** and the **Cloudflare Pages landing page** at [waitlist.z2pl.com](https://waitlist.z2pl.com/). The rendering engine and main Z2PL application are maintained in a different repository.

## Directory layout

| Path                        | Purpose                                                  |
| --------------------------- | -------------------------------------------------------- |
| `README.md`                 | Product showcase rendered by GitHub                      |
| `assets/readme/`            | Local SVG artwork used by the README                     |
| `assets/brand/`             | Original brand source artwork                            |
| `examples/`                 | Synthetic ZPL samples linked by the README               |
| `.github/ISSUE_TEMPLATE/`   | Rendering reports and feature requests                   |
| `public/`                   | Static landing page and deployed assets                  |
| `functions/api/interest.js` | Cloudflare Pages route for the forms                     |
| `server/`                   | Validation, storage and owner email notifications        |
| `migrations/`               | D1 database schema                                       |
| `scripts/`                  | Preview generation, source checks and private CSV export |
| `tests/`                    | Local-only API/browser checks; ignored by Git            |
| `docs/`                     | Current development, deployment and README guidance      |
| `docs/archive/`             | Local-only historical handoff/QA records; ignored by Git |
| `artifacts/`                | Generated local previews/screenshots; ignored by Git     |
| `private/`                  | Private database exports; ignored by Git                 |

Cloudflare's output directory remains **`public`**. Run commands from the repository root so Cloudflare can discover `functions/` and bundle its imports from `server/`. README artwork is not copied into the landing page. Changes to one surface should be checked against the other when they share product claims or links.

## Local development

Use Node.js 22 or newer. The landing page has no runtime framework or build step. Prettier is a development-only formatter.

```sh
npm ci
npm run preview
```

Open `http://localhost:8080`. This static server cannot execute Pages Functions. For a self-contained, non-collecting design preview:

```sh
npm run preview:build
```

Open `artifacts/preview.html`. It is regenerated from `public/` and always uses preview mode. Do not edit or publish it as the production source.

## Checks

```sh
npm run format
npm run check
```

`check` validates formatting, JavaScript syntax, local documentation/asset links, and the Pages output/route configuration. It works in a fresh checkout without the ignored local tests or archives.

If you have the local-only `tests/` directory, run API tests directly. Browser checks additionally require Python Playwright and Chromium:

```sh
node --test tests/*.test.mjs
npm run preview:build
python3 tests/browser_test.py
```

These tests mock Cloudflare, D1, mail delivery and live responses. Browser checks render generated HTML in memory. The local files are retained on disk but are not published to GitHub. Check the GitHub-rendered README and the actual landing page separately before reporting visual or live-service verification.

## Editing each surface

Keep product copy and theme variants in the README consistent with [README maintenance](readme-maintenance.md). Keep local asset paths intact and use synthetic label examples in public issue reports.

Edit the landing page in `public/`. Its format switcher changes an illustrative label, not an actual conversion result. Preserve the DOM IDs consumed by `public/app.js`, separate consent for updates, anonymous feedback, and the saved-response contract.

Server code belongs in `server/`; `functions/` contains only route adapters. Deployment configuration, form activation and Gmail destination verification are covered in [deployment](deployment.md).
