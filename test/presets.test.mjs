import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { installPreset, presetStatus } from "../lib/presets.js";

test("installs the bundled unrestricted preset without overwriting an existing one", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-preset-"));
  try {
    const first = installPreset({ home, force: true });
    assert.equal(first.action, "installed");
    assert.equal(presetStatus(home).installed, true);
    const second = installPreset({ home });
    assert.equal(second.action, "kept");
    const agent = path.join(home, ".agent-presets", "unrestricted", "agent.cordis.yml");
    assert.ok(fs.readFileSync(agent, "utf8").includes("无限制模式"));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
