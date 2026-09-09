# compatibility.nativescript.org (prototype)

A Cloudflare Worker that computes which toolchains work with which NativeScript
runtime and CLI releases, serves the result as JSON for tools, and renders it
as a browser-support-style matrix (Vue + Vite) for people.

## Layout

- `worker/` the Worker: `/v1` API, hourly cron that rebuilds the document into
  KV, static assets for the built app.
- `shared/` the document contract and the compute model, used by the Worker,
  the app and the tests.
- `web/` the Vue app.
- `schemas/` JSON Schemas served under `/v1/schemas/`.
- `data/` maintainer inputs: `overrides.json` (requirements for older
  releases, advisories), `verified.json` (CI results), `toolchains.json`
  (toolchain versions without a public feed, and feed fallbacks).
- `scripts/report-verification.mjs` and `.github/workflows/compat-check.yml`
  the CI matrix sketch that records verified cells.

## How a cell gets its state

For a release and a toolchain version, in this order:

1. **Unsupported / Advisory**: a maintainer advisory matches the release and
   the toolchain version.
2. **Verified**: a recorded CI build succeeded with that toolchain version.
3. **Declared**: inside the range the package published under
   `nativescript.requirements`, or inside a maintainer override for releases
   that predate the block.
4. **Unverified**: nothing is known, or the toolchain is newer than the
   declared range. Xcode, Node.js and CocoaPods releases come from public
   feeds, so a fresh release shows up as unverified the day it ships.
5. **Unsupported**: below the declared minimum.

The matrix shows the declared range per cell; clicking a cell expands a
per-version timeline; hovering shows a summary with advisories.

## Endpoints

- `/` the app.
- `/v1/compatibility.json` the full document (`$schema` points at its schema).
- `/v1/packages/<name>/<version>?xcode=26.2&jdk=21` effective requirements
  for one release plus the advisories matching the given toolchain.
- `/v1/schemas/{compatibility,requirements,package,overrides,verified}.json`.

## Declaring requirements in a runtime

```json
{
  "$schema": "https://compatibility.nativescript.org/v1/schemas/package.json",
  "name": "@nativescript/ios",
  "nativescript": {
    "requirements": { "xcode": ">=16 <27", "cocoapods": ">=1.12" }
  }
}
```

The `package.json` schema extends the standard one from SchemaStore, so
editors validate and complete the `nativescript` block. npm ignores the
`$schema` key.

## Local development

```bash
npm install
npm run dev:api     # Worker on :8787 (API, cron via /__scheduled)
npm run dev         # Vite dev server with /v1 proxied to the Worker
npm run build       # builds the app into dist/web
npm run preview     # build, then wrangler dev serving app + API together
npm test && npm run check
```
