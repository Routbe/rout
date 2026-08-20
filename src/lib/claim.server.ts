/**
 * Server-only helpers for the /claim flow: reading the caller's current handle
 * and atomically writing a free handle onto their profile.
 */

export async function readMyHandle(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("username, display_name")
    .eq("id", userId)
    .maybeSingle();
  return {
    handle: (data?.username as string | null) ?? null,
    displayName: (data?.display_name as string | null) ?? null,
  };
}

type Profile = { verified: boolean | null; status: string | null; display_name: string | null };

async function loadProfile(userId: string): Promise<Profile> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("verified, status, display_name")
    .eq("id", userId)
    .maybeSingle();
  return {
    verified: data?.verified ?? null,
    status: data?.status ?? null,
    display_name: data?.display_name ?? null,
  };
}

function isVerifiedActive(profile: Profile): boolean {
  return Boolean(profile.verified) && profile.status === "active";
}

/**
 * Checks a batch of candidate handles against `profiles.username` and
 * `reserved_handles` in as few round-trips as possible. Used both to build
 * the picker's availability map and to double-check the final claim.
 */
async function checkAvailabilityBatch(
  candidates: string[],
): Promise<Map<string, "available" | "taken" | "reserved">> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = new Map<string, "available" | "taken" | "reserved">();
  if (candidates.length === 0) return result;

  const [{ data: taken }, { data: reserved }] = await Promise.all([
    supabaseAdmin.from("profiles").select("username").in("username", candidates),
    supabaseAdmin.from("reserved_handles").select("handle").in("handle", candidates),
  ]);

  const takenSet = new Set((taken ?? []).map((r) => (r.username as string).toLowerCase()));
  const reservedSet = new Set((reserved ?? []).map((r) => (r.handle as string).toLowerCase()));

  for (const candidate of candidates) {
    if (reservedSet.has(candidate)) result.set(candidate, "reserved");
    else if (takenSet.has(candidate)) result.set(candidate, "taken");
    else result.set(candidate, "available");
  }
  return result;
}

/**
 * Verified members: generate name-based options server-side (never trust the
 * client's display name) and widen generation until at least `minAvailable`
 * distinct available options exist, or generation is exhausted.
 */
export async function getVerifiedHandleOptionsFor(userId: string, minAvailable = 6) {
  const profile = await loadProfile(userId);
  if (!isVerifiedActive(profile)) {
    return { verified: false as const, options: [] as Array<{ handle: string; status: string }> };
  }
  const { generateHandleOptions, generateWidenedHandleOptions } = await import(
    "./handle-suggestions"
  );

  let limit = 12;
  const MAX_ITERATIONS = 5;
  let candidates = generateHandleOptions(profile.display_name ?? "", limit);
  let availability = await checkAvailabilityBatch(candidates);
  let availableCount = [...availability.values()].filter((v) => v === "available").length;

  for (let i = 0; i < MAX_ITERATIONS && availableCount < minAvailable; i += 1) {
    limit += 20;
    const widened = generateWidenedHandleOptions(profile.display_name ?? "", limit);
    if (widened.length <= candidates.length) break; // generation exhausted
    candidates = widened;
    // eslint-disable-next-line no-await-in-loop
    availability = await checkAvailabilityBatch(candidates);
    availableCount = [...availability.values()].filter((v) => v === "available").length;
  }

  const options = candidates.map((handle) => ({
    handle,
    status: availability.get(handle) ?? "available",
  }));
  return { verified: true as const, options };
}

export async function claimHandleFor(userId: string, raw: string) {
  const { normalizeHandle, isHandleFree } = await import("./onboarding.server");
  const { hasValidDigitSuffix } = await import("./handle-suggestions");
  const normalized = normalizeHandle(raw);
  const profile = await loadProfile(userId);

  if (isVerifiedActive(profile)) {
    // Verified members may only claim a handle that this server would itself
    // generate from their real display name — never trust the client's pick.
    const { generateHandleOptions, generateWidenedHandleOptions } = await import(
      "./handle-suggestions"
    );
    const allowed = new Set([
      ...generateHandleOptions(profile.display_name ?? "", 12),
      ...generateWidenedHandleOptions(profile.display_name ?? "", 80),
    ]);
    if (!allowed.has(normalized)) {
      return {
        ok: false as const,
        handle: normalized,
        reason: "That handle wasn't generated from your name. Pick one of the offered options.",
      };
    }
  } else {
    // Free/unverified members keep the existing length + digit-suffix rules.
    const { handleLengthMessage } = await import("./handle-rules");
    const lengthIssue = handleLengthMessage(normalized);
    if (lengthIssue) {
      return { ok: false as const, handle: normalized, reason: lengthIssue };
    }
    if (!hasValidDigitSuffix(normalized)) {
      return {
        ok: false as const,
        handle: normalized,
        reason: "You can add at most 2 or 3 digits at the end of your handle.",
      };
    }
  }

  const availability = await isHandleFree(normalized);
  if (!availability.ok) {
    return { ok: false as const, handle: normalized, reason: availability.reason };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, username: normalized }, { onConflict: "id" });

  if (error) {
    const taken = /duplicate|unique/i.test(error.message);
    return {
      ok: false as const,
      handle: normalized,
      reason: taken ? "That handle was just claimed by someone else." : error.message,
    };
  }

  return { ok: true as const, handle: normalized };
}
