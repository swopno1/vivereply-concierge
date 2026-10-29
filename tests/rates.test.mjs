// Rate math tests: date validation, night counts, flat quote totals,
// taka formatting. The demo script's flat prices (e.g. Terracotta
// 2 × ৳14,500 = ৳29,000) rest on these exact behaviors.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  formatTaka,
  isDateString,
  nightsBetween,
  quoteForStay,
} from "@/demo-config/rates";

describe("isDateString", () => {
  it("accepts exact YYYY-MM-DD", () => {
    assert.equal(isDateString("2026-11-10"), true);
  });
  it("rejects vague and malformed dates", () => {
    for (const bad of ["next weekend", "2026-11-4", "11/10/2026", "", null, 20261110, "2026-13-99x"]) {
      assert.equal(isDateString(bad), false, JSON.stringify(bad));
    }
  });
});

describe("nightsBetween", () => {
  it("counts calendar nights with no TZ shift", () => {
    assert.equal(nightsBetween("2026-11-10", "2026-11-12"), 2);
    assert.equal(nightsBetween("2026-11-10", "2026-11-11"), 1);
    assert.equal(nightsBetween("2026-11-10", "2026-11-10"), 0);
  });
});

describe("quoteForStay (flat demo rules)", () => {
  it("totals base × nights with per-night rows", () => {
    const q = quoteForStay(1450000, "2026-11-10", "2026-11-12");
    assert.equal(q.nights, 2);
    assert.equal(q.totalPoisha, 2900000);
    assert.equal(q.nightly.length, 2);
    assert.deepEqual(
      q.nightly.map((n) => n.pricePoisha),
      [1450000, 1450000]
    );
    assert.ok(q.nightly.every((n) => n.applied.length === 0));
  });
});

describe("formatTaka", () => {
  it("formats whole taka without decimals", () => {
    assert.equal(formatTaka(2900000), "৳29,000");
    assert.equal(formatTaka(1250000), "৳12,500");
  });
  it("formats fractional taka with two decimals", () => {
    assert.equal(formatTaka(125050), "৳1,250.50");
  });
});
