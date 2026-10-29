// Domain normalization tests: exact-host matching is the security
// property — subdomains and lookalikes must never normalize into an
// approved host. (isDomainApproved's DB half is covered by probes
// against live data, not here; only its no-DB branches run below.)
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { hostnameFromOrigin, isDomainApproved, normalizeHostname } from "@/lib/domains";

describe("normalizeHostname", () => {
  it("lowercases and strips ports", () => {
    assert.equal(normalizeHostname("Demo1.ViveReply.com:443"), "demo1.vivereply.com");
  });
  it("rejects schemes, paths, spaces, and empties", () => {
    for (const bad of ["https://demo1.vivereply.com", "demo1.vivereply.com/chat", "demo 1.com", "", "   "]) {
      assert.equal(normalizeHostname(bad), null, JSON.stringify(bad));
    }
  });
  it("keeps subdomains distinct (no wildcard approval)", () => {
    assert.equal(normalizeHostname("www.demo1.vivereply.com"), "www.demo1.vivereply.com");
    assert.equal(normalizeHostname("evil-demo1.vivereply.com"), "evil-demo1.vivereply.com");
    assert.notEqual(normalizeHostname("www.demo1.vivereply.com"), "demo1.vivereply.com");
  });
});

describe("hostnameFromOrigin", () => {
  it("extracts lowercase hosts, null on garbage", () => {
    assert.equal(hostnameFromOrigin("https://Demo1.ViveReply.com:443/chat"), "demo1.vivereply.com");
    assert.equal(hostnameFromOrigin(null), null);
    assert.equal(hostnameFromOrigin("not a url"), null);
  });
});

describe("isDomainApproved (no-DB branches)", () => {
  it("auto-approves localhost outside production only", async () => {
    if (process.env.NODE_ENV === "production") return;
    assert.equal(await isDomainApproved("whatever", "localhost"), true);
    assert.equal(await isDomainApproved("whatever", "not a host"), false);
  });
});
