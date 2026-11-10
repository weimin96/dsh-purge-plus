import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { applyReplacementsToText, patchStatusDetail, patchDrift } from "../lib/core.js";

function fixture(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-engine-"));
  const aiBase = path.join(root, "node_modules", "@deepseek-ai");
  const file = path.join(aiBase, "dsh-agent-instructions", "lib", "index.js");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
  return { root, aiBase, file, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const patch = {
  id: 999,
  name: "TEST_EXPECT_CONTRACT",
  layer: "代码",
  file: "agent-instructions",
  replacements: [{ pattern: "AAA", replace: "BBB", expect: 1 }],
  markers: ["[dsh-purge] test marker"],
};

test("expect: exact one hit rewrites", () => {
  const out = applyReplacementsToText("xAAAz", patch);
  assert.equal(out.text, "xBBBz");
  assert.equal(out.changed, true);
  assert.equal(out.hitMismatch, undefined);
});

test("expect: zero hits blocks the whole replacement", () => {
  const out = applyReplacementsToText("nothing here", patch);
  assert.equal(out.changed, false);
  assert.deepEqual(out.hitMismatch, { patch_id: 999, expected: 1, actual: 0, file: "" });
});

test("expect: multiple hits blocks replace-all", () => {
  const out = applyReplacementsToText("xAAAyAAAz", patch);
  assert.equal(out.changed, false);
  assert.deepEqual(out.hitMismatch, { patch_id: 999, expected: 1, actual: 2, file: "" });
});

test("patchStatusDetail reports drifted when a target file exists but no anchor matches", async () => {
  const f = fixture("export const unrelated = 1;\n");
  try {
    const report = await patchStatusDetail(f.aiBase, [patch], { surface: "web", dshHome: f.root });
    assert.equal(report.status[999], "drifted");
    assert.equal(report.files[999][0].status, "drifted");
  } finally { f.close(); }
});

test("patchDrift returns a candidate for a missing anchor", async () => {
  const f = fixture("export const unrelated = 1;\n");
  try {
    const drift = await patchDrift(f.aiBase, [patch], { surface: "web", dshHome: f.root });
    assert.equal(drift.checked, 1);
    assert.equal(drift.drifted.length, 1);
    assert.equal(drift.drifted[0].id, 999);
    assert.equal(drift.drifted[0].anchors[0].reason, "anchor_not_found");
  } finally { f.close(); }
});

test("patchStatusDetail reports applied when the marker is present", async () => {
  const f = fixture("[dsh-purge] test marker\nconst x = 1;\n");
  try {
    const report = await patchStatusDetail(f.aiBase, [patch], { surface: "web", dshHome: f.root });
    assert.equal(report.status[999], "applied");
  } finally { f.close(); }
});

test("anchor-overrides.json replaces a drifted pattern without editing source", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-override-"));
  const prev = process.env.DSH_HOME;
  try {
    fs.mkdirSync(path.join(home, "dsh-purge"), { recursive: true });
    fs.writeFileSync(path.join(home, "dsh-purge", "anchor-overrides.json"), JSON.stringify({
      999: { 0: { pattern: "CCC" } },
    }));
    process.env.DSH_HOME = home;
    const out = applyReplacementsToText("xCCCz", patch);
    assert.equal(out.text, "xBBBz");
    assert.equal(out.changed, true);
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
