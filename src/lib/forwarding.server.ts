/**
 * Server-only "Forward to" double opt-in.
 *
 * Setting a forwarding address never activates mail forwarding on its own: the
 * address is stored as unconfirmed together with a single-use token, and the
 * ImprovMX alias is only (re)provisioned once the owner clicks the confirmation
 * link from that inbox.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export type ForwardingState = {
  email: string | null;
  verified: boolean;
  pending: boolean;
  alias: string | null;
};

function token(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export async function readForwardingState(userId: string): Promise<ForwardingState> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("username, forwarding_email, forwarding_email_verified, forwarding_email_token")
    .eq("id", userId)
    .maybeSingle();

  const email = (data?.forwarding_email as string | null) ?? null;
  const verified = Boolean(data?.forwarding_email_verified);
  return {
    email,
    verified,
    pending: Boolean(email) && !verified && Boolean(data?.forwarding_email_token),
    alias: data?.username ? `${data.username}@rout.be` : null,
  };
}

/** Visible sender for every ROUT system mail (read per request, not at module scope). */
function emailFrom(): string {
  return process.env["EMAIL_FROM"] ?? "ROUT <noreply@rout.be>";
}

export type DeliveryResult = { sent: boolean; error?: string };

function confirmationHtml(url: string): string {
  return [
    "<p>Confirm that this inbox should receive mail from your ROUT alias.</p>",
    `<p><a href="${url}">Confirm this address</a></p>`,
    "<p>This link expires in 24 hours. If you did not request it, ignore this e-mail.</p>",
  ].join("");
}

/**
 * Sends the double opt-in link. Resend is the primary sender (its domain
 * rout.be carries the SPF/DKIM records); the Lovable mail API is used when a
 * sender domain is configured there instead. When neither is configured the
 * call reports the reason instead of throwing — the token stays valid and the
 * UI surfaces a copyable fallback link.
 */
async function sendConfirmationEmail(to: string, url: string): Promise<DeliveryResult> {
  const resendKey = process.env["RESEND_API_KEY"];
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: emailFrom(),
          to: [to],
          subject: "Confirm your ROUT forwarding address",
          html: confirmationHtml(url),
        }),
      });
      if (res.ok) return { sent: true };
      const body = (await res.text()).slice(0, 300);
      return { sent: false, error: `Mail provider refused the message (${res.status}): ${body}` };
    } catch (error) {
      return {
        sent: false,
        error: error instanceof Error ? error.message : "Could not reach the mail provider.",
      };
    }
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  const sender = process.env["LOVABLE_EMAIL_SENDER_DOMAIN"];
  if (!apiKey || !sender) {
    return { sent: false, error: "No e-mail sender is configured for this deployment yet." };
  }
  try {
    const res = await fetch("https://api.lovable.dev/email/v1/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `ROUT <noreply@${sender}>`,
        to,
        subject: "Confirm your ROUT forwarding address",
        html: confirmationHtml(url),
      }),
    });
    if (res.ok) return { sent: true };
    return { sent: false, error: `Mail provider refused the message (${res.status}).` };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Could not reach the mail provider.",
    };
  }
}

export async function requestForwardingConfirmation(
  userId: string,
  rawEmail: string,
  origin: string,
): Promise<{
  ok: boolean;
  sent: boolean;
  reason?: string;
  confirmUrl?: string;
  deliveryError?: string;
}> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, sent: false, reason: "invalid_email" };
  }

  const { assertEntitled } = await import("./entitlement.server");
  await assertEntitled(userId); // throws NotEntitledError for free accounts

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const value = token();

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      forwarding_email: email,
      forwarding_email_verified: false,
      forwarding_email_token: value,
      forwarding_email_token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      // Forwarding is off until the inbox proves ownership.
      alias_status: "pending",
    })
    .eq("id", userId);
  if (error) return { ok: false, sent: false, reason: error.message };

  // Any live alias must stop delivering to the unconfirmed address.
  try {
    const { pauseAlias } = await import("./alias.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    if (data?.username) await pauseAlias(data.username);
  } catch {
    /* ImprovMX is optional — never block the opt-in on it. */
  }

  const confirmUrl = `${origin.replace(/\/$/, "")}/api/public/email/confirm-forward?token=${value}`;
  const delivery = await sendConfirmationEmail(email, confirmUrl);
  return {
    ok: true,
    sent: delivery.sent,
    // On a delivery failure the caller shows the link so the opt-in can still
    // be completed manually instead of silently stalling.
    ...(delivery.sent ? {} : { confirmUrl, deliveryError: delivery.error }),
  };
}

/** Consumes the token, marks the address confirmed and provisions the alias. */
export async function confirmForwardingToken(
  value: string,
): Promise<{ ok: boolean; reason?: string; email?: string }> {
  if (!value || value.length < 20) return { ok: false, reason: "invalid" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, forwarding_email, forwarding_email_token_expires_at")
    .eq("forwarding_email_token", value)
    .maybeSingle();

  if (!profile) return { ok: false, reason: "invalid" };
  const expires = profile.forwarding_email_token_expires_at
    ? Date.parse(profile.forwarding_email_token_expires_at as string)
    : 0;
  if (!expires || expires < Date.now()) return { ok: false, reason: "expired" };

  await supabaseAdmin
    .from("profiles")
    .update({
      forwarding_email_verified: true,
      forwarding_email_token: null,
      forwarding_email_token_expires_at: null,
    })
    .eq("id", profile.id);

  try {
    const { provisionAliasForUser } = await import("./alias.server");
    await provisionAliasForUser(profile.id as string);
  } catch {
    /* alias provisioning is best effort */
  }

  return { ok: true, email: (profile.forwarding_email as string | null) ?? undefined };
}
