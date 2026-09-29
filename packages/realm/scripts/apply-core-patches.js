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

// Applies Innovapptive-maintained patches to the vendored realm-core submodule.
// realm-core is pinned by the upstream `community` branch, so we cannot rely on
// bumping the submodule commit to pick up small build fixes. Patches are applied
// idempotently before any native build, and re-applying an already-applied patch
// is treated as success.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const packageRoot = path.join(__dirname, "..");
const patchesDir = path.join(packageRoot, "patches", "realm-core");
const coreDir = path.join(packageRoot, "bindgen", "vendor", "realm-core");

if (!fs.existsSync(path.join(coreDir, ".git")) && !fs.existsSync(path.join(coreDir, "src"))) {
  console.error(
    "apply-core-patches: realm-core submodule is missing. Run `git submodule update --init --recursive` first.",
  );
  process.exit(1);
}

if (!fs.existsSync(patchesDir)) {
  console.log("apply-core-patches: no patches directory, nothing to do.");
  process.exit(0);
}

const patches = fs
  .readdirSync(patchesDir)
  .filter((name) => name.endsWith(".patch"))
  .sort();

if (patches.length === 0) {
  console.log("apply-core-patches: no patches found, nothing to do.");
  process.exit(0);
}

function git(args) {
  return spawnSync("git", args, { cwd: coreDir, encoding: "utf8" });
}

let applied = 0;
let skipped = 0;

for (const patch of patches) {
  const patchPath = path.join(patchesDir, patch);

  // Already applied? `git apply --reverse --check` succeeds when the patch is present.
  const alreadyApplied = git(["apply", "--reverse", "--check", patchPath]);
  if (alreadyApplied.status === 0) {
    console.log(`apply-core-patches: ${patch} already applied, skipping.`);
    skipped += 1;
    continue;
  }

  // Cleanly applicable?
  const canApply = git(["apply", "--check", patchPath]);
  if (canApply.status !== 0) {
    console.error(`apply-core-patches: ${patch} does not apply cleanly.`);
    console.error(canApply.stderr.trim());
    console.error(
      "The vendored realm-core may have changed. Re-generate the patch against the pinned submodule commit.",
    );
    process.exit(1);
  }

  const result = git(["apply", patchPath]);
  if (result.status !== 0) {
    console.error(`apply-core-patches: failed to apply ${patch}.`);
    console.error(result.stderr.trim());
    process.exit(1);
  }
  console.log(`apply-core-patches: applied ${patch}.`);
  applied += 1;
}

console.log(`apply-core-patches: done (${applied} applied, ${skipped} already present).`);
