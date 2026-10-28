// Supabase Storage signing (RAG onboarding uploads). Hand-rolled REST so
// the app gains no new dependency: the server mints short-lived signed
// URLs with the service key, the browser uploads straight to Storage, and
// the worker downloads straight from Storage. The service key never leaves
// the server. Bucket `onboarding-uploads` must exist (private) — created
// once from the Supabase dashboard or SQL (see docs/onboarding.md).

export const ONBOARDING_BUCKET = "onboarding-uploads";

function storageBase(): { base: string; serviceKey: string } {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY are not set (upload signing).");
  }
  return { base: url.replace(/\/$/, ""), serviceKey };
}

async function sign(
  kind: "upload" | "download",
  path: string,
  expiresIn: number
): Promise<string> {
  const { base, serviceKey } = storageBase();
  const endpoint =
    kind === "upload"
      ? `${base}/storage/v1/object/upload/sign/${ONBOARDING_BUCKET}/${path}`
      : `${base}/storage/v1/object/sign/${ONBOARDING_BUCKET}/${path}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Storage signing responded ${res.status}.`);
  }
  const data = await res.json().catch(() => null);
  const signed = data?.signedUrl ?? data?.signedURL ?? data?.url;
  if (typeof signed !== "string" || !signed) {
    throw new Error("Storage signing returned no URL.");
  }
  const withToken =
    signed.includes("token=") && data?.token && !signed.includes(String(data.token))
      ? `${signed}${signed.includes("?") ? "&" : "?"}token=${data.token}`
      : signed;
  return withToken.startsWith("http") ? withToken : `${base}/storage/v1${withToken.startsWith("/") ? "" : "/"}${withToken}`;
}

export function signUploadUrl(path: string): Promise<string> {
  return sign("upload", path, 3600);
}

export function signDownloadUrl(path: string): Promise<string> {
  return sign("download", path, 7200);
}
