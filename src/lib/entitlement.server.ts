/**
 * Server-only entitlement helpers: one source of truth for "may this account
 * use paid features (custom domains, subdomains, Bluesky, e-mail alias)?".
 */

import { isEntitledProfile } from "./entitlement-rules";

export type Entitlement = {
  entitled: boolean;
  verified: boolean;
  isPaid: boolean;
  isEarlyBeliever: boolean;
  status: string;
  username: string | null;
  legalName: string | null;
};

export async function loadEntitlement(userId: string): Promise<Entitlement> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(
      "username, verified, is_paid, is_early_believer, status, is_banned, is_suspended, verified_legal_name",
    )
    .eq("id", userId)
    .maybeSingle();

  const entitled = isEntitledProfile(data);

  return {
    entitled,
    verified: Boolean(data?.verified),
    isPaid: Boolean(data?.is_paid),
    isEarlyBeliever: Boolean(data?.is_early_believer),
    status: data?.status ?? "unknown",
    username: (data?.username as string | null) ?? null,
    legalName: (data?.verified_legal_name as string | null) ?? null,
  };
}

export class NotEntitledError extends Error {
  constructor() {
    super("NOT_ENTITLED: this feature requires an active Early Believer verification.");
    this.name = "NotEntitledError";
  }
}

/** Throws when the caller is not an active paid/verified member. */
export async function assertEntitled(userId: string): Promise<Entitlement> {
  const entitlement = await loadEntitlement(userId);
  if (!entitlement.entitled) throw new NotEntitledError();
  return entitlement;
}

/**
 * Bluesky / atproto handle surfaces additionally require legal verification,
 * because they publish an identity claim under a rout.be subdomain.
 */
export async function assertBlueskyAccess(userId: string): Promise<Entitlement> {
  const entitlement = await assertEntitled(userId);
  if (!entitlement.verified) throw new NotEntitledError();
  return entitlement;
}
