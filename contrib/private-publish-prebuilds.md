# Private publish: native prebuilds (Option A)

`@innovapptive/realm` ships native binaries **inside the npm package**.
Node installs must not download from MongoDB (`static.realm.io`).

## What gets packaged

| Target | Artifacts | Included via `files` |
|--------|-----------|----------------------|
| Node.js | `prebuilds/realm-v*-napi-v6-*.tar.gz` | `prebuilds/realm-*.tar.gz` |
| React Native iOS | `prebuilds/apple/realm-core.xcframework` | `prebuilds/apple` |
| React Native Android | `prebuilds/android/<abi>/` | `prebuilds/android` |

On `npm install`, Node runs `scripts/install-node-prebuild.js`, which unpacks the matching local archive into `prebuilds/node/realm.node`.

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

# Node prebuilds (repeat per OS/arch in CI)
npm run prebuild-node --workspace @innovapptive/realm

# React Native prebuilds
npm run prebuild-apple --workspace @innovapptive/realm
npm run prebuild-android --workspace @innovapptive/realm
```

Then publish `@innovapptive/realm` (and `@innovapptive/realm-react`) to your private registry.

## Install behavior

- Local archives under `prebuilds/` are required for Node.
- Missing archives fail install with an explicit error (no silent MongoDB fallback).
- Analytics `postinstall` is disabled for this private fork.
