import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const donationPlanSchema = z.enum(["none", "monthly", "yearly"]).optional();
const legalNameSchema = z.string().trim().min(3).max(120);

const checkoutSchema = z.object({
  origin: z.string().url().max(300),
  donationPlan: donationPlanSchema,
  donationCents: z.number().int().min(0).max(100_000).optional(),
  legalName: legalNameSchema,
});

/**
 * Persists the stated full legal name before checkout. Verification is
 * identity-bound: no legal name on file, no `verified` flag.
 */
async function saveLegalName(userId: string, legalName: string) {
  const { legalNameError, normalizeLegalName } = await import("./legal-name");
  const value = normalizeLegalName(legalName);
  const issue = legalNameError(value);
  if (issue) return { ok: false as const, reason: issue };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ verified_legal_name: value })
    .eq("id", userId);
  if (error) return { ok: false as const, reason: "Could not save your legal name." };
  return { ok: true as const, value };
}


/**
 * Zero-trust verification start: the e-mail must already be confirmed, a pending
 * payment row is created and a Stripe Checkout session is returned. The profile
 * only becomes an Early Believer when the payment webhook confirms the charge.
 */
export const startVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => checkoutSchema.parse(data))
  .handler(async ({ data, context }) => {
    const emailConfirmed =
      Boolean((context.claims as { email_verified?: boolean } | null)?.email_verified) ||
      Boolean((context.claims as { email_confirmed_at?: string } | null)?.email_confirmed_at);
    if (!emailConfirmed) {
      return { ok: false as const, reason: "email_unconfirmed" as const };
    }

    const legal = await saveLegalName(context.userId, data.legalName);
    if (!legal.ok) return { ok: false as const, reason: legal.reason };

    const { TIER_AMOUNTS, stripeKey, createCheckoutSession, normalizeDonationPlan } =
      await import("./verification.server");
    const { clampContribution } = await import("./contributions");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const donationPlan = normalizeDonationPlan(data.donationPlan ?? "none");
    const donationCents = clampContribution(donationPlan, data.donationCents ?? null);

    const { data: payment, error } = await supabaseAdmin
      .from("verification_payments")
      .insert({
        user_id: context.userId,
        tier: "early_believer",
        amount_cents: TIER_AMOUNTS.early_believer,
        donation_cents: donationCents,
        donation_plan: donationPlan,
        provider: "stripe",
        reference_code: `ROUT-${Math.floor(1000 + Math.random() * 9000)}`,
      })
      .select("id")
      .single();
    if (error || !payment) return { ok: false as const, reason: "payment_record_failed" as const };

    if (!stripeKey()) {
      return {
        ok: false as const,
        reason: "stripe_not_configured" as const,
        paymentId: payment.id,
      };
    }

    try {
      const url = await createCheckoutSession({
        tier: "early_believer",
        paymentId: payment.id,
        userId: context.userId,
        email: (context.claims as { email?: string } | null)?.email ?? null,
        origin: data.origin,
        donationPlan,
        donationCents,
      });

      return { ok: true as const, url };
    } catch {
      return { ok: false as const, reason: "checkout_failed" as const };
    }
  });


/**
 * Bank-transfer route: registers a pending payment with a human-readable
 * reference so an admin can match the SEPA transfer manually. No card involved,
 * so nothing is activated here — approval happens in the admin dashboard.
 */
export const startSepaVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        donationPlan: donationPlanSchema,
        donationCents: z.number().int().min(0).max(100_000).optional(),
        legalName: legalNameSchema,
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const legal = await saveLegalName(context.userId, data.legalName);
    if (!legal.ok) return { ok: false as const, reason: legal.reason };

    const { TIER_AMOUNTS, normalizeDonationPlan } = await import("./verification.server");
    const { clampContribution } = await import("./contributions");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const reference = `ROUT-${Math.floor(1000 + Math.random() * 9000)}`;
    const donationPlan = normalizeDonationPlan(data.donationPlan ?? "none");
    // A manual transfer cannot carry a recurring mandate: the chosen donation
    // rides along once, inside the same transfer, so the expected amount on the
    // bank statement matches what the CTA promised.
    const donationCents = clampContribution(donationPlan, data.donationCents ?? null);
    const totalCents = TIER_AMOUNTS.early_believer + donationCents;

    const { data: payment, error } = await supabaseAdmin
      .from("verification_payments")
      .insert({
        user_id: context.userId,
        tier: "early_believer",
        amount_cents: TIER_AMOUNTS.early_believer,
        donation_cents: donationCents,
        donation_plan: donationPlan,

        provider: "sepa",
        reference_code: reference,
      })
      .select("id, amount_cents, reference_code")
      .single();

    if (error || !payment) return { ok: false as const };
    return {
      ok: true as const,
      reference: payment.reference_code ?? reference,
      totalCents,
    };
  });

/** Current verification state for the signed-in user. */
export const getVerificationState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("tier, verified, status, verified_at, is_early_believer")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      tier: data?.tier ?? "free",
      verified: Boolean(data?.verified),
      isEarlyBeliever: Boolean(data?.is_early_believer),
      status: data?.status ?? "pending",
    };
  });

/**
 * Resolves a Bluesky handle to its DID through the AT Protocol identity API and
 * stores it on the caller's profile, so `<handle>.rout.be/.well-known/atproto-did`
 * can serve it.
 */
export const resolveBskyHandle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ handle: z.string().trim().min(1).max(253) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertBlueskyAccess } = await import("./entitlement.server");
    await assertBlueskyAccess(context.userId); // deep-link / direct-RPC protection
    const handle = data.handle.replace(/\s+/g, "").replace(/^@+/, "").toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(handle)) {
      return { success: false as const, error: "That does not look like a Bluesky handle." };
    }

    let did: string | null = null;
    try {
      const res = await fetch(
        `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) {
        return { success: false as const, error: `Bluesky could not resolve @${handle}.` };
      }
      const body = (await res.json()) as { did?: string };
      did = typeof body.did === "string" && body.did.startsWith("did:") ? body.did : null;
    } catch {
      return { success: false as const, error: "Could not reach Bluesky. Try again." };
    }

    if (!did) return { success: false as const, error: `No DID found for @${handle}.` };

    const { error } = await context.supabase
      .from("profiles")
      .update({ bluesky_did: did })
      .eq("id", context.userId);
    if (error) return { success: false as const, error: "Could not save the DID to your profile." };

    return { success: true as const, did, handle };
  });
