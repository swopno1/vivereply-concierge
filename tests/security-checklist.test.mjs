// Security checklist tests: Settings → Security promises "live status,
// not promises" — the 2FA row must reflect the user's real state, and the
// counts must flow into their labels. No database, no page render.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { securityChecklistRows } from "@/lib/security-checklist";

const row = (rows, label) => rows.find((r) => r.label === label);

describe("securityChecklistRows", () => {
  it("shows 2FA On when enabled, Off when not", () => {
    const on = row(
      securityChecklistRows({ activeDomainCount: 1, bridgeTokenCount: 1, twoFaEnabled: true }),
      "Two-factor authentication"
    );
    assert.equal(on.on, true);
    const off = row(
      securityChecklistRows({ activeDomainCount: 1, bridgeTokenCount: 1, twoFaEnabled: false }),
      "Two-factor authentication"
    );
    assert.equal(off.on, false);
  });
  it("keeps the other rows' live mapping (domains gate, rest always on)", () => {
    const rows = securityChecklistRows({ activeDomainCount: 0, bridgeTokenCount: 2, twoFaEnabled: false });
    assert.equal(row(rows, "Approved widget domains (0 active)").on, false);
    assert.equal(row(rows, "Bridge keys (hashed, revocable, 2 active)").on, true);
    assert.equal(row(rows, "Widget token handshake (per-message domain re-check)").on, true);
    const some = securityChecklistRows({ activeDomainCount: 3, bridgeTokenCount: 0, twoFaEnabled: true });
    assert.equal(row(some, "Approved widget domains (3 active)").on, true);
  });
  it("renders seven rows with stable labels", () => {
    const rows = securityChecklistRows({ activeDomainCount: 1, bridgeTokenCount: 1, twoFaEnabled: true });
    assert.equal(rows.length, 7);
    for (const r of rows) {
      assert.equal(typeof r.label, "string");
      assert.equal(typeof r.on, "boolean");
    }
  });
});
