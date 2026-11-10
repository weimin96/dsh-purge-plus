import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readFeatures, writeFeatures, applyFeaturePreset, FEATURE_DEFAULTS } from "../lib/features.js";

test("feature flags persist and presets switch groups", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-features-"));
  try {
    assert.deepEqual(readFeatures(home), { ...FEATURE_DEFAULTS });
    const saved = writeFeatures({ promptInject: false, refusalRetry: true }, home);
    assert.equal(saved.promptInject, false);
    assert.equal(saved.refusalRetry, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, "dsh-purge", "features.json"), "utf8")).promptInject, false);

    const smart = applyFeaturePreset("smart", home);
    assert.equal(smart.master, true);
    assert.equal(smart.promptInject, true);
    assert.equal(smart.capabilityProtocol, false);
    assert.equal(smart.autoRetry, true);
    assert.equal(smart.autoContinue, false);
    assert.equal(smart.refusalRetry, false);
    assert.equal(smart.redteamTools, false);

    const none = applyFeaturePreset("none", home);
    assert.equal(none.master, false);
    assert.equal(none.promptInject, false);
    assert.equal(none.autoRetry, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
