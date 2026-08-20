/**
 * Server-only badge granting. Grants are idempotent: a replayed Stripe webhook
 * must never hand out a second serial number for the same badge.
 * Serial numbers / rarities live in the database defaults — never set here.
 */

export type BadgeSlug = "early_believer" | "verified" | "founder" | "supporter" | "bluesky";

/** Where a grant came from — shown in the dashboard activity log. */
export type BadgeSource = "card" | "sepa" | "subscription" | "refund" | "referral" | "admin" | "system";

/** Appends one row to the badge activity log. Never throws. */
async function logBadgeEvents(
  userId: string,
  slugs: string[],
  action: "granted" | "revoked",
  source: BadgeSource,
  details: Record<string, unknown> = {},
): Promise<void> {
  if (slugs.length === 0) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("badge_events").insert(
      slugs.map((slug) => ({
        user_id: userId,
        badge_slug: slug,
        action,
        source,
        details: details as never,
      })),
    );
    if (error) console.error("badge event log failed", error);
  } catch (error) {
    console.error("badge event log failed", error);
  }
}

/** Grants badges by slug, skipping ones the user already unlocked. */
export async function awardBadges(
  userId: string,
  slugs: BadgeSlug[],
  source: BadgeSource = "system",
  details: Record<string, unknown> = {},
): Promise<BadgeSlug[]> {
  if (!userId || slugs.length === 0) return [];

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: catalogue } = await supabaseAdmin
      .from("badges")
      .select("id, slug")
      .in("slug", slugs);
    if (!catalogue || catalogue.length === 0) return [];

    const { data: existing } = await supabaseAdmin
      .from("user_badges")
      .select("badge_id")
      .eq("user_id", userId);
    const owned = new Set((existing ?? []).map((row) => row.badge_id as string));

    const pending = catalogue.filter((badge) => !owned.has(badge.id as string));
    if (pending.length === 0) return [];

    const { error } = await supabaseAdmin
      .from("user_badges")
      .insert(pending.map((badge) => ({ user_id: userId, badge_id: badge.id as string })));
    // A unique-violation means a concurrent webhook won the race: not an error.
    if (error && error.code !== "23505") {
      console.error("badge grant failed", error);
      return [];
    }

    const granted = pending.map((badge) => badge.slug as BadgeSlug);
    await logBadgeEvents(userId, granted, "granted", source, details);
    return granted;
  } catch (error) {
    console.error("badge grant failed", error);
    return [];
  }
}

/** Removes badges again (refund / chargeback), leaving unrelated grants intact. */
export async function revokeBadges(
  userId: string,
  slugs: BadgeSlug[],
  source: BadgeSource = "system",
  details: Record<string, unknown> = {},
): Promise<void> {
  if (!userId || slugs.length === 0) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: catalogue } = await supabaseAdmin.from("badges").select("id, slug").in("slug", slugs);
    const rows = catalogue ?? [];
    const ids = rows.map((badge) => badge.id as string);
    if (ids.length === 0) return;

    const { data: owned } = await supabaseAdmin
      .from("user_badges")
      .select("badge_id")
      .eq("user_id", userId)
      .in("badge_id", ids);
    const ownedIds = new Set((owned ?? []).map((row) => row.badge_id as string));

    await supabaseAdmin.from("user_badges").delete().eq("user_id", userId).in("badge_id", ids);

    await logBadgeEvents(
      userId,
      rows.filter((b) => ownedIds.has(b.id as string)).map((b) => b.slug as string),
      "revoked",
      source,
      details,
    );
  } catch (error) {
    console.error("badge revoke failed", error);
  }
}
