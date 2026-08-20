/**
 * Server-only helper that transfers the sign-up form fields (full name and
 * requested handle) from the auth user's metadata onto their profile row.
 *
 * The database trigger only knows how to invent a handle; anything the member
 * actually typed lives in `raw_user_meta_data` and would otherwise be lost.
 * This runs as the signed-in member (RLS: update own profile only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

const RESERVED = new Set([
  "admin",
  "api",
  "auth",
  "dashboard",
  "free",
  "rout",
  "settings",
  "studio",
  "support",
  "hub",
  "go",
  "docs",
]);

function normalizeHandle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^@/, "").toLowerCase();
}

function isUsableHandle(handle: string) {
  return (
    // 3–4 characters are reserved for admin VIP grants: never auto-applied here.
    // Free sign-up tier: 5+ characters AND at least one digit.
    handle.length >= 5 &&
    /[0-9]/.test(handle) &&
    handle.length <= 120 &&
    HANDLE_PATTERN.test(handle) &&
    !RESERVED.has(handle)
  );
}

export type SignupProfileResult = {
  ok: boolean;
  applied: boolean;
  handle?: string | null;
  reason?: string;
};

export async function applySignupProfile(
  // The generated Database type is not needed here; the client is already typed
  // at the call site and we only touch the profiles table.
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  metadata: Record<string, unknown>,
): Promise<SignupProfileResult> {
  const rawName = metadata["full_name"] ?? metadata["name"];
  const fullName = typeof rawName === "string" ? rawName.trim() : "";
  const requested = normalizeHandle(metadata["handle"] ?? metadata["username"]);

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", userId)
    .maybeSingle();

  const patch: Record<string, string> = {};

  if (fullName && !profile?.display_name) patch["display_name"] = fullName;

  if (requested && isUsableHandle(requested) && profile?.username !== requested) {
    const { data: taken } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", requested)
      .maybeSingle();
    if (!taken) patch["username"] = requested;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, applied: false, handle: profile?.username ?? null };
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...patch }, { onConflict: "id" });

  if (error) {
    return { ok: false, applied: false, reason: error.message };
  }

  return { ok: true, applied: true, handle: patch["username"] ?? profile?.username ?? null };
}
