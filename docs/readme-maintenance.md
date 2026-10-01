# README maintenance

This package is for the `bot-nosense/z2pl.com` product showcase, not the rendering engine repository. It does not create a separate website or enable GitHub Pages.

## Design

The light palette follows the Z2PL website: white, `#F5F5F7`, `#1D1D1F`, `#6E6E73` and blue `#0071E3`. The original horse logo silhouette is retained; only its fill changes with the theme. The composition uses generous spacing and restrained typography, informed by Apple's product pages, without using Apple logos, artwork or font files.

Every README image is a local, self-contained SVG. Headline glyphs are outlined to keep the composition consistent without external fonts. PNG previews are provided outside the repository package for review; the README uses the sharper SVG assets. No JavaScript, external CSS, remote badges or image-generation endpoints are needed by the README.

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

Upload `README.md`, `assets/`, `examples/`, and `.github/` to the repository root. `docs/` is optional maintenance material. Keep directory names and letter case unchanged. Both issue forms must be included because the README links to their exact filenames.

The package does not change repository settings and does not publish itself. Check the rendered README and the issue chooser after your commit.
