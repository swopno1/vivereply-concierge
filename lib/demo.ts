// Single demo-property rule: the operator-configured demo property id,
// or null when none is configured. Production leaves DEMO_PROPERTY_ID
// unset — every demo fallback in the resolution paths (Suite binding,
// room catalogue, widget keys, fixture backends, super-admin default
// page) keys off this helper, so unset means no property is special.
// An empty/blank value counts as unset. Read at call time (never
// cached) so tests and scripts can set the env per context.
//
// Zero imports by design: this module is imported from BOTH lib/* and
// demo-config/*, and demo-config must stay loadable without the app
// graph (seeds, harnesses). Never add an import here.
export function demoPropertyId(): string | null {
  const raw = (process.env.DEMO_PROPERTY_ID ?? "").trim();
  return raw === "" ? null : raw;
}
