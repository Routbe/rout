/**
 * Server-only reads for the admin webhook monitor and referral analytics.
 * Service-role access: the monitor table carries raw Stripe payloads and is
 * never exposed to the browser directly.
 */

export interface WebhookEventRow {
  id: string;
  source: string;
  kind: string | null;
  status: string;
  outcome: string | null;
  idempotency_key: string | null;
  attempts: number;
  error: string | null;
  /** Raw event, pre-serialized to JSON text so it crosses the RPC boundary. */
  payload: string | null;
  created_at: string;
  processed_at: string | null;
}

export async function fetchWebhookEvents(opts: {
  limit?: number;
  status?: string | null;
  search?: string | null;
}): Promise<WebhookEventRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("webhook_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500));

  if (opts.status && opts.status !== "all") query = query.eq("status" as "id", opts.status);
  if (opts.search) {
    const term = opts.search.trim();
    if (term) query = query.or(`id.ilike.%${term}%,kind.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("webhook events read failed", error);
    return [];
  }
  return ((data ?? []) as unknown as (Omit<WebhookEventRow, "payload"> & { payload?: unknown })[]).map(
    (row) => ({
      ...row,
      payload: row.payload == null ? null : JSON.stringify(row.payload, null, 2),
    }),
  );
}

/** Aggregated referral funnel for one member: visits, sign-ups, conversion. */
export async function fetchReferralAnalytics(userId: string, handle: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let visits = 0;
  let last: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("referral_visits" as "profiles")
      .select("created_at" as "*")
      .or(
        [
          `inviter_id.eq.${userId}`,
          handle ? `handle.eq.${handle.replace(/^@/, "").toLowerCase()}` : "",
        ]
          .filter(Boolean)
          .join(","),
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    const rows = (data ?? []) as unknown as { created_at: string }[];
    visits = rows.length;
    last = rows[0]?.created_at ?? null;
  } catch {
    /* analytics table not provisioned yet — counts stay at zero */
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("invited_count" as "*")
    .eq("id", userId)
    .maybeSingle();
  const signups = Number((profile as Record<string, unknown> | null)?.["invited_count"] ?? 0);

  return {
    visits,
    signups,
    conversion: visits > 0 ? Math.round((signups / visits) * 1000) / 10 : 0,
    lastVisitAt: last,
  };
}

/**
 * One visit on rout.be/r/<handle>. Best effort — never blocks the redirect.
 * Stores only the inviter handle: no referer, IP, user agent or other metadata.
 */
export async function recordReferralVisit(handle: string) {
  const clean = handle.replace(/^@/, "").toLowerCase();
  if (!clean) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inviter } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", clean)
      .maybeSingle();
    await supabaseAdmin.from("referral_visits" as "profiles").insert({
      handle: clean,
      inviter_id: (inviter?.id as string | undefined) ?? null,
    } as never);
  } catch (error) {
    console.error("referral visit log failed", error);
  }
}
