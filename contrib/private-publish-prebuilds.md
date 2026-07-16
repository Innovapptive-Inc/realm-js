# Private publish: native prebuilds (Option A)

`@innovapptive.com/realm` ships native binaries **inside the npm package**.
Node installs must not download from MongoDB (`static.realm.io`).

## What gets packaged

| Target | Artifacts | Included via `files` |
|--------|-----------|----------------------|
| Node.js | `prebuilds/@innovapptive.com/realm-v*-napi-v6-*.tar.gz` | `prebuilds/@innovapptive.com/*.tar.gz` |
| React Native iOS | `prebuilds/apple/realm-core.xcframework` | `prebuilds/apple` |
| React Native Android | `prebuilds/android/<abi>/` | `prebuilds/android` |

On `npm install`, Node runs `scripts/install-node-prebuild.js`, which unpacks the matching local archive into `prebuilds/node/realm.node`.

> Note: because the npm package is scoped (`@innovapptive.com/realm`), the `prebuild` tool writes Node archives under `prebuilds/@innovapptive.com/`.

## Minimum platform matrix (recommended)

Build only what Innovapptive actually runs:

- **Node:** `darwin-arm64`, `linux-x64` (add others as needed)
- **Apple:** xcframework with device + simulator slices
- **Android:** `arm64-v8a`, `x86_64` (add `armeabi-v7a` if required)

## Commands before `npm publish`

From the repo root (submodules initialized, dependencies installed):

```bash
# TypeScript / bindings
npm run build:ts --workspace @innovapptive.com/realm
npm run bindgen:jsi --workspace @innovapptive.com/realm

# Node prebuilds (set PREBUILD_ARCH when cross-compiling; default is arm64)
PREBUILD_ARCH=arm64 npm run prebuild-node --workspace @innovapptive.com/realm
PREBUILD_ARCH=x64 npm run prebuild-node --workspace @innovapptive.com/realm   # e.g. on linux CI

# React Native prebuilds
npm run prebuild-apple --workspace @innovapptive.com/realm
npm run prebuild-android --workspace @innovapptive.com/realm
```

Known local build notes:

- Pass `--target 6` for N-API (handled by the `prebuild-node` script). Newer Node + `napi-build-utils` can fail auto-detection via string comparison.

## realm-core patches

`realm-core` is a Git submodule pinned by the upstream `community` branch, so we
cannot carry small build fixes by editing its files directly (submodule working
tree changes are not tracked by the parent repo). Instead, patches live in:

```
packages/realm/patches/realm-core/*.patch
```

They are applied idempotently by `scripts/apply-core-patches.js`, which runs
automatically as a Wireit dependency of every native build
(`prebuild-node`, `prebuild-apple`, `prebuild-android`, `bindgen:configure`).
You can also run it manually:

```bash
npm run apply-core-patches --workspace @innovapptive.com/realm
```

Current patches:

- `0001-cli_args-include-cstdlib.patch` — adds `#include <cstdlib>` to
  `cli_args.cpp` (needed on newer Apple/toolchain SDKs; fixed upstream in later
  core commits).

When bumping the realm-core submodule, re-run a native build; if a patch no
longer applies cleanly the script fails loudly, and the patch should be dropped
(already upstream) or regenerated against the new commit.

Then publish `@innovapptive.com/realm` (and `@innovapptive.com/realm-react`) to your private registry.

## Install behavior

- Local archives under `prebuilds/@innovapptive.com/` (or flat `prebuilds/`) are required for Node.
- Missing archives fail install with an explicit error (no silent MongoDB fallback).
- Analytics `postinstall` is disabled for this private fork.
