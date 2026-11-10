import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BYPASS_LAYERS, tallyPatchStatus, rollupLayers } from "../lib/selfcheck.js";
import { createProbe, readProbe, probeText, PROBE_TTL_MS } from "../lib/probe.js";

test("22 个宿主补丁层 + 3 个运行时层 = 25 层", () => {
  assert.equal(BYPASS_LAYERS.length, 22);
});

test("tally counts drifted and partial as not applied", () => {
  const patches = [
    { id: 1, name: "a" },
    { id: 2, name: "b" },
    { id: 3, name: "c" },
    { id: 4, name: "d" },
  ];
  const tally = tallyPatchStatus({ 1: "applied", 2: "drifted", 3: "partial", 4: "pending" }, patches);
  assert.equal(tally.applied, 1);
  assert.equal(tally.drifted, 1);
  assert.equal(tally.partial, 1);
  assert.equal(tally.pending, 1);
  assert.equal(tally.total, 4); // `partial`、drifted、pending 都计入分母
});

test("rollupLayers: missing host is unknown, not green", () => {
  const layers = rollupLayers({}, false);
  assert(layers.every((layer) => layer.state === "unknown" || layer.state === "ok"));
  assert(layers.some((layer) => layer.state === "unknown"));
});

test("rollupLayers: pending is not broken", () => {
  const layer = rollupLayers({ 24: "pending", 37: "applied" }, true).find((item) => item.ids.includes(24));
  assert.equal(layer.state, "pending");
  assert.deepEqual(layer.pending, [24]);
  assert.deepEqual(layer.broken, []);
});

test("probe writes a nonce, reads it back, and expires after TTL", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-probe-"));
  try {
    const probe = createProbe(home);
    assert.match(probe.nonce, /^purge-[0-9a-f]{8}$/);
    assert.equal(readProbe(home).nonce, probe.nonce);
    assert.match(probeText(home), new RegExp(`\\[${probe.nonce}\\]`));
    const file = path.join(home, "dsh-purge", "probe.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    data.at = Date.now() - PROBE_TTL_MS - 1;
    fs.writeFileSync(file, JSON.stringify(data));
    assert.equal(readProbe(home), null);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
