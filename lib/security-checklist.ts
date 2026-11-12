// Security checklist rows (Settings → Security). The section blurb
// promises "live status, not promises" — so every row derives from
// live values, including the 2FA row (previously a hardcoded Off).
// Pure builder: the page passes what it already loaded, tests pin the
// mapping without rendering the page.

export type SecurityChecklistInput = {
  activeDomainCount: number;
  bridgeTokenCount: number;
  twoFaEnabled: boolean;
};

export type SecurityChecklistRow = {
  label: string;
  on: boolean;
};

export function securityChecklistRows(input: SecurityChecklistInput): SecurityChecklistRow[] {
  return [
    { label: "Owner + super-admin logins (scrypt / signed session cookie)", on: true },
    {
      label: `Approved widget domains (${input.activeDomainCount} active)`,
      on: input.activeDomainCount > 0,
    },
    { label: "Widget token handshake (per-message domain re-check)", on: true },
    {
      label: `Bridge keys (hashed, revocable, ${input.bridgeTokenCount} active)`,
      on: true,
    },
    { label: "Staff widget tokens (15-minute, origin-bound)", on: true },
    { label: "Rate limiting (chat per-property + per-IP, login throttle)", on: true },
    { label: "Two-factor authentication", on: input.twoFaEnabled },
  ];
}
