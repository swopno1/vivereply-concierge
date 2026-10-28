// Cloud worker plumbing (RAG onboarding). The app never imports a cloud
// SDK: it invokes the worker over HTTPS and authenticates callbacks with
// a shared secret, both directions Bearer. The worker itself (Python/Modal,
// see worker/) owns crawling, parsing, and chunking; this side owns keys,
// budgets, embeddings, and the database.

import { timingSafeEqual } from "node:crypto";

export type WorkerFile = { path: string; downloadUrl: string };

export async function invokeIngestionWorker(input: {
  runId: string;
  propertyId: string;
  website: string | null;
  files: WorkerFile[];
  storageHost: string;
  rawUploadUrl: string | null;
}): Promise<{ invoked: boolean; note: string }> {
  const url = process.env.MODAL_WORKER_URL;
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!url) {
    return { invoked: false, note: "Worker not configured — run stays queued (set MODAL_WORKER_URL)." };
  }
  if (!secret) {
    return { invoked: false, note: "Worker secret not configured — run stays queued." };
  }
  // Auth travels in the payload (compared timing-safe server-side):
  // a plain-dict web endpoint cannot reliably read request headers, so no
  // Authorization header is sent — nothing here implies otherwise.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, auth: secret, version: "2" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Worker invoke responded ${res.status}.`);
  }
  return { invoked: true, note: "Worker accepted the run." };
}

export function verifyWorkerSecret(header: string | null): boolean {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret || !header || !header.startsWith("Bearer ")) return false;
  const presented = Buffer.from(header.slice("Bearer ".length).trim());
  const expected = Buffer.from(secret);
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}
