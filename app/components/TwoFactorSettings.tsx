// Two-factor authentication settings (TOTP). Client component used by
// /settings for owners AND the bootstrap super-admin (whose 2FA state
// lives on the row setup creates for ADMIN_EMAIL). Three states:
// off (enable button), setting-up (QR + manual key + confirm code),
// on (status + disable form). Recovery codes render exactly once
// after confirm and are never fetched again. The QR is rendered
// locally with the `qrcode` package — no network call, the secret
// never leaves this browser except inside the setup response.

"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Phase = "off" | "starting" | "confirming" | "recovery" | "on" | "disabling";

export default function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const [phase, setPhase] = useState<Phase>(enabled ? "on" : "off");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!otpauthUrl) return;
    let cancelled = false;
    QRCode.toDataURL(otpauthUrl, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setMessage("Could not draw the QR code — use the manual key below instead.");
      });
    return () => {
      cancelled = true;
    };
  }, [otpauthUrl]);

  async function start() {
    if (sending) return;
    setMessage("");
    setSending(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not start setup.");
      setOtpauthUrl(data.otpauthUrl);
      setManualKey(data.manualKey);
      setPhase("confirming");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not start setup.");
    } finally {
      setSending(false);
    }
  }

  async function confirm() {
    if (sending) return;
    setMessage("");
    if (!code.trim()) {
      setMessage("Enter the 6-digit code from your app.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/auth/2fa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Invalid code. Try again.");
      setRecoveryCodes(data.recoveryCodes ?? []);
      setCode("");
      setOtpauthUrl("");
      setManualKey("");
      setQrDataUrl("");
      setPhase("recovery");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Invalid code. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function disable() {
    if (sending) return;
    setMessage("");
    if (!password) {
      setMessage("The current password is required.");
      return;
    }
    if (!code.trim()) {
      setMessage("Enter a current code (or a recovery code below).");
      return;
    }
    setSending(true);
    try {
      // 6 digits (ignoring spacing) = TOTP; anything else goes down the
      // recovery path. A wrong guess only ever yields an error message —
      // the server re-validates both shapes independently.
      const useRecovery = code.replace(/[\s-]/g, "").length !== 6;
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          useRecovery ? { password, recoveryCode: code.trim() } : { password, code: code.trim() }
        ),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not disable two-factor authentication.");
      setPassword("");
      setCode("");
      setPhase("off");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not disable two-factor authentication.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">Two-factor authentication</p>
      {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}

      {(phase === "off" || phase === "starting") && (
        <>
          <p className="text-sm text-gray-600">
            Add a second step to logging in: after your password, you&apos;ll enter a 6-digit code
            from an authenticator app. Takes a minute, protects the whole account.
          </p>
          <div>
            <button
              onClick={() => {
                setPhase("starting");
                start();
              }}
              disabled={sending}
              className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {sending ? "Starting…" : "Enable two-factor authentication"}
            </button>
          </div>
        </>
      )}

      {phase === "confirming" && (
        <>
          <p className="text-sm text-gray-600">
            Scan this code with your authenticator app (Google Authenticator, Authy, or similar),
            then enter the 6-digit code it shows. Can&apos;t scan? Type this key in instead:
          </p>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="TOTP setup QR code" width={220} height={220} className="rounded-lg border border-gray-200" />
          ) : (
            <p className="text-sm text-gray-500">Drawing the code…</p>
          )}
          <p className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900">{manualKey}</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
            placeholder="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Confirmation code"
            className="w-full rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
          />
          <div>
            <button
              onClick={confirm}
              disabled={sending}
              className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {sending ? "Confirming…" : "Confirm and enable"}
            </button>
          </div>
        </>
      )}

      {phase === "recovery" && (
        <>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Two-factor authentication is on. Save these recovery codes NOW — each works once, and
            they will never be shown again. If you lose your authenticator app, these are the only
            way back in.
          </p>
          <ul className="grid grid-cols-2 gap-1 rounded-lg bg-gray-50 p-3 font-mono text-sm text-gray-900">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div>
            <button
              onClick={() => {
                setRecoveryCodes([]);
                setPhase("on");
              }}
              className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white"
            >
              I&apos;ve saved these codes
            </button>
          </div>
        </>
      )}

      {(phase === "on" || phase === "disabling") && (
        <>
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Two-factor authentication is on. Logging in asks for your password, then a code from
            your app.
          </p>
          {phase === "on" ? (
            <div>
              <button
                onClick={() => setPhase("disabling")}
                className="rounded-full border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700"
              >
                Disable two-factor authentication
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Confirm it&apos;s you: your current password plus a current code from your app (or
                one unused recovery code). Disabling deletes the stored secret and all recovery
                codes.
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                aria-label="Current password"
                className="w-full rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
              />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && disable()}
                placeholder="6-digit code or recovery code"
                inputMode="text"
                autoComplete="one-time-code"
                aria-label="Code or recovery code"
                className="w-full rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-black"
              />
              <div className="flex gap-2">
                <button
                  onClick={disable}
                  disabled={sending}
                  className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {sending ? "Disabling…" : "Disable"}
                </button>
                <button
                  onClick={() => {
                    setPhase("on");
                    setPassword("");
                    setCode("");
                    setMessage("");
                  }}
                  className="rounded-full border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
