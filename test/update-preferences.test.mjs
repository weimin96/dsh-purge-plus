import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { updatePreferences, saveUpdatePreferences } from "../lib/update.js";

test("update preferences default to check-only and clamp interval", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-update-pref-"));
  const prev = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    assert.deepEqual(updatePreferences(), { autoCheck: true, autoInstall: false, intervalHours: 6 });
    const saved = saveUpdatePreferences({ autoInstall: true, intervalHours: 999 });
    assert.equal(saved.autoInstall, true);
    assert.equal(saved.intervalHours, 6);
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, "dsh-purge", "update-preferences.json"), "utf8")).autoInstall, true);
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
