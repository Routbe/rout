/**
 * WebAuthn / passkey helpers — server only.
 *
 * The generated Supabase types predate the passkey tables (they live in the
 * external ROUT project and are applied by hand via
 * db/manual/20260809_webauthn_passkeys.sql), so table access goes through a
 * narrowly typed escape hatch instead of `any` sprinkled at every call site.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StoredCredential {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  device_label: string | null;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

/** Untyped view of the admin client for the hand-applied passkey tables. */
export function passkeyTables(client: unknown) {
  return client as SupabaseClient;
}

/**
 * Relying-party identity, derived from the live request.
 *
 * Passkeys are bound to a domain: a credential created on rout.be will not be
 * offered on a preview host, which is why this is never hardcoded.
 */
export function relyingParty(origin: string) {
  const url = new URL(origin);
  return { rpID: url.hostname, origin: url.origin, rpName: "ROUT" };
}

export const b64url = {
  encode(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(value: string): Uint8Array {
    const pad = value.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  },
};

/** Best-effort friendly name so the credential list is readable later. */
export function deviceLabelFrom(userAgent: string | null): string {
  const ua = userAgent ?? "";
  if (/iPhone|iPad|iOS/i.test(ua)) return "iPhone or iPad";
  if (/Macintosh|Mac OS/i.test(ua)) return "Mac";
  if (/Android/i.test(ua)) return "Android device";
  if (/Windows/i.test(ua)) return "Windows Hello or security key";
  if (/Linux/i.test(ua)) return "Linux device";
  return "Passkey";
}
