// PLACEHOLDER — subscription billing (resorts paying US). NOT IMPLEMENTED.
// Post-hackathon scope: plans, Stripe Checkout for app.vivereply.com,
// customer portal, webhook handling, and per-property subscription state.
// This stub exists so the shape is agreed BEFORE any code wires to it:
//   - env (commented, .env.example §2): BILLING_STRIPE_SECRET_KEY,
//     BILLING_STRIPE_WEBHOOK_SECRET, BILLING_PRICE_* — test mode first.
//   - routes (unbuilt): /api/billing/checkout, /api/billing/webhook,
//     /api/billing/portal — all SUPER_ADMIN/OWNER session-gated.
//   - model (unbuilt): Subscription { propertyId, stripeCustomerId,
//     stripeSubscriptionId, plan, status } — added via schema change.
//   - invariant: resort GUEST money NEVER touches our Stripe account;
//     guest payments happen on the resort's own site (lib/resort-pay.ts).
// Nothing imports this module yet; every export throws until built.

export function billingNotImplemented(): never {
  throw new Error("Subscription billing is not implemented yet (post-hackathon).");
}
