/**
 * Configuration self-check for the admin portal.
 *
 * Runs entirely server-side and never throws: a missing secret is a *result*,
 * not a crash, so the deployment checklist keeps rendering even when the
 * backend is half-configured.
 */
export type ChecklistItem = {
  name: string;
  label: string;
  present: boolean;
  required: boolean;
  hint: string;
  /** Only ever a masked fingerprint — never the value itself. */
  preview: string | null;
};

export type DeploymentStatus = {
  items: ChecklistItem[];
  serviceRoleWorks: boolean;
  serviceRoleError: string | null;
  ok: boolean;
  checkedAt: string;
};

function mask(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;
}

export async function getDeploymentStatus(): Promise<DeploymentStatus> {
  const url = process.env["ROUT_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
  const publishable =
    process.env["ROUT_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
  const serviceRole =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["ROUT_SUPABASE_SERVICE_ROLE_KEY"];

  const items: ChecklistItem[] = [
    {
      name: "SUPABASE_URL",
      label: "Project URL",
      present: Boolean(url),
      required: true,
      hint: "Base URL of the Cloud project. Without it every server function fails.",
      preview: mask(url),
    },
    {
      name: "SUPABASE_PUBLISHABLE_KEY",
      label: "Publishable key",
      present: Boolean(publishable),
      required: true,
      hint: "Used for user-scoped reads (RLS applies). Needed by the auth middleware.",
      preview: mask(publishable),
    },
    {
      name: "SUPABASE_SERVICE_ROLE_KEY",
      label: "Service role key",
      present: Boolean(serviceRole),
      required: true,
      hint: "Privileged admin operations: moderation, audit log, exports, alias sync.",
      preview: mask(serviceRole),
    },
    {
      name: "IMPROVMX_API_KEY",
      label: "ImprovMX API key",
      present: Boolean(process.env["IMPROVMX_API_KEY"]),
      required: false,
      hint: "Optional — alias provisioning stays queued until this is set.",
      preview: mask(process.env["IMPROVMX_API_KEY"]),
    },
  ];

  let serviceRoleWorks = false;
  let serviceRoleError: string | null = null;

  if (url && serviceRole) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("admin_audit_log")
        .select("id", { count: "exact", head: true })
        .limit(1);
      if (error) {
        serviceRoleError = error.message;
      } else {
        serviceRoleWorks = true;
      }
    } catch (error) {
      serviceRoleError = error instanceof Error ? error.message : String(error);
    }
  } else {
    serviceRoleError = "SUPABASE_SERVICE_ROLE_KEY is not configured.";
  }

  return {
    items,
    serviceRoleWorks,
    serviceRoleError,
    ok: items.every((i) => !i.required || i.present) && serviceRoleWorks,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Throws a clearly-worded, parseable error when the privileged key is absent,
 * instead of letting the Supabase client blow up somewhere deeper.
 */
export function assertServiceRole() {
  const hasServiceRole =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["ROUT_SUPABASE_SERVICE_ROLE_KEY"];
  const missing = [
    ...(process.env["ROUT_SUPABASE_URL"] ?? process.env["SUPABASE_URL"]
      ? []
      : ["SUPABASE_URL"]),
    ...(hasServiceRole ? [] : ["SUPABASE_SERVICE_ROLE_KEY"]),
  ];
  if (missing.length > 0) {
    throw new Error(
      `MISSING_SECRET: ${missing.join(", ")} not configured. Add it under Cloud → Settings → Secrets.`,
    );
  }
}
