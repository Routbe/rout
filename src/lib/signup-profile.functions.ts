import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Persists the sign-up form fields (full name, requested handle) that arrived
 * as auth metadata onto the member's profile row. Safe to call repeatedly: it
 * never overwrites a display name or handle that is already set.
 */
export const syncSignupProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const claims = (context.claims ?? {}) as { user_metadata?: Record<string, unknown> };
    const metadata = claims.user_metadata ?? {};
    if (metadata["signup_profile_applied"] === true) {
      return { ok: true as const, applied: false as const };
    }
    const { applySignupProfile } = await import("./signup-profile.server");
    return applySignupProfile(context.supabase, context.userId, metadata);
  });
