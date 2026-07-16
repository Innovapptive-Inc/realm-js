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
/* eslint-disable no-console */

"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const packageRoot = path.join(__dirname, "..");
const prebuildsDir = path.join(packageRoot, "prebuilds");
const localNodeBinary = path.join(prebuildsDir, "node", "realm.node");

function listLocalNodePrebuilds() {
  if (!fs.existsSync(prebuildsDir)) {
    return [];
  }
  return fs.readdirSync(prebuildsDir).filter((name) => /^realm-.*\.tar\.gz$/.test(name));
}

// Monorepo / local native builds already produce prebuilds/node/realm.node.
if (fs.existsSync(localNodeBinary)) {
  process.exit(0);
}

const localPrebuilds = listLocalNodePrebuilds();
if (localPrebuilds.length === 0) {
  console.error(
    [
      "@innovapptive/realm: no packaged Node prebuilds were found under prebuilds/.",
      "This private distribution expects platform archives such as:",
      "  prebuilds/realm-v<version>-napi-v6-<platform>-<arch>.tar.gz",
      "Build them before publish, for example:",
      "  npm run prebuild-node --workspace @innovapptive/realm",
    ].join("\n"),
  );
  process.exit(1);
}

// Prefer archives shipped inside the npm package. prebuild-install checks
// prebuilds/<basename(downloadUrl)> before attempting a network download.
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["prebuild-install", "--runtime", "napi"],
  {
    cwd: packageRoot,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);

if (result.error) {
  console.error("@innovapptive/realm: failed to run prebuild-install:", result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    [
      "@innovapptive/realm: could not install a Node native prebuild for this platform.",
      `Found packaged archives: ${localPrebuilds.join(", ")}`,
      "Ensure a matching prebuild was included for your OS/arch before publishing.",
    ].join("\n"),
  );
  process.exit(result.status || 1);
}
