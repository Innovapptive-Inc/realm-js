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

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function readPackageVersion(packageRoot) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  return packageJson.version;
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
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
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

console.log(`Preparing Innovapptive Realm packages${dryRun ? " (dry run)" : ""}...`);

if (!noBump) {
  const previousRealmVersion = readPackageVersion(realmRoot);
  const previousRealmReactVersion = readPackageVersion(realmReactRoot);

  console.log("\nBumping patch versions before publish...");
  console.log(`  @innovapptive.com/realm: ${previousRealmVersion} -> patch`);
  run("npm", ["version", "patch", "--no-git-tag-version", "--workspace", "@innovapptive.com/realm"]);

  const bumpedRealmVersion = readPackageVersion(realmRoot);
  syncNodePrebuildArchiveNames(bumpedRealmVersion);

  console.log(`  @innovapptive.com/realm-react: ${previousRealmReactVersion} -> patch`);
  run("npm", ["version", "patch", "--no-git-tag-version", "--workspace", "@innovapptive.com/realm-react"]);
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

console.log(`\n${dryRun ? "Dry run" : "Publish"} completed successfully.`);
