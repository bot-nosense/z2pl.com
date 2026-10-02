# README maintenance

The `bot-nosense/z2pl.com` repository hosts two surfaces: the GitHub product README and the Cloudflare Pages landing page at `waitlist.z2pl.com`. The rendering engine is maintained elsewhere. GitHub Pages is not used. See [the repository guide](development.md) for the directory layout.

## Design

The light palette follows the Z2PL website: white, `#F5F5F7`, `#1D1D1F`, `#6E6E73` and blue `#0071E3`. The original horse logo silhouette is retained; only its fill changes with the theme. The composition uses generous spacing and restrained typography, informed by Apple's product pages, without using Apple logos, artwork or font files.

Every README image is a local, self-contained SVG. Headline glyphs are outlined to keep the composition consistent without external fonts. Local PNG captures belong under the ignored `artifacts/screenshots/` directory; the README uses the sharper SVG assets. No JavaScript, external CSS, remote badges or image-generation endpoints are needed by the README.

The `<picture>` element selects light and dark variants, plus a stacked mobile composition at viewport widths up to 640 pixels. GitHub supports `<picture>` in Markdown. Theme selection follows the color scheme exposed to the browser; third-party Markdown viewers can fall back to the light image. Verify the result in the GitHub Preview tab after uploading.

## Content boundaries

The approved line is preserved exactly: “One HTTP request converts labels to PDF, SVG or PNG.”

No latency guarantees, performance benchmarks, uptime promises, fixed pricing, exact command counts or open-source licensing claims are included. The engine source is not part of this package. Do not add an MIT badge unless the owner explicitly licenses the applicable material that way.

The label artwork is an illustration with synthetic data, not a captured renderer output. Its Code 128 bars encode `Z2PL000001`, but the artwork is not a barcode-scanning or printer-parity test. The shipping-style ZPL is a corresponding example, not a pixel-identical golden file. The `hello-world.zpl` sample is different from the decorative header label.

## Links and sources checked on 2026-10-01

- Product positioning and site navigation: https://z2pl.com/
- Visual structure reference: https://www.apple.com/ and https://www.apple.com/mac/
- Documentation sections are taken from the current website source: `quickstart`, `authentication`, `formats`, `errors`, and `zpl`.
- GitHub Markdown reference: https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax

The homepage was accessible during preparation. Live requests to the playground and documentation subpages were blocked by the browsing environment. Their paths and anchors were checked against the website's current source, not through a completed live API session. No API endpoint, credentials or production curl example were invented.

## Publishing

Keep `README.md`, `assets/readme/`, `examples/`, and `.github/ISSUE_TEMPLATE/` together in this repository. Both issue forms are linked by exact filename from the README. Product artwork stays under `assets/`; deployed landing assets stay under `public/assets/`. Relative README asset paths must continue to work on GitHub.

The package does not change repository settings and does not publish itself. Check the rendered README and the issue chooser after your commit.
