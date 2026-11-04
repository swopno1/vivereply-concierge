// Worker-invoke verdict tests: Modal answers 200 even when it refuses a
// run ({ accepted: false } on bad auth / version mismatch, in
// milliseconds, with no callback to follow). The app must read that
// verdict and fail loudly — trusting the 200 alone wedges the run at
// RUNNING forever.
import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { invokeIngestionWorker } from "@/lib/worker";

const realFetch = globalThis.fetch;

function stubFetchOnce(body, status = 200) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  process.env.MODAL_WORKER_URL = "https://worker.example.com/ingest";
  process.env.WORKER_SHARED_SECRET = "test-secret";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.MODAL_WORKER_URL;
  delete process.env.WORKER_SHARED_SECRET;
});

const INPUT = {
  runId: "run-1",
  propertyId: "demo-inn",
  website: "https://demo.example.com",
  files: [],
  storageHost: "",
  rawUploadUrl: null,
};

describe("invokeIngestionWorker", () => {
  it("reports invoked when the worker accepts", async () => {
    stubFetchOnce({ accepted: true });
    const out = await invokeIngestionWorker(INPUT);
    assert.equal(out.invoked, true);
  });
  it("throws loudly on a worker refusal instead of wedging at RUNNING", async () => {
    stubFetchOnce({ accepted: false, error: "bad auth" });
    await assert.rejects(() => invokeIngestionWorker(INPUT), /Worker refused the run \(bad auth\)/);
  });
  it("throws on a non-200 invoke", async () => {
    stubFetchOnce({ error: "boom" }, 500);
    await assert.rejects(() => invokeIngestionWorker(INPUT), /Worker invoke responded 500/);
  });
});
