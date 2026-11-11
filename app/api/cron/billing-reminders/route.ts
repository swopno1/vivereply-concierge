// Billing cron (Phase 3): trial reminders + expiry + usage alerts.
// Triggered daily by the scheduler (Vercel Cron GET, or VM crontab
// curl — see the deploy runbook); auth is a shared bearer secret,
// NOT a session, because no human calls it. Vercel sends
// `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET
// is set; crontab sends the same header by hand.
//
// Each run, per subscription: trial day-7/21/27/30 reminders (once
// each, BillingNotice-guarded), trial→EXPIRED flip + expiry mail,
// 80%-of-quota alert (Growth/Scale + trials-as-Growth; Starter is
// dashboard-only per the handover), and CANCELED→EXPIRED cleanup
// past the period end. One sick property never aborts the run —
// errors are counted and returned, and unsent notices retry on the
// next run (the notice row lands only after a successful send).
import { NextRequest, NextResponse } from "next/server";
import { prismaService } from "@/lib/prisma";
import {
  TIER_QUOTA,
  USAGE_ALERT_RATIO,
  hasNotice,
  monthKey,
  monthStartUtc,
  quotaForTier,
  recordNotice,
  trialDay,
  trialDaysLeft,
} from "@/lib/billing";
import {
  sendTrialExpiredEmail,
  sendTrialReminderEmail,
  sendUsageAlertEmail,
} from "@/lib/email";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

const REMINDER_DAYS = [7, 21, 27, 30] as const;

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const db = prismaService();
  const now = new Date();
  const period = monthKey(now);
  let checked = 0;
  let reminded = 0;
  let expired = 0;
  let alerted = 0;
  let errors = 0;

  const subs = await db.subscription
    .findMany({
      where: { status: { in: ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED"] } },
      include: { property: { select: { name: true } } },
    })
    .catch(() => []);
  for (const sub of subs) {
    checked += 1;
    try {
      const owner = await db.user
        .findFirst({
          where: { propertyId: sub.propertyId, role: "OWNER", active: true },
          select: { email: true },
        })
        .catch(() => null);
      const resortName = sub.property?.name ?? "your resort";

      if (sub.status === "TRIAL") {
        const day = trialDay(sub.createdAt, now);
        if (owner?.email) {
          for (const n of REMINDER_DAYS) {
            const kind = `TRIAL_DAY${n}`;
            if (day >= n && !(await hasNotice(sub.propertyId, kind, "trial"))) {
              await sendTrialReminderEmail({
                to: owner.email,
                resortName,
                daysLeft: trialDaysLeft(sub.trialEndsAt, now),
              });
              await recordNotice(sub.propertyId, kind, "trial");
              reminded += 1;
            }
          }
        }
        if (now.getTime() > sub.trialEndsAt.getTime()) {
          await db.subscription.update({
            where: { id: sub.id },
            data: { status: "EXPIRED" },
          });
          expired += 1;
          if (owner?.email && !(await hasNotice(sub.propertyId, "TRIAL_EXPIRED", "trial"))) {
            await sendTrialExpiredEmail({ to: owner.email, resortName });
            await recordNotice(sub.propertyId, "TRIAL_EXPIRED", "trial");
          }
        }
      }

      if (sub.status === "CANCELED") {
        if (sub.currentPeriodEnd && now.getTime() > sub.currentPeriodEnd.getTime()) {
          await db.subscription.update({
            where: { id: sub.id },
            data: { status: "EXPIRED" },
          });
          expired += 1;
        }
      }

      // 80% usage alert: Growth + Scale + trials (which run Growth
      // quota). Starter sees usage on the dashboard only.
      if ((sub.status === "ACTIVE" || sub.status === "PAST_DUE" || sub.status === "TRIAL") && owner?.email) {
        const quota = sub.status === "TRIAL" ? TIER_QUOTA.GROWTH : quotaForTier(sub.tier);
        const starterSkipped = sub.status !== "TRIAL" && sub.tier === "STARTER";
        if (!starterSkipped) {
          const usage = await db.conversation.count({
            where: { propertyId: sub.propertyId, createdAt: { gte: monthStartUtc(now) } },
          });
          if (
            usage >= Math.floor(quota * USAGE_ALERT_RATIO) &&
            !(await hasNotice(sub.propertyId, "USAGE_80", period))
          ) {
            await sendUsageAlertEmail({ to: owner.email, resortName, used: usage, quota });
            await recordNotice(sub.propertyId, "USAGE_80", period);
            alerted += 1;
          }
        }
      }
    } catch {
      errors += 1;
    }
  }
  return NextResponse.json({ ok: true, checked, reminded, expired, alerted, errors });
}
