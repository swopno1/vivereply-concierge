// Demo-default tests: with DEMO_PROPERTY_ID unset, nothing is special
// (no static widget key, no fixture backend); with it set, the demo
// paths behave exactly as before. The env is read at call time, so each
// case sets it explicitly and the ambient value is always restored.
// No database.
import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { demoPropertyId } from "@/lib/demo";
import { fixtureRoomsFor } from "@/demo-config/fixture";
import { getWidgetProperty, visibleWidgetKeys } from "@/demo-config/widget-keys";

const savedDemo = process.env.DEMO_PROPERTY_ID;

afterEach(() => {
  if (savedDemo === undefined) delete process.env.DEMO_PROPERTY_ID;
  else process.env.DEMO_PROPERTY_ID = savedDemo;
});

function unsetDemo() {
  delete process.env.DEMO_PROPERTY_ID;
}

describe("demoPropertyId", () => {
  it("is null when unset (production: no property is special)", () => {
    unsetDemo();
    assert.equal(demoPropertyId(), null);
  });
  it("treats empty and blank values as unset", () => {
    process.env.DEMO_PROPERTY_ID = "";
    assert.equal(demoPropertyId(), null);
    process.env.DEMO_PROPERTY_ID = "   ";
    assert.equal(demoPropertyId(), null);
  });
  it("returns the trimmed id when set", () => {
    process.env.DEMO_PROPERTY_ID = "  krishnachura-retreat ";
    assert.equal(demoPropertyId(), "krishnachura-retreat");
  });
});

describe("static widget keys", () => {
  it("resolve nothing when unset — demo-krishnachura falls to the DB", () => {
    unsetDemo();
    assert.equal(getWidgetProperty("demo-krishnachura"), undefined);
    assert.deepEqual(visibleWidgetKeys(), []);
  });
  it("resolve the demo entry when its property is the configured one", () => {
    process.env.DEMO_PROPERTY_ID = "krishnachura-retreat";
    assert.deepEqual(getWidgetProperty("demo-krishnachura"), {
      propertyId: "krishnachura-retreat",
      title: "Krishnachura Retreat",
    });
    assert.deepEqual(visibleWidgetKeys(), [
      ["demo-krishnachura", { propertyId: "krishnachura-retreat", title: "Krishnachura Retreat" }],
    ]);
  });
  it("stay gated when another property is configured", () => {
    process.env.DEMO_PROPERTY_ID = "some-other-resort";
    assert.equal(getWidgetProperty("demo-krishnachura"), undefined);
    assert.deepEqual(visibleWidgetKeys(), []);
  });
  it("never resolve unknown or empty keys", () => {
    process.env.DEMO_PROPERTY_ID = "krishnachura-retreat";
    assert.equal(getWidgetProperty("nope"), undefined);
    assert.equal(getWidgetProperty(null), undefined);
    unsetDemo();
    assert.equal(getWidgetProperty("nope"), undefined);
  });
});

describe("fixture backends", () => {
  it("activate for registry properties whenever demo mode is on", () => {
    // Note the gate is demo-mode itself, not the demo property's id:
    // seabreeze-test is a test property, not the demo property.
    process.env.DEMO_PROPERTY_ID = "krishnachura-retreat";
    const rooms = fixtureRoomsFor("seabreeze-test");
    assert.ok(rooms && rooms.length === 2);
  });
  it("activate for nothing when unset", () => {
    unsetDemo();
    assert.equal(fixtureRoomsFor("seabreeze-test"), undefined);
  });
  it("never serve unregistered properties", () => {
    process.env.DEMO_PROPERTY_ID = "krishnachura-retreat";
    assert.equal(fixtureRoomsFor("krishnachura-retreat"), undefined);
    assert.equal(fixtureRoomsFor("nope"), undefined);
  });
});
