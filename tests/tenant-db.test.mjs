import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { tenantFor } from "@/lib/tenant-db";

const owner = (propertyId) => ({ role: "OWNER", propertyId });
const admin = { role: "SUPER_ADMIN", propertyId: null };

describe("tenantFor (RLS tenant resolution)", () => {
  it("owner resolves to the session property, ignoring the request id", () => {
    assert.equal(tenantFor(owner("prop-a"), "prop-a"), "prop-a");
    assert.equal(tenantFor(owner("prop-a"), "prop-b"), "prop-a");
    assert.equal(tenantFor(owner("prop-a")), "prop-a");
  });
  it("owner without a session property fails closed", () => {
    assert.equal(tenantFor(owner(null), "prop-a"), null);
  });
  it("super-admin acting on one property resolves to the validated request id", () => {
    assert.equal(tenantFor(admin, "prop-a"), "prop-a");
    assert.equal(tenantFor(admin, "  prop-a  "), "prop-a");
  });
  it("super-admin without a request property fails closed (cross-property reads take the service path)", () => {
    assert.equal(tenantFor(admin), null);
    assert.equal(tenantFor(admin, ""), null);
    assert.equal(tenantFor(admin, "   "), null);
  });
});
