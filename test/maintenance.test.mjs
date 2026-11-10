import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { snapshot, listBackups, usage, verify, rollback } from "../lib/maintenance.js";

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-home-"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-root-"));
  fs.mkdirSync(path.join(root, "lib"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
  fs.writeFileSync(path.join(root, "lib", "a.js"), "export const a = 1;\n");
  fs.writeFileSync(path.join(root, "client.js"), "client\n");
  return { home, root, close: () => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(root, { recursive: true, force: true }); } };
}

test("snapshot, verify, usage and rollback restore plugin files", () => {
  const f = fixture();
  try {
    const snap = snapshot({ home: f.home, root: f.root, reason: "test" });
    assert.equal(snap.ok, true);
    assert.equal(listBackups(f.home).length, 1);
    assert.ok(usage(f.home).bytes > 0);
    assert.equal(verify(snap.id, f.home).manifest.files, 3);

    fs.writeFileSync(path.join(f.root, "lib", "a.js"), "export const a = 2;\n");
    const result = rollback(snap.id, { home: f.home, root: f.root });
    assert.equal(result.ok, true);
    assert.equal(fs.readFileSync(path.join(f.root, "lib", "a.js"), "utf8"), "export const a = 1;\n");
    assert.equal(listBackups(f.home).length, 2); // 回滚前的安全快照
  } finally { f.close(); }
});
