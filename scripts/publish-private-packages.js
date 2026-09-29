////////////////////////////////////////////////////////////////////////////
//
// Copyright 2026 Innovapptive Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
////////////////////////////////////////////////////////////////////////////

/* eslint-env node */

"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const realmRoot = path.join(root, "packages", "realm");
const realmReactRoot = path.join(root, "packages", "realm-react");
const dryRun = process.argv.includes("--dry-run");
const noBump = process.argv.includes("--no-bump");
const keepVersionChanges = process.argv.includes("--keep-version-changes");

const VERSION_RESTORE_PATHS = [
  "packages/realm/package.json",
  "packages/realm-react/package.json",
  "package-lock.json",
];

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
  return result;
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return result;
}

function readPackageJson(packageRoot) {
  return JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
}

function writePackageVersion(packageRoot, version) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = readPackageJson(packageRoot);
  packageJson.version = version;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function readPackageVersion(packageRoot) {
  return readPackageJson(packageRoot).version;
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported semver version: ${version}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) {
      return left[i] - right[i];
    }
  }
  return 0;
}

function bumpPatch(version) {
  const [major, minor, patch] = parseSemver(version);
  return `${major}.${minor}.${patch + 1}`;
}

function getPublishedVersion(packageName) {
  const result = runCapture("npm", [
    "view",
    packageName,
    "version",
    "--registry",
    "https://registry.npmjs.org/",
  ]);
  if (result.status !== 0) {
    return null;
  }
  const version = (result.stdout || "").trim();
  return version || null;
}

function resolvePublishVersion(packageName, localVersion) {
  const publishedVersion = getPublishedVersion(packageName);
  if (!publishedVersion) {
    console.log(`  ${packageName}: no published version found, bumping local ${localVersion}`);
    return bumpPatch(localVersion);
  }

  const baseVersion = compareSemver(publishedVersion, localVersion) >= 0 ? publishedVersion : localVersion;
  const nextVersion = bumpPatch(baseVersion);
  console.log(
    `  ${packageName}: local ${localVersion}, npm ${publishedVersion} -> publish ${nextVersion}`,
  );
  return nextVersion;
}

function assertFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Required publish artifact is missing: ${relativePath}`);
  }
}

function assertDirectory(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.statSync(absolutePath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Required publish artifact is missing: ${relativePath}`);
  }
}

function assertPackageIdentity(packageRoot, expectedName) {
  const packageJson = readPackageJson(packageRoot);
  if (packageJson.name !== expectedName) {
    throw new Error(`Expected package name '${expectedName}', found '${packageJson.name}'`);
  }
  if (packageJson.publishConfig?.registry !== "https://registry.npmjs.org/") {
    throw new Error(`${expectedName} must publish to https://registry.npmjs.org/`);
  }
  if (packageJson.publishConfig?.access !== "restricted") {
    throw new Error(`${expectedName} must publish with restricted access`);
  }
  return packageJson.version;
}

function syncNodePrebuildArchiveNames(version) {
  const scopedPrebuilds = path.join(realmRoot, "prebuilds", "@innovapptive.com");
  if (!fs.existsSync(scopedPrebuilds)) {
    return;
  }

  for (const name of fs.readdirSync(scopedPrebuilds)) {
    if (!/^realm-v.+?-napi-v6-.+\.tar\.gz$/.test(name)) {
      continue;
    }

    const updatedName = name.replace(/^realm-v[^-]+-/, `realm-v${version}-`);
    if (updatedName === name) {
      continue;
    }

    const fromPath = path.join(scopedPrebuilds, name);
    const toPath = path.join(scopedPrebuilds, updatedName);
    console.log(`Renaming Node prebuild archive: ${name} -> ${updatedName}`);
    fs.renameSync(fromPath, toPath);
  }
}

function assertNodePrebuild(version) {
  const scopedPrebuilds = path.join(realmRoot, "prebuilds", "@innovapptive.com");
  const archives = fs.existsSync(scopedPrebuilds)
    ? fs.readdirSync(scopedPrebuilds).filter((name) => new RegExp(`^realm-v${version}-napi-v6-.+\\.tar\\.gz$`).test(name))
    : [];
  if (archives.length === 0) {
    throw new Error(
      `No packaged N-API 6 Node prebuild found for @innovapptive.com/realm@${version} under packages/realm/prebuilds/@innovapptive.com/`,
    );
  }
}

function restoreVersionFiles(originalRealmVersion) {
  if (keepVersionChanges) {
    console.log("\nKeeping version file changes (--keep-version-changes).");
    return;
  }

  console.log("\nRestoring temporary version bumps from the working tree...");
  run("git", ["restore", "--", ...VERSION_RESTORE_PATHS]);

  // Prebuilds are gitignored; put archive names back to the committed package version.
  if (originalRealmVersion) {
    syncNodePrebuildArchiveNames(originalRealmVersion);
  }
}

const originalRealmVersion = readPackageVersion(realmRoot);
const originalRealmReactVersion = readPackageVersion(realmReactRoot);
let publishSucceeded = false;

try {
  console.log(`Preparing Innovapptive Realm packages${dryRun ? " (dry run)" : ""}...`);

  if (!noBump) {
    console.log("\nResolving next patch versions from npm + local package.json...");
    const nextRealmVersion = resolvePublishVersion("@innovapptive.com/realm", originalRealmVersion);
    const nextRealmReactVersion = resolvePublishVersion(
      "@innovapptive.com/realm-react",
      originalRealmReactVersion,
    );

    writePackageVersion(realmRoot, nextRealmVersion);
    syncNodePrebuildArchiveNames(nextRealmVersion);
    writePackageVersion(realmReactRoot, nextRealmReactVersion);

    // Keep workspace lock metadata aligned with the temporary package.json versions.
    run("npm", ["install", "--package-lock-only", "--ignore-scripts"]);
  } else {
    console.log("\nSkipping version bump (--no-bump).");
  }

  run("npm", ["run", "build:ts", "--workspace", "@innovapptive.com/realm"]);
  run("npm", ["run", "bindgen:jsi", "--workspace", "@innovapptive.com/realm"]);
  run("npm", ["run", "bundle", "--workspace", "@innovapptive.com/realm-react"]);

  const realmVersion = assertPackageIdentity(realmRoot, "@innovapptive.com/realm");
  const realmReactVersion = assertPackageIdentity(realmReactRoot, "@innovapptive.com/realm-react");

  assertFile("packages/realm/binding/jsi/jsi_init.cpp");
  assertFile("packages/realm/prebuilds/apple/realm-core.xcframework/Info.plist");
  assertDirectory("packages/realm/prebuilds/android/arm64-v8a");
  assertDirectory("packages/realm/prebuilds/android/x86_64");
  assertNodePrebuild(realmVersion);
  assertFile("packages/realm-react/dist/index.js");
  assertFile("packages/realm-react/dist/index.cjs");
  assertFile("packages/realm-react/dist/index.d.ts");

  console.log(`\nPreflight passed:`);
  console.log(`  @innovapptive.com/realm@${realmVersion}`);
  console.log(`  @innovapptive.com/realm-react@${realmReactVersion}`);

  const publishArgs = ["publish"];
  if (dryRun) {
    publishArgs.push("--dry-run");
  }
  publishArgs.push("--access", "restricted", "--registry", "https://registry.npmjs.org/");

  run("npm", [...publishArgs, "--workspace", "@innovapptive.com/realm"]);
  run("npm", [...publishArgs, "--workspace", "@innovapptive.com/realm-react"]);

  publishSucceeded = true;
  console.log(`\n${dryRun ? "Dry run" : "Publish"} completed successfully.`);
} finally {
  // Always clean temporary bumps, including failed publishes, unless explicitly kept.
  if (!noBump) {
    restoreVersionFiles(originalRealmVersion);
  }
}

if (!publishSucceeded) {
  process.exit(1);
}
