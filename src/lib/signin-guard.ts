import { supabase } from "@/integrations/supabase/client";

/**
 * Brute-force protection for sign-in.
 *
 * The server never sees the e-mail address: the browser hashes it (SHA-256,
 * with a fixed application salt) and only that opaque digest is used as the
 * throttle key. No IP address, user agent or e-mail is stored anywhere.
 */
const SALT = "rout:signin-guard:v1";

async function identityHash(email: string): Promise<string | null> {
  const value = email.trim().toLowerCase();
  if (!value || typeof crypto === "undefined" || !crypto.subtle) return null;
  const bytes = new TextEncoder().encode(`${SALT}|${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type GuardState = { locked: boolean; retryAfter: number };

const unlocked: GuardState = { locked: false, retryAfter: 0 };

function parse(data: unknown): GuardState {
  const row = data as { locked?: boolean; retry_after?: number } | null;
  if (!row?.locked) return unlocked;
  return { locked: true, retryAfter: Math.max(1, Number(row.retry_after) || 60) };
}

/** Call before attempting a sign-in; returns the current lock-out state. */
export async function checkSigninGuard(email: string): Promise<GuardState> {
  const hash = await identityHash(email);
  if (!hash) return unlocked;
  try {
    const { data } = await supabase.rpc("signin_guard_status", { _identity_hash: hash } as never);
    return parse(data);
  } catch {
    return unlocked;
  }
}

/** Call after every sign-in attempt so failures accumulate towards a lock-out. */
export async function recordSigninAttempt(email: string, success: boolean): Promise<GuardState> {
  const hash = await identityHash(email);
  if (!hash) return unlocked;
  try {
    const { data } = await supabase.rpc("signin_guard_record", {
      _identity_hash: hash,
      _success: success,
    } as never);
    return parse(data);
  } catch {
    return unlocked;
  }
}

/** Human-readable wait time for a lock-out. */
export function lockoutMessage(retryAfter: number): string {
  const minutes = Math.ceil(retryAfter / 60);
  return retryAfter < 60
    ? `Te veel pogingen. Probeer opnieuw over ${retryAfter} seconden.`
    : `Te veel pogingen. Probeer opnieuw over ${minutes} ${minutes === 1 ? "minuut" : "minuten"}.`;
}
