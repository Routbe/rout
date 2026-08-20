/**
 * Fail-safe matching for manual SEPA transfers.
 *
 * Manual bank transfers are typed by humans, so a strict "reference must match"
 * rule silently strands real payments. The matcher therefore grades every
 * inbound bank notification:
 *
 *   Level 1 — Perfect match: amount *and* reference line up → activate at once.
 *   Level 2 — Partial match: amount lines up, reference missing/unknown →
 *             e-mail the payer a short form so they can supply the reference.
 *   Level 3 — Alert: nothing lines up → logged as "Review Required" for admins.
 */
import { parseAllRoutReferences, parseAmountCents, parseRoutReference } from "./reference-parser";

export type MatchLevel = 1 | 2 | 3;

export interface MatchOutcome {
  level: MatchLevel;
  reference: string | null;
  amountCents: number | null;
  paymentId?: string;
  activated?: boolean;
  reason: string;
}

interface PaymentRow {
  id: string;
  user_id: string;
  tier: string;
  status: string;
  amount_cents: number | null;
  donation_cents: number | null;
  reference_code: string | null;
}

function expectedCents(payment: PaymentRow): number {
  return (payment.amount_cents ?? 0) + (payment.donation_cents ?? 0);
}

/** Grades and settles one inbound bank notification. */
export async function matchInboundPayment(text: string): Promise<MatchOutcome> {
  const reference = parseRoutReference(text);
  const amountCents = parseAmountCents(text);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  console.info("[sepa-match] inbound", { reference, amountCents, length: text.length });

  let payment: PaymentRow | null = null;
  if (reference) {
    const { data } = await supabaseAdmin
      .from("verification_payments")
      .select("id, user_id, tier, status, amount_cents, donation_cents, reference_code")
      .eq("reference_code", reference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    payment = (data as PaymentRow | null) ?? null;
  }

  // ---- Level 1: reference resolves and the amount is right (or absent). ----
  if (payment) {
    const expected = expectedCents(payment);
    const amountOk = amountCents === null || amountCents >= expected;
    if (amountOk) {
      if (payment.status === "paid") {
        return {
          level: 1,
          reference,
          amountCents,
          paymentId: payment.id,
          activated: false,
          reason: "already_paid",
        };
      }
      await activate(payment, reference!, amountCents);
      return {
        level: 1,
        reference,
        amountCents,
        paymentId: payment.id,
        activated: true,
        reason: "perfect_match",
      };
    }

    // Reference is right but the money is short — never auto-activate.
    await logReview(payment.user_id, reference, amountCents, expected, "amount_mismatch");
    return {
      level: 3,
      reference,
      amountCents,
      paymentId: payment.id,
      activated: false,
      reason: "amount_mismatch",
    };
  }

  // ---- Level 2: amount matches exactly one pending transfer. ----
  if (amountCents !== null) {
    const { data } = await supabaseAdmin
      .from("verification_payments")
      .select("id, user_id, tier, status, amount_cents, donation_cents, reference_code")
      .eq("provider", "sepa")
      .neq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(50);

    const candidates = ((data as PaymentRow[] | null) ?? []).filter(
      (row) => expectedCents(row) === amountCents,
    );

    if (candidates.length === 1) {
      const candidate = candidates[0]!;
      await supabaseAdmin
        .from("verification_payments")
        .update({ status: "processing" })
        .eq("id", candidate.id);
      await sendIncompletePaymentEmail(candidate, amountCents);
      await logReview(
        candidate.user_id,
        parseAllRoutReferences(text)[0] ?? null,
        amountCents,
        expectedCents(candidate),
        "missing_reference",
      );
      return {
        level: 2,
        reference,
        amountCents,
        paymentId: candidate.id,
        activated: false,
        reason: "missing_reference",
      };
    }
  }

  // ---- Level 3: nothing to go on. ----
  await logReview(null, reference, amountCents, null, "no_match");
  return { level: 3, reference, amountCents, activated: false, reason: "no_match" };
}

/** Level 1 settlement: money confirmed, badge and alias go live immediately. */
async function activate(payment: PaymentRow, reference: string, amountCents: number | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  await supabaseAdmin
    .from("verification_payments")
    .update({ status: "paid", provider_ref: reference })
    .eq("id", payment.id);

  await supabaseAdmin
    .from("profiles")
    .update({
      is_paid: true,
      is_early_believer: true,
      payment_method: "bank_transfer_automatic",
      tier: payment.tier,
      verified: true,
      status: "active",
      verified_at: new Date().toISOString(),
    })
    .eq("id", payment.user_id);

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_id: payment.user_id,
    admin_email: "system@rout.be",
    action: "AUTO_PAYMENT_VERIFIED",
    target_user_id: payment.user_id,
    target_label: reference,
    notes: `Reference: ${reference} — automatic bank transfer match (level 1, ${
      amountCents === null ? "amount unknown" : `${(amountCents / 100).toFixed(2)} EUR`
    }).`,
  });

  await supabaseAdmin.from("security_events").insert({
    user_id: payment.user_id,
    kind: "verification_activated",
    severity: "info",
    message: `Payment auto-verified from bank e-mail (${reference}).`,
    details: { payment_id: payment.id, reference, level: 1, amount_cents: amountCents },
  });

  console.info("[sepa-match] level 1 activated", { paymentId: payment.id, reference });

  try {
    const { notifyUser } = await import("./notifications.server");
    await notifyUser(payment.user_id, "payment_succeeded", { payment_id: payment.id });
  } catch (error) {
    console.error("[sepa-match] notify failed", error);
  }

  try {
    const { drainAliasSyncQueue } = await import("./alias-sync.server");
    await drainAliasSyncQueue(5);
  } catch (error) {
    console.error("[sepa-match] alias drain failed", error);
  }
}

/** Level 2: ask the payer for the missing reference, with a one-click form. */
async function sendIncompletePaymentEmail(payment: PaymentRow, amountCents: number) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(payment.user_id);
    const email = user?.user?.email;
    if (!email) {
      console.warn("[sepa-match] level 2 without recipient", { paymentId: payment.id });
      return;
    }

    const reference = payment.reference_code ?? "";
    const origin = process.env["PUBLIC_SITE_URL"] ?? "https://rout.be";
    const link = `${origin.replace(/\/$/, "")}/dashboard?verification=reference&ref=${encodeURIComponent(
      reference,
    )}`;

    const { sendResendEmail } = await import("./notifications.server");
    const sent = await sendResendEmail({
      to: email,
      subject: "We ontvingen je betaling — één stap ontbreekt nog",
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
        <h1 style="font-size:18px;margin:0 0 12px">Je betaling is binnen, maar zonder referentie</h1>
        <p style="font-size:14px;line-height:1.6;margin:0 0 12px">
          We ontvingen een overschrijving van <strong>€${(amountCents / 100)
            .toFixed(2)
            .replace(".", ",")}</strong>, maar de mededeling bevatte geen (geldige) ROUT-referentie.
          Bevestig je referentie zodat we de betaling aan je account kunnen koppelen.
        </p>
        <p style="font-size:14px;margin:0 0 20px">
          Jouw referentie: <strong style="font-family:monospace">${reference}</strong>
        </p>
        <a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600">
          Referentie bevestigen
        </a>
        <p style="font-size:12px;color:#666;margin:20px 0 0">
          Lukt het niet? Antwoord op deze e-mail met je referentie en we koppelen het handmatig.
        </p>
      </div>`,
    });
    console.info("[sepa-match] level 2 incomplete-payment mail", { email, sent });
  } catch (error) {
    console.error("[sepa-match] level 2 mail failed", error);
  }
}

/** Level 2/3 bookkeeping: shows up in the admin dashboard as "Review required". */
async function logReview(
  userId: string | null,
  reference: string | null,
  amountCents: number | null,
  expected: number | null,
  reason: string,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: userId ?? "00000000-0000-0000-0000-000000000000",
      admin_email: "system@rout.be",
      action: "PAYMENT_REVIEW_REQUIRED",
      target_user_id: userId,
      target_label: reference ?? "unknown",
      notes: `Review required (${reason}) — received ${
        amountCents === null ? "unknown amount" : `${(amountCents / 100).toFixed(2)} EUR`
      }${expected === null ? "" : `, expected ${(expected / 100).toFixed(2)} EUR`}.`,
    });
    console.warn("[sepa-match] review required", { reason, reference, amountCents, expected });
  } catch (error) {
    console.error("[sepa-match] review log failed", error);
  }
}
