# Private publish: native prebuilds (Option A)

`@innovapptive/realm` ships native binaries **inside the npm package**.
Node installs must not download from MongoDB (`static.realm.io`).

## What gets packaged

| Target | Artifacts | Included via `files` |
|--------|-----------|----------------------|
| Node.js | `prebuilds/@innovapptive/realm-v*-napi-v6-*.tar.gz` | `prebuilds/@innovapptive/*.tar.gz` |
| React Native iOS | `prebuilds/apple/realm-core.xcframework` | `prebuilds/apple` |
| React Native Android | `prebuilds/android/<abi>/` | `prebuilds/android` |

On `npm install`, Node runs `scripts/install-node-prebuild.js`, which unpacks the matching local archive into `prebuilds/node/realm.node`.

> Note: because the npm package is scoped (`@innovapptive/realm`), the `prebuild` tool writes Node archives under `prebuilds/@innovapptive/`.

## Minimum platform matrix (recommended)

Build only what Innovapptive actually runs:

- **Node:** `darwin-arm64`, `linux-x64` (add others as needed)
- **Apple:** xcframework with device + simulator slices
- **Android:** `arm64-v8a`, `x86_64` (add `armeabi-v7a` if required)

## Commands before `npm publish`

From the repo root (submodules initialized, dependencies installed):

```bash
# TypeScript / bindings
npm run build:ts --workspace @innovapptive/realm
npm run bindgen:jsi --workspace @innovapptive/realm

# Node prebuilds (set PREBUILD_ARCH when cross-compiling; default is arm64)
PREBUILD_ARCH=arm64 npm run prebuild-node --workspace @innovapptive/realm
PREBUILD_ARCH=x64 npm run prebuild-node --workspace @innovapptive/realm   # e.g. on linux CI

# React Native prebuilds
npm run prebuild-apple --workspace @innovapptive/realm
npm run prebuild-android --workspace @innovapptive/realm
```

Known local build notes:

- Pass `--target 6` for N-API (handled by the `prebuild-node` script). Newer Node + `napi-build-utils` can fail auto-detection via string comparison.
- On newer Apple SDKs, realm-core may need `#include <cstdlib>` in `cli_args.cpp` (already fixed upstream in later core commits).

Then publish `@innovapptive/realm` (and `@innovapptive/realm-react`) to your private registry.

## Install behavior

- Local archives under `prebuilds/@innovapptive/` (or flat `prebuilds/`) are required for Node.
- Missing archives fail install with an explicit error (no silent MongoDB fallback).
- Analytics `postinstall` is disabled for this private fork.
