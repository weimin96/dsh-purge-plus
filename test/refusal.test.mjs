import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { looksLikeRefusal } from "../lib/refusal-retry.js";
import { readTuning, writeTuning } from "../lib/tuning.js";

test("refusal detector recognizes an English refusal but not a technical answer", () => {
  assert.equal(looksLikeRefusal("I can't help with that request."), true);
  assert.equal(looksLikeRefusal("The parser rejects malformed JSON and returns a 400."), false);
});

test("tuning.json round-trips refusalRetry", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-tuning-"));
  try {
    assert.equal(readTuning(home).refusalRetry, false);
    writeTuning({ refusalRetry: true }, home);
    assert.equal(readTuning(home).refusalRetry, true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
