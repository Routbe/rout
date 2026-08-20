/**
 * Wildcard-subdomain routing for *.rout.be.
 *
 * A request to `j.delplanche.rout.be` is resolved from the Host header:
 *  - `/.well-known/atproto-did` is answered by the dedicated route (AT Protocol verification)
 *  - a human visitor either sees the ROUT profile or gets a 302 to Bluesky,
 *    depending on the user's `redirect_target` preference.
 */

const ROOT_DOMAINS = ["rout.be"];
const SYSTEM_SUBDOMAINS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "cdn",
  "static",
  "preview",
  "dev",
]);

export function subdomainFromHost(host: string | null): string | null {
  if (!host) return null;
  const clean = host.split(":")[0].toLowerCase();
  const root = ROOT_DOMAINS.find((d) => clean === d || clean.endsWith(`.${d}`));
  if (!root || clean === root) return null;
  const sub = clean.slice(0, -(root.length + 1));
  if (!sub || SYSTEM_SUBDOMAINS.has(sub)) return null;
  return sub;
}

/** Handle → profile handle. Dots in a subdomain map to hyphens in the handle. */
export const subdomainToHandle = (sub: string) => sub.replace(/\./g, "-");

type SubProfile = {
  username: string | null;
  verified: boolean | null;
  subdomain_enabled: boolean | null;
  redirect_target: string | null;
  bluesky_did: string | null;
};

export async function lookupSubdomainProfile(sub: string): Promise<SubProfile | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("username, verified, subdomain_enabled, redirect_target, bluesky_did")
    .eq("username", subdomainToHandle(sub))
    .maybeSingle();
  return (data as SubProfile | null) ?? null;
}

/** Returns a Response when the request should be handled as a subdomain request. */
export async function handleSubdomainRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const sub = subdomainFromHost(request.headers.get("host"));
  if (!sub) return null;
  if (url.pathname !== "/") return null;

  let profile: SubProfile | null = null;
  try {
    profile = await lookupSubdomainProfile(sub);
  } catch {
    return null;
  }
  if (!profile?.username || !profile.subdomain_enabled) return null;

  const target =
    profile.redirect_target === "bluesky" && profile.bluesky_did
      ? `https://bsky.app/profile/${sub}.rout.be`
      : profile.verified
        ? `${url.origin.replace(`${sub}.`, "")}/@${profile.username}`
        : `${url.origin.replace(`${sub}.`, "")}/u/@${profile.username}`;

  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store" },
  });
}
