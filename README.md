# compatibility.nativescript.org

**Live:** https://compatibility.nativescript.org · **JSON:** [`/v1/compatibility.json`](https://compatibility.nativescript.org/v1/compatibility.json) · **Schemas:** [`/v1/schemas/`](https://compatibility.nativescript.org/v1/schemas/package.json)

[![compat-check](https://github.com/NativeScript/compatibility/actions/workflows/compat-check.yml/badge.svg)](https://github.com/NativeScript/compatibility/actions/workflows/compat-check.yml)
[![deploy](https://github.com/NativeScript/compatibility/actions/workflows/deploy.yml/badge.svg)](https://github.com/NativeScript/compatibility/actions/workflows/deploy.yml)

Which toolchains work with which [NativeScript](https://nativescript.org) runtime
and CLI releases. A Cloudflare Worker computes the answer from published package
metadata, CI builds and maintainer advisories, serves it as JSON for tools such
as [`ns doctor`](https://github.com/NativeScript/nativescript-cli), and renders
it as a browser-support-style matrix for people.

Found a wrong cell? [Open an issue](https://github.com/NativeScript/compatibility/issues/new/choose).
Toolchain requirements for a runtime belong in its `package.json` (see below);
everything else lives in [`data/`](data).

## Layout

- `worker/` the Worker: `/v1` API, hourly cron that rebuilds the document into
  KV, static assets for the built app. The Cloudflare Vite plugin runs it next
  to the app in development and builds both together.
- `shared/` the document contract and the compute model, used by the Worker,
  the app and the tests.
- `web/` the Vue app.
- `schemas/` JSON Schemas served under `/v1/schemas/`.
- `data/overrides/` one file per maintainer entry, `<timestamp>_<slug>.json`:
  either a requirements override for releases that publish none, or an
  advisory. Entries apply in file-name order, so a later timestamp wins.
- `data/verified/<package>/` one file per CI-proven pinned build,
  `<timestamp>_<version>_<pinned versions>.json`.
- `data/toolchains.json` toolchain versions without a public feed, and feed
  fallbacks.
- `scripts/` and `.github/workflows/compat-check.yml`: the verification
  pipeline (see below).

## Verification pipeline

`compat-check` runs weekly and on demand:

1. **Matrix**: `scripts/build-matrix.mjs` pulls the newest CLI and runtime
   releases from npm, Node.js majors from nodejs.org, Xcode lines from
   xcodereleases.com (each sent to the GitHub-hosted runner image that ships
   it, discovered from the runner-images README, including Xcode preview
   images), Android API levels from the SDK repository and JDK LTS releases
   from Adoptium, forms every pinned combination, and drops the ones that
   already have a file under `data/verified/`. The first run is large (GitHub
   allows 256 jobs per matrix; the rest wait for the next run); afterwards a
   run only contains what a new CLI, runtime, Node.js, Xcode or SDK release
   creates. A combination verified once is never rebuilt.
2. **Build jobs**: one job per combination installs the pinned CLI and
   Node.js, creates a fresh app, builds it with the pinned runtime and
   toolchain, and writes its result file under `data/verified/` whether it
   passed or failed, with the last error line as a signature. A success is
   final. A failure is suspect until a later run fails the same combination
   again on another runner, which confirms it; a success in between clears it.
3. **Collect**: the artifacts are dropped onto the checkout and committed to
   the default branch. Every file names the run that produced it, so the
   commit is the audit trail; nothing needs a manual merge.

Running the workflow by hand with its inputs filled in verifies one specific
combination instead of the feed-driven set; `force` rebuilds a combination
that is already recorded. `scripts/report-verification.mjs` writes the same
result file for a verification done outside CI.

## How a cell gets its state

For a release and a toolchain version, in this order:

1. **Unsupported / Advisory**: a maintainer advisory matches the release and
   the toolchain version.
2. **Verified**: a recorded CI build succeeded with that toolchain version.
   Any success outranks failures. A failure only marks the cell unsupported
   once a second, independent run has failed the same combination; a single
   failure shows as unverified with a pending second attempt. A confirmed
   failure on a newer release also marks older releases without a result of
   their own as unsupported for that toolchain version.
3. **Declared**: inside the range the package published under
   `nativescript.requirements`, or inside a maintainer override for releases
   that predate the block.
4. **Unverified**: nothing is known, or the toolchain is newer than the
   declared range. Xcode, Node.js and CocoaPods releases come from public
   feeds, so a fresh release shows up as unverified the day it ships.
5. **Unsupported**: below the declared minimum.

Each cell shows how the release fares with the newest stable version of
that toolchain, plus a newer beta when one exists; clicking a cell expands
the per-version timeline with the declared range and every older version.

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
npm run dev         # app and Worker together on http://localhost:8787
npm run build       # client and Worker into dist/, with a generated wrangler.json
npm run deploy      # build, then wrangler deploy
npm test && npm run check
```

## Deploying

One-time setup:

1. `npx wrangler login`, then `npx wrangler kv namespace create COMPAT_KV` and
   paste the printed id into `wrangler.jsonc`.
2. Add two repository secrets: `CLOUDFLARE_API_TOKEN` (an API token created
   from the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`.
3. For the custom domain, uncomment the `routes` entry in `wrangler.jsonc`
   once the `nativescript.org` zone lives on that account.

After that, the `deploy` workflow deploys every push to `main` that touches
deployable files, and `compat-check` deploys the results it records. From a
machine that is logged in, `npm run deploy` does the same by hand. The hourly
cron trigger is part of the deployment.
