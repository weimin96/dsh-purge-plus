import test from "node:test";
import assert from "node:assert/strict";

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  DatabaseSync = null;
}

const maybe = DatabaseSync ? test : test.skip;

maybe("evidence ledger hashes semantic content and tracks unknown questions", async () => {
  const { EvidenceLedger, UnknownRegistry } = await import("../lib/redteam/evidence-ledger.mjs");
  const db = new DatabaseSync(":memory:");
  try {
    const ledger = new EvidenceLedger(db);
    const input = { operation: "nmap_scan", parameters: {}, result: { host: "10.0.0.1" }, confidence: "observed", authority: "tool-output", limitations: [], supporting_ev_ids: [] };
    const first = ledger.record(input);
    assert.equal(first.ok, true);
    assert.match(first.ev_id, /^ev_[0-9a-f]{64}$/);
    assert.equal(ledger.record(input).duplicate, true);
    assert.equal(ledger.verify(input).matched, true);
    assert.equal(ledger.record({ ...input, confidence: "claimed" }).ok, false); // claimed 需要 source_agent

    const unknown = new UnknownRegistry(db);
    const saved = unknown.record({ question: "SSH credential?", domain: "internal-recon" });
    assert.equal(saved.ok, true);
    assert.match(saved.unk_id, /^unk_[0-9a-f]{64}$/);
    assert.equal(unknown.record({ question: "SSH credential?", domain: "internal-recon" }).duplicate, true);
  } finally {
    db.close();
  }
});
