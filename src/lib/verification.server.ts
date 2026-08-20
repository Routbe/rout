/** Server-only helpers for the paid Early Believer verification flow.
 *  One-time €3.99 lifetime verification, optionally combined with a recurring
 *  "Keep ROUT Alive" donation (€1/month or €5/year). */

export type Tier = "early_believer";
export type DonationPlan = "none" | "monthly" | "yearly";

/** One-time lifetime verification fee, in cents. Price-locked for life. */
export const EARLY_BELIEVER_CENTS = 399;

export const TIER_AMOUNTS: Record<Tier, number> = {
  early_believer: EARLY_BELIEVER_CENTS,
};

/** Minimum recurring donation add-ons. `none` keeps the checkout a single one-off charge. */
export const DONATION_PLAN_CENTS: Record<DonationPlan, number> = {
  none: 0,
  monthly: 100,
  yearly: 1200,
};

export const DONATION_PLAN_INTERVAL: Record<DonationPlan, "month" | "year" | null> = {
  none: null,
  monthly: "month",
  yearly: "year",
};


export const TIER_LABELS: Record<Tier, string> = {
  early_believer: "ROUT Early Believer Lifetime Verification",
};

export function stripeKey(): string | null {
  return process.env["STRIPE_SECRET_KEY"] ?? null;
}

/** Optional one-off pay-what-you-want top-up (max €1000). */
export const MAX_DONATION_CENTS = 100_000;

export function clampDonation(cents: number | undefined | null): number {
  if (!Number.isFinite(cents ?? NaN)) return 0;
  return Math.min(Math.max(Math.round(cents as number), 0), MAX_DONATION_CENTS);
}

export function normalizeDonationPlan(plan: string | undefined | null): DonationPlan {
  return plan === "monthly" || plan === "yearly" ? plan : "none";
}

/**
 * Creates a Stripe Checkout session with the REST API (no SDK, Worker-safe).
 * With a recurring add-on the session switches to `subscription` mode, where the
 * €3.99 lifetime fee rides along as a one-off line item.
 */
export async function createCheckoutSession(opts: {
  tier: Tier;
  paymentId: string;
  userId: string;
  email?: string | null;
  origin: string;
  donationPlan?: DonationPlan;
  /** Custom recurring amount in cents; clamped to the plan minimum. */
  donationCents?: number | null;
  /** `sepa_debit` settles asynchronously; anything else uses Stripe's default methods. */
  paymentMethod?: "card" | "sepa_debit";

}): Promise<string> {
  const key = stripeKey();
  if (!key) throw new Error("stripe_not_configured");

  const plan = normalizeDonationPlan(opts.donationPlan);
  const interval = DONATION_PLAN_INTERVAL[plan];
  const { clampContribution } = await import("./contributions");
  const recurringCents = clampContribution(plan, opts.donationCents ?? DONATION_PLAN_CENTS[plan]);

  const body = new URLSearchParams({
    mode: interval ? "subscription" : "payment",
    success_url: `${opts.origin}/dashboard?verification=success`,
    cancel_url: `${opts.origin}/dashboard?verification=cancelled`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(TIER_AMOUNTS[opts.tier]),
    "line_items[0][price_data][product_data][name]": TIER_LABELS[opts.tier],
    "metadata[payment_id]": opts.paymentId,
    "metadata[user_id]": opts.userId,
    "metadata[tier]": opts.tier,
    "metadata[donation_plan]": plan,
    "metadata[donation_cents]": String(recurringCents),
  });

  if (interval) {
    body.set("line_items[1][quantity]", "1");
    body.set("line_items[1][price_data][currency]", "eur");
    body.set("line_items[1][price_data][unit_amount]", String(recurringCents));
    body.set("line_items[1][price_data][recurring][interval]", interval);
    body.set("line_items[1][price_data][product_data][name]", "Keep ROUT Alive donation");
    body.set("subscription_data[metadata][payment_id]", opts.paymentId);
    body.set("subscription_data[metadata][user_id]", opts.userId);
  } else {
    // Carries the payment id onto the charge, so refunds/disputes resolve back
    // to the right row without a second Stripe lookup.
    body.set("payment_intent_data[metadata][payment_id]", opts.paymentId);
    body.set("payment_intent_data[metadata][user_id]", opts.userId);
  }

  // SEPA Direct Debit settles asynchronously: the session completes first and
  // the money lands days later, so activation waits for the async event.
  if (opts.paymentMethod === "sepa_debit") {
    body.set("payment_method_types[0]", "sepa_debit");
  }

  if (opts.email) body.set("customer_email", opts.email);


  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !json.url) throw new Error(json.error?.message ?? "stripe_checkout_failed");
  return json.url;
}

/** Marks a payment paid, flips the profile to Early Believer and provisions the alias. */
export async function activateVerification(paymentId: string, providerRef: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: payment } = await supabaseAdmin
    .from("verification_payments")
    .select("id, user_id, tier, status, donation_plan")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return false;
  if (payment.status === "paid") return true;

  await supabaseAdmin
    .from("verification_payments")
    .update({ status: "paid", provider_ref: providerRef })
    .eq("id", payment.id);

  // Identity-bound: `verified` only flips once a legal name is on file. The
  // checkout collects it up front, so this is a guard, not a normal path.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("verified_legal_name")
    .eq("id", payment.user_id)
    .maybeSingle();
  const hasLegalName = Boolean((profile?.verified_legal_name as string | null)?.trim());

  await supabaseAdmin
    .from("profiles")
    .update({
      tier: payment.tier,
      is_paid: true,
      verified: hasLegalName,
      is_early_believer: true,
      status: "active",
      ...(hasLegalName ? { verified_at: new Date().toISOString() } : {}),
    })
    .eq("id", payment.user_id);


  await supabaseAdmin.from("security_events").insert({
    user_id: payment.user_id,
    kind: "verification_activated",
    severity: "info",
    message: `Early Believer verification activated (${payment.tier}).`,
    details: { payment_id: payment.id },
  });

  // Paid badges light up the UI immediately: the dashboard listens to
  // `user_badges` over realtime, so no refresh is needed after checkout.
  const { awardBadges } = await import("./badge-grants.server");
  const slugs: ("early_believer" | "verified" | "supporter")[] = ["early_believer"];
  if (hasLegalName) slugs.push("verified");
  if ((payment.donation_plan as string | null) && payment.donation_plan !== "none") {
    slugs.push("supporter");
  }
  const source = payment.donation_plan && payment.donation_plan !== "none" ? "subscription" : "card";
  await awardBadges(payment.user_id, slugs, source, { payment_id: payment.id });

  const { notifyUser } = await import("./notifications.server");
  await notifyUser(payment.user_id, "payment_succeeded", { payment_id: payment.id });

  // Best effort: the @rout.be alias must never block activation.
  try {
    const { provisionAliasForUser } = await import("./alias.server");
    await provisionAliasForUser(payment.user_id);
  } catch (error) {
    console.error("alias provisioning failed", error);
  }

  return true;
}

/**
 * Records a non-final payment outcome (SEPA still clearing, failed, expired,
 * incomplete). Never touches the profile: only a confirmed charge grants
 * entitlements.
 */
export async function markPaymentStatus(
  paymentId: string,
  status: "processing" | "failed" | "expired" | "refunded" | "incomplete",
  providerRef: string | null,
  reason?: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: payment } = await supabaseAdmin
    .from("verification_payments")
    .select("id, user_id, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return false;
  // A confirmed payment is never downgraded by a later, lower-signal event.
  if (payment.status === "paid" && status !== "refunded") return true;

  await supabaseAdmin
    .from("verification_payments")
    .update({ status, ...(providerRef ? { provider_ref: providerRef } : {}) })
    .eq("id", payment.id);

  await supabaseAdmin.from("security_events").insert({
    user_id: payment.user_id,
    kind: `payment_${status}`,
    severity: status === "processing" ? "info" : "warning",
    message: `Verification payment ${status}${reason ? `: ${reason}` : ""}.`,
    details: { payment_id: payment.id, ...(reason ? { reason } : {}) },
  });

  const { notifyUser } = await import("./notifications.server");
  if (status === "processing") {
    await notifyUser(payment.user_id, "payment_processing", { payment_id: payment.id });
  } else if (status === "failed" || status === "expired" || status === "incomplete") {
    await notifyUser(payment.user_id, "payment_failed", { payment_id: payment.id, status, reason });
  } else if (status === "refunded") {
    await notifyUser(payment.user_id, "payment_refunded", { payment_id: payment.id });
  }

  return true;
}

/** Refund or chargeback: pulls the paid entitlements and badges back in. */
export async function revokeVerification(paymentId: string, reason: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: payment } = await supabaseAdmin
    .from("verification_payments")
    .select("id, user_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return false;

  await supabaseAdmin
    .from("verification_payments")
    .update({ status: "refunded" })
    .eq("id", payment.id);

  await supabaseAdmin
    .from("profiles")
    .update({
      tier: "free",
      is_paid: false,
      verified: false,
      is_early_believer: false,
      verified_at: null,
    })
    .eq("id", payment.user_id);

  const { revokeBadges } = await import("./badge-grants.server");
  await revokeBadges(payment.user_id, ["early_believer", "verified", "supporter"], "refund", {
    payment_id: payment.id,
    reason,
  });

  await supabaseAdmin.from("security_events").insert({
    user_id: payment.user_id,
    kind: "verification_revoked",
    severity: "warning",
    message: `Verification revoked (${reason}).`,
    details: { payment_id: payment.id, reason },
  });

  const { notifyUser } = await import("./notifications.server");
  await notifyUser(payment.user_id, "payment_refunded", { payment_id: payment.id, reason });

  return true;
}

/** Recurring donation stopped: the lifetime verification stays, the badge does not. */
export async function endRecurringDonation(paymentId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: payment } = await supabaseAdmin
    .from("verification_payments")
    .select("id, user_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return false;

  await supabaseAdmin
    .from("verification_payments")
    .update({ donation_plan: "none", donation_cents: 0 })
    .eq("id", payment.id);

  const { revokeBadges } = await import("./badge-grants.server");
  await revokeBadges(payment.user_id, ["supporter"], "subscription", { payment_id: payment.id });

  await supabaseAdmin.from("security_events").insert({
    user_id: payment.user_id,
    kind: "donation_cancelled",
    severity: "info",
    message: "Recurring ROUT donation cancelled.",
    details: { payment_id: payment.id },
  });

  const { notifyUser } = await import("./notifications.server");
  await notifyUser(payment.user_id, "subscription_cancelled", { payment_id: payment.id });

  return true;
}

/** Successful renewal: keeps the Supporter badge lit for returning donors. */
export async function confirmRecurringDonation(paymentId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: payment } = await supabaseAdmin
    .from("verification_payments")
    .select("id, user_id, donation_plan")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return false;
  if (!payment.donation_plan || payment.donation_plan === "none") return true;

  const { awardBadges } = await import("./badge-grants.server");
  await awardBadges(payment.user_id, ["supporter"], "subscription", { payment_id: payment.id });

  const { notifyUser } = await import("./notifications.server");
  await notifyUser(payment.user_id, "subscription_renewed", { payment_id: payment.id });
  return true;
}
