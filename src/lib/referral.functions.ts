import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Binds the signed-in member to the handle that invited them. The database
 * owns the rules (one inviter per member, no self-referral, counter bump and
 * milestone badges), so this is a thin, authenticated pass-through.
 */
export const claimReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const handle = String((data as { referrer?: unknown })?.referrer ?? "")
      .replace(/^@/, "")
      .toLowerCase()
      .trim();
    if (!/^[a-z0-9](?:[a-z0-9._-]{0,118}[a-z0-9])?$/.test(handle)) {
      throw new Error("Invalid referrer handle");
    }
    return { referrer: handle };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("claim_referral" as never, {
      p_referrer: data.referrer,
    } as never);
    // A duplicate or self-referral is a no-op, never a user-visible failure.
    if (error) return { ok: false as const, reason: error.message };
    return { ok: true as const };
  });
