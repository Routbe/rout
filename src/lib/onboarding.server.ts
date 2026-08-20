/**
 * Server-only onboarding helpers: handle normalisation, availability checks,
 * name → handle suggestion and the dev-only super-admin bootstrap.
 */

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

export function normalizeHandle(raw: string) {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/** Coarse per-handle throttle (memory-local): at most one probe per 300 ms. */
const lastSeen = new Map<string, number>();
export function throttle(key: string, windowMs = 300) {
  const now = Date.now();
  const prev = lastSeen.get(key);
  if (prev && now - prev < windowMs) return false;
  lastSeen.set(key, now);
  if (lastSeen.size > 5000) lastSeen.clear();
  return true;
}

export type HandleAvailability = { ok: boolean; normalized: string; reason?: string };

export async function isHandleFree(normalized: string): Promise<HandleAvailability> {
  if (!normalized) return { ok: false, normalized, reason: "Pick a handle." };
  if (normalized.length < 3) return { ok: false, normalized, reason: "At least 3 characters." };
  if (normalized.length > 120) return { ok: false, normalized, reason: "Maximum 120 characters." };
  if (!HANDLE_PATTERN.test(normalized)) {
    return {
      ok: false,
      normalized,
      reason: "Use a–z, 0–9, dot, dash or underscore; start and end alphanumeric.",
    };
  }
  if (RESERVED.has(normalized)) {
    return { ok: false, normalized, reason: "This handle is reserved by the platform." };
  }
  // < 3 too short, 3–4 reserved for VIP grants, 5+ open to everyone.
  const { handleRuleMessage } = await import("./handle-rules");
  const lengthIssue = handleRuleMessage(normalized, { tier: "free" });
  if (lengthIssue) {
    return { ok: false, normalized, reason: lengthIssue };
  }


  // Public read: profiles are anon-readable, so the probe uses the publishable
  // key. It must never depend on the service-role key — when that secret is
  // absent the whole signup form would break with "couldn't check this handle".
  const { createClient } = await import("@supabase/supabase-js");
  const url =
    process.env["ROUT_SUPABASE_URL"] ??
    process.env["SUPABASE_URL"] ??
    process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["ROUT_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    // Without a backend we cannot prove the handle is taken; let the DB's own
    // unique constraint be the final arbiter instead of blocking the user.
    return { ok: true, normalized };
  }
  const supabasePublic = createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });

  const { data } = await supabasePublic
    .from("profiles")
    .select("id")
    .ilike("username", normalized)
    .limit(1);

  if ((data ?? []).length > 0) return { ok: false, normalized, reason: "Already taken." };
  return { ok: true, normalized };
}

/** "Jona De Vries" → "jona.devries", then "jona.devries2" … until free. */
export async function suggestFreeHandle(fullName: string) {
  const base =
    normalizeHandle(fullName)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 40) || "rout.user";

  for (let i = 0; i < 25; i += 1) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await isHandleFree(candidate);
    if (res.ok) return candidate;
  }
  return `${base}${Date.now().toString(36).slice(-4)}`;
}
