import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit.server";

/**
 * Dev-only test email sender. Triggers a real Supabase auth email so the
 * custom HTML templates can be reviewed in an actual mail client.
 *
 * Restricted to admins and rate-limited: this hits Supabase's auth email
 * provider directly, so an unlocked dev route must not become a mail-bomb
 * vector or a way to enumerate accounts.
 *
 * The template → auth-event mapping:
 *   confirmation  → signup link
 *   magic-link    → magic link
 *   recovery      → password recovery
 *   invite        → user invite
 *   email-change  → email change confirmation
 *
 * `reauthentication` has no dedicated `generateLink` type — Supabase only
 * sends that OTP as a side effect of a real re-auth challenge — so it is not
 * sendable from here and returns a clear, actionable error instead.
 */

const TEMPLATE_MAP = {
  "confirmation": "signup",
  "magic-link": "magiclink",
  "recovery": "recovery",
  "invite": "invite",
  "email-change": "email_change_new",
} as const;

const ALL_TEMPLATES = [
  "confirmation",
  "magic-link",
  "recovery",
  "invite",
  "email-change",
  "reauthentication",
] as const;

export type TestTemplate = (typeof ALL_TEMPLATES)[number];
export type SendableTemplate = keyof typeof TEMPLATE_MAP;

/** Realistic sample data for every template, used both for previews and as a reference here. */
export const SAMPLE_DATA: Record<TestTemplate, Record<string, string>> = {
  confirmation: {
    Token: "482913",
    ConfirmationURL: "https://rout.be/auth/confirm?token=pkce_a1b2c3d4e5f6&type=signup",
    SiteURL: "https://rout.be",
    Email: "jasper.devries@voorbeeld.be",
  },
  "magic-link": {
    Token: "482913",
    ConfirmationURL: "https://rout.be/auth/confirm?token=pkce_9f8e7d6c5b4a&type=magiclink",
    SiteURL: "https://rout.be",
    Email: "jasper.devries@voorbeeld.be",
  },
  recovery: {
    Token: "482913",
    ConfirmationURL: "https://rout.be/auth/confirm?token=pkce_4c3b2a1f0e9d&type=recovery",
    SiteURL: "https://rout.be",
    Email: "jasper.devries@voorbeeld.be",
  },
  invite: {
    Token: "482913",
    ConfirmationURL: "https://rout.be/auth/confirm?token=pkce_7a6b5c4d3e2f&type=invite",
    SiteURL: "https://rout.be",
    Email: "nieuwe.gebruiker@voorbeeld.be",
  },
  "email-change": {
    Token: "482913",
    ConfirmationURL: "https://rout.be/auth/confirm?token=pkce_2e1d0c9b8a7f&type=email_change",
    SiteURL: "https://rout.be",
    Email: "oud@voorbeeld.be",
    NewEmail: "jasper.devries@voorbeeld.be",
  },
  reauthentication: {
    Token: "482913",
    SiteURL: "https://rout.be",
    Email: "jasper.devries@voorbeeld.be",
  },
};

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      template: z.enum(ALL_TEMPLATES),
      email: z.string().email(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.supabase, context.userId);

    // In-memory sliding window, per admin: 5 test mails per 10 minutes. Good
    // enough to stop an accidental loop from the preview page — not a
    // security boundary, see rate-limit.server.ts.
    try {
      enforceRateLimit(`send-test-email:${context.userId}`, 5, 10 * 60 * 1000);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return {
          success: false as const,
          error: error.message,
          rateLimited: true as const,
          retryAfterSeconds: error.retryAfterSeconds,
        };
      }
      throw error;
    }

    if (data.template === "reauthentication") {
      return {
        success: false as const,
        error:
          "reauthentication has no generateLink type in Supabase — it is only sent as a side " +
          "effect of a real re-auth challenge, so it can't be triggered from this dev endpoint. " +
          "Use the preview pane to review the template instead.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const linkType = TEMPLATE_MAP[data.template as SendableTemplate];

    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: linkType,
      email: data.email,
      options: {
        sendEmail: true,
      },
    } as Parameters<typeof supabaseAdmin.auth.admin.generateLink>[0]);

    if (error) {
      return {
        success: false as const,
        error: error.message,
      };
    }

    return {
      success: true as const,
      template: data.template,
      recipient: data.email,
    };
  });
