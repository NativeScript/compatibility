# compatibility.nativescript.org

**Live:** https://compatibility.nativescript.org · **JSON:** [`/v1/compatibility.json`](https://compatibility.nativescript.org/v1/compatibility.json) · **Schemas:** [`/v1/schemas/`](https://compatibility.nativescript.org/v1/schemas/package.json)

[![compat-check](https://github.com/NativeScript/compatibility/actions/workflows/compat-check.yml/badge.svg)](https://github.com/NativeScript/compatibility/actions/workflows/compat-check.yml)
[![deploy](https://github.com/NativeScript/compatibility/actions/workflows/deploy.yml/badge.svg)](https://github.com/NativeScript/compatibility/actions/workflows/deploy.yml)

Which toolchains work with which [NativeScript](https://nativescript.org) runtime
and CLI releases. A Cloudflare Worker computes the answer from published package
metadata, CI builds and maintainer advisories, serves it as JSON, and renders it
as a browser-support-style matrix for people. The NativeScript CLI's
[`ns doctor`](https://github.com/NativeScript/nativescript-cli) asks it about
the runtimes of a project and reports verified, failing and advised toolchains
next to each requirement.

Found a wrong cell, or a toolchain that breaks a release?
[Open an issue](https://github.com/NativeScript/compatibility/issues/new/choose).
Toolchain requirements for a runtime belong in its `package.json` (see below);
everything else lives in [`data/`](data).

## Layout

- `worker/` the Worker: the `/v1` API, an hourly cron that refreshes the
  document in KV, and the built app as static assets. The Cloudflare Vite
  plugin runs it next to the app in development and builds both together.
- `shared/` the document contract and the compute model, used by the Worker,
  the app and the tests.
- `web/` the Vue app.
- `schemas/` JSON Schemas served under `/v1/schemas/`.
- `data/overrides/` one file per maintainer entry, `<timestamp>_<slug>.json`:
  either a requirements override for releases that publish none, or an
  advisory. Entries apply in file-name order, so a later timestamp wins.
- `data/verified/<package>/` one file per CI build of a pinned combination,
  `<timestamp>_<version>_<pinned versions>[_failure].json`, whether it
  passed or failed.
- `data/toolchains.json` toolchain versions without a public feed (Android
  API levels, build-tools, JDK releases), fallbacks for the feeds, and which
  Node.js and JDK lines are LTS.
- `scripts/` the matrix builder, the result writer and their shared helpers;
  `test/` the compute-model and data tests.

## Verification pipeline

`compat-check` runs weekly and on demand:

1. **Matrix**: `scripts/build-matrix.mjs` pulls the newest releases from public
   feeds and forms every pinned combination of CLI version, Node.js major,
   runtime version and toolchain. The breadth is a handful of constants at the
   top of the script: two CLI releases, four releases of each runtime, two
   even Node.js majors, four Xcode lines, three Android API levels, and every
   JDK LTS release from 17 up. CLI and runtime versions come from npm, Node.js
   majors from nodejs.org, Xcode lines from xcodereleases.com (each sent to
   the GitHub-hosted runner image that ships it, discovered from the
   runner-images README, previews included), API levels and build-tools from
   the Android SDK repository and JDK releases from Adoptium. Combinations
   that already have a file under `data/verified/` are dropped, so after the
   first run a matrix only contains what a new release creates, and a
   combination verified once is never rebuilt. GitHub allows 256 jobs per
   matrix; anything beyond waits for the next run.
2. **Build jobs**: one job per combination installs the pinned CLI and
   Node.js, creates a fresh app, builds it with the pinned runtime and
   toolchain, and writes a result file whether it passed or failed, with the
   last error line as a signature. A failed build is retried once inside the
   job before it is recorded. A success is final. A failure is suspect until
   a later run fails the same combination again on another runner, which
   confirms it; a success in between clears it.
3. **Collect**: the result files are committed to the default branch and the
   Worker is deployed with them. Every file names the run that produced it,
   so the commit is the audit trail; nothing needs a manual merge.

Running the workflow by hand with its inputs filled in verifies one specific
combination instead of the feed-driven set; `force` rebuilds a combination
that is already recorded. `scripts/report-verification.mjs` writes the same
result file for a verification done outside CI.

## How a cell gets its state

A failed build pins several toolchains at once and cannot say which one is to
blame, so a failure only implicates toolchain versions that no successful
build of the same release used; when one of those versions is already the
sole suspect of another failure, it explains the failure and the rest stay
unjudged.

For a release and a toolchain version, in this order:

1. **Unsupported / Advisory**: a maintainer advisory matches the release and
   the toolchain version.
2. **Verified**: a recorded CI build succeeded with that toolchain version.
   Any success outranks failures. A failure only marks the cell unsupported
   once a second, independent run has confirmed it; a single failure shows as
   unverified with a pending second attempt. A confirmed failure on a newer
   release also marks older releases without a result of their own as
   unsupported for that toolchain version.
3. **Declared**: inside the range the package published under
   `nativescript.requirements`, or inside a maintainer override for releases
   that predate the block.
4. **Unverified**: nothing is known, or the toolchain is newer than the
   declared range. Xcode, Node.js and CocoaPods releases come from public
   feeds, so a fresh release shows up as unverified the day it ships.
5. **Unsupported**: below the declared minimum.

Each cell leads with the newest stable version of the toolchain that the
release is known to work with; when the newest one fails, it moves to a second
line with its verdict, and a newer beta gets its own line. Clicking a cell
expands the per-version timeline with the declared range, every older
version, and LTS and beta markers.

The "By toolchain" view flips the axes: rows are toolchain versions and a cell
names the run of consecutive releases that support one, `9.0.3+` while the
newest release still does or `8.2.0 – 8.5.3` once a newer release dropped it,
with the release CI first verified on a second line when proof starts later
than the declaration. Clicking a cell shows the same timeline over releases.

## Endpoints

- `/` the app.
- `/v1/compatibility.json` the full document (`$schema` points at its schema).
- `/v1/packages/<name>/<version>?xcode=26.2&jdk=21` one release: its
  effective requirements, the toolchain versions verified, failed, suspect or
  inferred for it, and the advisories matching the given toolchain versions.
- `/v1/schemas/{compatibility,requirements,package,overrides,verified}.json`.
- `/health`.

## Declaring requirements in a runtime

```json
{
  "$schema": "https://compatibility.nativescript.org/v1/schemas/package.json",
  "name": "@nativescript/android",
  "nativescript": {
    "requirements": { "compileSdk": ">=35", "buildTools": ">=35.0.0", "jdk": ">=17 <25" }
  }
}
```

Keys are `compileSdk`, `buildTools`, `jdk`, `xcode`, `cocoapods` and `node`;
every value is a semver range. The CLI's Node.js support is read from its
ordinary `engines.node` field. The `package.json` schema extends the standard
one from SchemaStore, so editors validate and complete the `nativescript`
block. npm ignores the `$schema` key.

## Local development

```bash
npm install
npm run dev         # app and Worker together on http://localhost:8787
npm run build       # client and Worker into dist/, with a generated wrangler.json
npm test && npm run check
```

Every push to `main` that touches deployable files is deployed by the `deploy`
workflow, and `compat-check` deploys the results it records. From a machine
that is logged in to Cloudflare, `npm run deploy` does the same by hand.
