/**
 * Server-only notification delivery: one in-app row + one Resend e-mail, both
 * in the member's own language.
 *
 * Never throws: a payment webhook must not fail because a mail bounced.
 */
import {
  NOTIFICATION_SEVERITY,
  asNotificationLocale,
  notificationCopy,
  renderNotificationEmail,
  type NotificationKind,
  type NotificationLocale,
} from "./notification-templates";

const FROM = process.env["EMAIL_FROM"] ?? "ROUT <hallo@rout.be>";

function siteOrigin(): string {
  return process.env["PUBLIC_SITE_URL"] ?? "https://rout.be";
}

interface Recipient {
  email: string | null;
  locale: NotificationLocale;
}

/** Preferred language + e-mail address of a member, service-role read. */
async function resolveRecipient(userId: string): Promise<Recipient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let email: string | null = null;
  let locale: NotificationLocale = "nl";

  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("email, locale, language, forwarding_email" as "*")
      .eq("id", userId)
      .maybeSingle();
    const row = (data ?? null) as Record<string, unknown> | null;
    email = (row?.["email"] as string | null) ?? (row?.["forwarding_email"] as string | null) ?? null;
    locale = asNotificationLocale(row?.["locale"] ?? row?.["language"]);
  } catch {
    /* optional columns — fall back to the auth record below */
  }

  if (!email) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      email = data?.user?.email ?? null;
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      if (meta["locale"] || meta["language"]) {
        locale = asNotificationLocale(meta["locale"] ?? meta["language"]);
      }
    } catch {
      /* no auth admin access — in-app notification still lands */
    }
  }

  return { email, locale };
}

/** Sends one transactional e-mail through Resend. Returns false when skipped. */
export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const key = process.env["RESEND_API_KEY"];
  if (!key) {
    console.error("[resend] RESEND_API_KEY is not configured — e-mail skipped", {
      subject: opts.subject,
    });
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      // The body names the real cause (unverified domain, invalid key, bad
      // address) — log it verbatim so failures are never silent.
      console.error("[resend] send failed", {
        status: res.status,
        from: FROM,
        subject: opts.subject,
        body: await res.text(),
      });
      return false;
    }
    console.info("[resend] sent", { status: res.status, subject: opts.subject });
    return true;
  } catch (error) {
    console.error("resend send failed", error);
    return false;
  }
}

/**
 * Fan-out for one payment/subscription event: in-app row first (that one is
 * cheap and always visible), then the localized e-mail.
 */
export async function notifyUser(
  userId: string,
  kind: NotificationKind,
  details: Record<string, unknown> = {},
): Promise<void> {
  if (!userId) return;
  try {
    const { email, locale } = await resolveRecipient(userId);
    const copy = notificationCopy(kind, locale);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("notifications" as "profiles").insert({
      user_id: userId,
      kind,
      title: copy.title,
      body: copy.body,
      locale,
      severity: NOTIFICATION_SEVERITY[kind],
      details,
    } as never);
    if (error) console.error("notification insert failed", error);

    if (email) {
      await sendResendEmail({
        to: email,
        subject: copy.subject,
        html: renderNotificationEmail(copy, `${siteOrigin()}/dashboard`),
      });
    }
  } catch (error) {
    console.error("notifyUser failed", kind, error);
  }
}
