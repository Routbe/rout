import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Where a customer's domain must point for links to resolve. */
export const DOMAIN_CNAME_TARGET = "links.rout.app";
export const DOMAIN_A_TARGET = "185.158.133.1";

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(4)
  .max(253)
  .regex(
    /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/,
    "Enter a bare hostname such as links.yourbrand.com",
  );

/** Register a domain and hand back the DNS records the user has to create. */
export const addCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ domain: domainSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const token = `rout-verify-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const { data: row, error } = await context.supabase
      .from("custom_domains")
      .insert({ user_id: context.userId, domain: data.domain, verification_token: token })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") throw new Error("That domain is already connected.");
      throw new Error(error.message);
    }
    return row;
  });

/** Re-check DNS and flip the domain to verified when both records are live. */
export const verifyCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const { data: row, error } = await context.supabase
      .from("custom_domains")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("Domain not found.");

    const { checkDomainDns } = await import("./domains.server");
    const check = await checkDomainDns(
      row.domain,
      row.verification_token,
      DOMAIN_CNAME_TARGET,
      DOMAIN_A_TARGET,
    );

    const verified = check.txtFound && check.cnameFound;
    const status = verified ? "verified" : check.txtFound ? "pointing" : "pending";

    await context.supabase
      .from("custom_domains")
      .update({
        status,
        last_checked_at: new Date().toISOString(),
        verified_at: verified ? new Date().toISOString() : null,
      })
      .eq("id", row.id);

    return { status, ...check };
  });

/** Exactly one domain can be the default used by new dynamic QRs. */
export const setDefaultDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    await context.supabase
      .from("custom_domains")
      .update({ is_default: false })
      .eq("user_id", context.userId);
    const { error } = await context.supabase
      .from("custom_domains")
      .update({ is_default: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Short links on a branded domain are opt-in per domain. Switching this off
 * leaves existing links intact — they simply fall back to the ROUT domain, so
 * a half-configured domain never breaks a printed QR.
 */
export const setDomainShortLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const { error } = await context.supabase
      .from("custom_domains")
      .update({ short_links_enabled: data.enabled })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const { error } = await context.supabase.from("custom_domains").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCustomDomains = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const { data, error } = await context.supabase
      .from("custom_domains")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });
