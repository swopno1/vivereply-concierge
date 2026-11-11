// Stripe webhook (Phase 3): syncs Subscription rows from platform
// events. Register exactly these events on the endpoint (test mode,
// then live — see .env.example §2):
//   checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted,
//   invoice.payment_succeeded, invoice.payment_failed
// Security: the Stripe signature is verified BEFORE anything else —
// unsigned/bad-signature bodies are rejected (400), logged, and
// never applied. Idempotency: each event applies, THEN its id is
// claimed in StripeEvent — a crash replays through Stripe redelivery
// and every handler is an absolute-state set (re-applying converges;
// emails are BillingNotice-guarded). Unknown properties and unknown
// prices keep existing state rather than inventing any. No card data
// ever arrives here — Stripe sends ids and statuses only.
// SERVICE PATH (marked): unattributed service writes (the caller is
// Stripe, authenticated by HMAC, not a session).
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prismaService } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  VALID_INTERVALS,
  VALID_TIERS,
  claimStripeEvent,
  hasNotice,
  monthKey,
  recordNotice,
} from "@/lib/billing";
import { stripe, stripeWebhookSecret, tierIntervalForPrice } from "@/lib/stripe";
import { sendPaymentFailedEmail } from "@/lib/email";

function validTierInterval(tier: unknown, interval: unknown): { tier: string; interval: string } | null {
  if (
    typeof tier === "string" &&
    typeof interval === "string" &&
    (VALID_TIERS as readonly string[]).includes(tier) &&
    (VALID_INTERVALS as readonly string[]).includes(interval)
  ) {
    return { tier, interval };
  }
  return null;
}

// Tier+interval resolution for a subscription object: our own
// metadata first (checkout + change-plan both stamp it), else the
// env price map, else NULL (caller keeps the row as-is).
function resolvePlan(sub: Stripe.Subscription): { tier: string; interval: string } | null {
  const fromMeta = validTierInterval(sub.metadata?.tier, sub.metadata?.interval);
  if (fromMeta) return fromMeta;
  const priceId = sub.items?.data?.[0]?.price?.id;
  if (typeof priceId === "string") {
    const fromPrice = tierIntervalForPrice(priceId);
    if (fromPrice) return fromPrice;
  }
  return null;
}

// Stripe SDK v23 moved the period end to the subscription ITEM (our
// subscriptions always carry exactly one item). NULL when absent —
// callers keep the row's existing value rather than write NULL over
// a good date.
function periodEndOf(sub: Stripe.Subscription): Date | null {
  const end = sub.items?.data?.[0]?.current_period_end;
  return typeof end === "number" ? new Date(end * 1000) : null;
}

// v23 invoice → subscription link (plus the metadata snapshot's
// propertyId as a second lookup key when the row id changed).
function invoiceSubRef(invoice: Stripe.Invoice): { subId: string | null; propertyId: string | null } {
  const details = invoice.parent?.subscription_details ?? null;
  const raw = details?.subscription;
  const subId = typeof raw === "string" ? raw : (raw?.id ?? null);
  const propertyId =
    details?.metadata?.propertyId && typeof details.metadata.propertyId === "string"
      ? details.metadata.propertyId
      : null;
  return { subId, propertyId };
}

async function rowFor(propertyId: string | null, stripeSubId: string | null) {
  const db = prismaService();
  if (propertyId) {
    const byProp = await db.subscription.findUnique({ where: { propertyId } }).catch(() => null);
    if (byProp) return byProp;
  }
  if (stripeSubId) {
    return db.subscription.findUnique({ where: { stripeSubscriptionId: stripeSubId } }).catch(() => null);
  }
  return null;
}

export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => "");
  const signature = req.headers.get("stripe-signature") ?? "";
  let client;
  try {
    client = stripe();
  } catch {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 500 });
  }
  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(raw, signature, stripeWebhookSecret());
  } catch {
    // Unsigned or forged — logged, never applied. 400 (not 401: no
    // session scheme lives here, and Stripe's dashboard shows 400s
    // as endpoint errors worth investigating).
    console.error("billing webhook: signature verification failed");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    await applyEvent(client, event);
  } catch (e) {
    // Apply crashed BEFORE the claim landed: 500 so Stripe retries.
    // Handlers are absolute sets, so redelivery converges.
    console.error("billing webhook: apply failed", e);
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
  // Claim AFTER applying: a crash anywhere above 500s and Stripe
  // redelivers; re-applying the same absolute state converges, and a
  // P2002 here just means "already seen" (duplicate:true, still 200).
  // Only a non-P2002 claim failure 500s (sick database → retry).
  let first: boolean;
  try {
    first = await claimStripeEvent(event.id, event.type);
  } catch {
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
  return NextResponse.json({ received: true, duplicate: !first });
}

async function applyEvent(client: Stripe, event: Stripe.Event): Promise<void> {
  const db = prismaService();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const propertyId =
        session.metadata?.propertyId ?? session.client_reference_id ?? null;
      const row = await rowFor(propertyId, null);
      if (!row || !propertyId) {
        console.error("billing webhook: checkout for unknown property");
        return;
      }
      const plan = validTierInterval(session.metadata?.tier, session.metadata?.interval);
      const subId = typeof session.subscription === "string" ? session.subscription : null;
      const customerId = typeof session.customer === "string" ? session.customer : null;
      // ACTIVE only on confirmed payment — async methods (3D Secure,
      // bank) complete checkout first and pay later; those rows stay
      // TRIAL until invoice.payment_succeeded lands.
      const paid = session.payment_status === "paid";
      await db.subscription.update({
        where: { propertyId },
        data: {
          ...(customerId ? { stripeCustomerId: customerId } : {}),
          ...(subId ? { stripeSubscriptionId: subId } : {}),
          ...(plan ? { tier: plan.tier, interval: plan.interval } : {}),
          ...(paid ? { status: "ACTIVE" } : {}),
        },
      });
      // Best-effort period end (the subscription.created event that
      // follows sets it authoritatively — this just shortens the gap).
      if (subId) {
        const full = await client.subscriptions.retrieve(subId).catch(() => null);
        const end = full ? periodEndOf(full) : null;
        if (full && end) {
          await db.subscription
            .update({
              where: { propertyId },
              data: { currentPeriodEnd: end, cancelAtPeriodEnd: full.cancel_at_period_end },
            })
            .catch(() => null);
        }
      }
      await logAudit({
        action: "billing.webhook.checkout",
        propertyId,
        detail: { eventId: event.id, paid },
      });
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const row = await rowFor(sub.metadata?.propertyId ?? null, sub.id);
      if (!row) {
        console.error("billing webhook: subscription for unknown property");
        return;
      }
      const plan = resolvePlan(sub);
      const periodEnd = periodEndOf(sub);
      // Stripe → ours: active/trialing serve; past_due serves while
      // retrying; incomplete changes nothing (payment still flying —
      // checkout already stored the ids); canceled serves to the
      // period end; unpaid/expired are conclusively dead. One guard:
      // a TRIAL row (never paid) never LEAVES trial via these events
      // — an abandoned async payment expiring in Stripe must not kill
      // the trial early. Those rows just shed the stale sub id; they
      // leave TRIAL only via payment (→ACTIVE) or the cron (→EXPIRED).
      let status: string | null = null;
      let shedStaleSub = false;
      if (sub.status === "active" || sub.status === "trialing") status = "ACTIVE";
      else if (sub.status === "past_due" && row.status !== "TRIAL") status = "PAST_DUE";
      else if (sub.status === "canceled" && row.status !== "TRIAL") status = "CANCELED";
      else if (sub.status === "unpaid" || sub.status === "incomplete_expired") {
        if (row.status === "TRIAL") shedStaleSub = true;
        else status = "EXPIRED";
      }
      // past_due on a TRIAL row keeps the id (a retry may still pay —
      // shedding would orphan the later payment_succeeded); only
      // terminal states shed.
      if (row.status === "TRIAL" && sub.status === "canceled") {
        shedStaleSub = true;
      }
      await db.subscription.update({
        where: { propertyId: row.propertyId },
        data: {
          ...(shedStaleSub ? { stripeSubscriptionId: null } : { stripeSubscriptionId: sub.id }),
          ...(typeof sub.customer === "string" ? { stripeCustomerId: sub.customer } : {}),
          ...(plan ? { tier: plan.tier, interval: plan.interval } : {}),
          ...(status ? { status } : {}),
          ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      });
      await logAudit({
        action: "billing.webhook.subscription",
        propertyId: row.propertyId,
        detail: { eventId: event.id, stripeStatus: sub.status },
      });
      return;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const row = await rowFor(sub.metadata?.propertyId ?? null, sub.id);
      if (!row) {
        console.error("billing webhook: deleted subscription for unknown property");
        return;
      }
      // Deleted = ended now (period-end cancels and immediate cancels
      // alike arrive here when access stops).
      await db.subscription.update({
        where: { propertyId: row.propertyId },
        data: { status: "EXPIRED", currentPeriodEnd: new Date(), cancelAtPeriodEnd: false },
      });
      await logAudit({
        action: "billing.webhook.deleted",
        propertyId: row.propertyId,
        detail: { eventId: event.id },
      });
      return;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const ref = invoiceSubRef(invoice);
      const row = await rowFor(ref.propertyId, ref.subId);
      if (!row) return;
      // Async-payment completion: TRIAL/PAST_DUE rows with stored ids
      // flip to ACTIVE; ACTIVE rows refresh the period end. CANCELED
      // and EXPIRED rows are NEVER resurrected here — resubscribing
      // goes through Checkout, which sets ACTIVE authoritatively.
      if (row.status !== "TRIAL" && row.status !== "PAST_DUE" && row.status !== "ACTIVE") {
        return;
      }
      await db.subscription.update({
        where: { propertyId: row.propertyId },
        data: {
          status: "ACTIVE",
          cancelAtPeriodEnd: false,
          ...(typeof invoice.period_end === "number"
            ? { currentPeriodEnd: new Date(invoice.period_end * 1000) }
            : {}),
        },
      });
      await logAudit({
        action: "billing.webhook.invoice_paid",
        propertyId: row.propertyId,
        detail: { eventId: event.id },
      });
      return;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const ref = invoiceSubRef(invoice);
      const row = await rowFor(ref.propertyId, ref.subId);
      if (!row) return;
      await db.subscription.update({
        where: { propertyId: row.propertyId },
        data: { status: "PAST_DUE" },
      });
      // One email per month no matter how often Stripe retries.
      const period = monthKey(new Date());
      if (!(await hasNotice(row.propertyId, "PAYMENT_FAILED", period))) {
        const [owner, property] = await Promise.all([
          db.user
            .findFirst({
              where: { propertyId: row.propertyId, role: "OWNER", active: true },
              select: { email: true },
            })
            .catch(() => null),
          db.property.findUnique({ where: { id: row.propertyId }, select: { name: true } }).catch(() => null),
        ]);
        if (owner?.email) {
          await sendPaymentFailedEmail({
            to: owner.email,
            resortName: property?.name ?? "your resort",
          });
          await recordNotice(row.propertyId, "PAYMENT_FAILED", period);
        }
      }
      await logAudit({
        action: "billing.webhook.invoice_failed",
        propertyId: row.propertyId,
        detail: { eventId: event.id },
      });
      return;
    }
    default:
      // Registered-but-unhandled (or a future event): acknowledged,
      // claimed, applied to nothing. Logged for visibility.
      console.error(`billing webhook: unhandled event type ${event.type}`);
      return;
  }
}
