/**
 * Short links.
 *
 * A tracked QR and a short link are the same row in `tracked_qrs`: the QR
 * encodes the redirect URL, and the short link *is* that redirect URL shown to
 * humans. `kind` records what the owner made it for:
 *
 *   qr    — created in the studio, only meant to be scanned
 *   link  — created as a short link, no artwork attached
 *   both  — a QR that was later promoted to a shareable short link
 *
 * Resolution always happens on `/s/<slug>` so it can never swallow a public
 * handle route like `/jasper`.
 */
import { supabase } from "@/integrations/supabase/client";

export type QrKind = "qr" | "link" | "both";

export const SHORT_LINK_PATH_PREFIX = "/s";

/** Slug alphabet without look-alike characters (no 0/o/1/l). */
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function randomSlug(length = 7): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function randomToken(length = 24): string {
  return randomSlug(length);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

/** Reserved so a custom slug can never shadow an app path on a branded domain. */
const RESERVED_SLUGS = new Set([
  "s",
  "api",
  "auth",
  "admin",
  "dashboard",
  "settings",
  "studio",
  "batch",
  "stats",
  "claim",
  "contact",
  "docs",
  "hub",
  "card",
  "go",
  "privacy",
  "terms",
  "manifesto",
  "sovereignty",
  "self-hosting",
  "u",
  "r",
  "en",
  "nl",
]);

export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function validateSlug(input: string): { slug: string | null; error: string | null } {
  const slug = normalizeSlug(input);
  if (!slug) return { slug: null, error: "Kies een korte code." };
  if (!SLUG_RE.test(slug)) {
    return { slug: null, error: "Gebruik 2–32 tekens: letters, cijfers of streepjes." };
  }
  if (RESERVED_SLUGS.has(slug)) return { slug: null, error: "Deze code is gereserveerd." };
  return { slug, error: null };
}

export async function isSlugAvailable(slug: string): Promise<boolean> {
  const { data } = await supabase.rpc("resolve_short_link", { _slug: slug });
  const row = Array.isArray(data) ? data[0] : null;
  // Any status other than not_found means the slug is already taken.
  return !row || row.status === "not_found";
}

/** Picks a free random slug; gives up rather than looping forever. */
export async function allocateSlug(): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSlug(7);
    if (await isSlugAvailable(slug)) return slug;
  }
  return null;
}

export function appOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/**
 * Base URL for a link. A branded domain is only used when it is verified *and*
 * the owner left short links switched on for it, so turning the toggle off in
 * the domains page immediately falls back to the ROUT domain.
 */
export function shortLinkBase(domain?: string | null, domainEnabled = true): string {
  if (domain && domainEnabled) return `https://${domain}`;
  return appOrigin();
}

export function shortLinkUrl(
  slug: string,
  domain?: string | null,
  domainEnabled = true,
): string {
  return `${shortLinkBase(domain, domainEnabled)}${SHORT_LINK_PATH_PREFIX}/${slug}`;
}

/** After promoting a QR to a short link (or the other way round). */
export function mergeKind(current: QrKind | string | null, added: QrKind): QrKind {
  if (!current || current === added) return added;
  return "both";
}
