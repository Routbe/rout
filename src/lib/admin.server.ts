/**
 * Server-only admin helpers. Every export here assumes the caller was already
 * proven to hold the `admin` role — the check lives in `admin.functions.ts`.
 */

/** Throws unless the caller holds the admin role (checked as the user, via RLS-safe RPC). */
export async function assertAdminRole(
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin" },
    ) => PromiseLike<{ data: unknown }>;
  },
  userId: string,
) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (data !== true) throw new Error("Forbidden");
}

/** Roles allowed into the VIP short-handle console. */
export const VIP_CONSOLE_ROLES = ["admin", "security"] as const;
export type VipConsoleRole = (typeof VIP_CONSOLE_ROLES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoleClient = { rpc: (fn: any, args: any) => PromiseLike<{ data: unknown; error?: unknown }> };

/**
 * Resolves the caller's VIP console role, verified server-side through the
 * `has_role` security-definer function. Returns `null` when neither the
 * `admin` nor the `security` role is held.
 */
export async function resolveVipConsoleRole(
  supabase: RoleClient,
  userId: string,
): Promise<VipConsoleRole | null> {
  for (const role of VIP_CONSOLE_ROLES) {
    try {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
      if (data === true) return role;
    } catch {
      // `security` may not exist in the app_role enum yet — keep checking.
    }
  }
  return null;
}

/** Hard gate for every VIP panel server function. */
export async function assertVipConsoleRole(
  supabase: RoleClient,
  userId: string,
): Promise<VipConsoleRole> {
  const role = await resolveVipConsoleRole(supabase, userId);
  if (!role) throw new Error("Forbidden");
  return role;
}

export type PendingVerification = {
  paymentId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  username: string | null;
  tier: string;
  method: "sepa" | "card";
  reference: string;
  amountCents: number;
  donationCents: number;
  status: string;
  createdAt: string;
};

export type AdminUserRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  username: string | null;
  verified: boolean;
  tier: string;
};

function shortRef(id: string) {
  return `ROUT-${id.replace(/\D/g, "").slice(0, 4).padEnd(4, "0")}`;
}

/** Payments still awaiting a manual match, newest first. */
export async function fetchPendingVerifications(limit = 100): Promise<PendingVerification[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: payments } = await supabaseAdmin
    .from("verification_payments")
    .select(
      "id, user_id, tier, amount_cents, donation_cents, provider, reference_code, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = payments ?? [];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, username")
    .in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const emails = new Map<string, string | null>();
  for (const id of ids) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(id);
    emails.set(id, data?.user?.email ?? null);
  }

  return rows.map((r) => ({
    paymentId: r.id,
    userId: r.user_id,
    email: emails.get(r.user_id) ?? null,
    displayName: byId.get(r.user_id)?.display_name ?? null,
    username: byId.get(r.user_id)?.username ?? null,
    tier: r.tier,
    method: r.provider === "sepa" ? "sepa" : "card",
    reference: r.reference_code ?? shortRef(r.id),
    amountCents: r.amount_cents,
    donationCents: r.donation_cents ?? 0,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** Flips a payment to paid, grants the badge and records a notification event. */
export async function approvePayment(paymentId: string, adminId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: payment } = await supabaseAdmin
    .from("verification_payments")
    .select("id, user_id, tier, status, reference_code")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return { ok: false as const, reason: "not_found" as const };

  await supabaseAdmin
    .from("verification_payments")
    .update({ status: "paid", provider_ref: `manual:${adminId}` })
    .eq("id", payment.id);

  await supabaseAdmin
    .from("profiles")
    .update({
      tier: payment.tier,
      verified: true,
      status: "active",
      verified_at: new Date().toISOString(),
    })
    .eq("id", payment.user_id);

  await supabaseAdmin.from("security_events").insert({
    user_id: payment.user_id,
    kind: "verification_approved_manually",
    severity: "info",
    message: "Your ROUT verification is live!",
    details: {
      payment_id: payment.id,
      reference: payment.reference_code,
      approved_by: adminId,
      notify: "email",
    },
  });

  await writeAudit({
    adminId,
    action: "payment_approved",
    targetUserId: payment.user_id,
    targetLabel: payment.reference_code,
    notes: `Tier ${payment.tier} granted`,
  });

  return { ok: true as const, userId: payment.user_id };
}

/** Payments stuck in the "incomplete" state (Stripe requires_action / payment_failed). */
export async function fetchIncompletePayments(limit = 100): Promise<PendingVerification[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: payments } = await supabaseAdmin
    .from("verification_payments")
    .select(
      "id, user_id, tier, amount_cents, donation_cents, provider, reference_code, status, created_at",
    )
    .eq("status", "incomplete")
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = payments ?? [];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, username")
    .in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const emails = new Map<string, string | null>();
  for (const id of ids) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(id);
    emails.set(id, data?.user?.email ?? null);
  }

  return rows.map((r) => ({
    paymentId: r.id,
    userId: r.user_id,
    email: emails.get(r.user_id) ?? null,
    displayName: byId.get(r.user_id)?.display_name ?? null,
    username: byId.get(r.user_id)?.username ?? null,
    tier: r.tier,
    method: r.provider === "sepa" ? "sepa" : "card",
    reference: r.reference_code ?? shortRef(r.id),
    amountCents: r.amount_cents,
    donationCents: r.donation_cents ?? 0,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** Resolve an incomplete payment: approve as paid, mark failed, or reset to pending for retry. */
export async function resolveIncompletePayment(
  paymentId: string,
  action: "approve" | "fail" | "retry",
  adminId: string,
  reason?: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: payment } = await supabaseAdmin
    .from("verification_payments")
    .select("id, user_id, tier, status, reference_code")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return { ok: false as const, reason: "not_found" as const };
  if (payment.status !== "incomplete" && payment.status !== "pending") {
    return { ok: false as const, reason: "not_incomplete" as const };
  }

  if (action === "approve") {
    return approvePayment(paymentId, adminId);
  }

  const nextStatus = action === "fail" ? "failed" : "pending";
  await supabaseAdmin
    .from("verification_payments")
    .update({ status: nextStatus, provider_ref: `manual:${adminId}` })
    .eq("id", payment.id);

  await supabaseAdmin.from("security_events").insert({
    user_id: payment.user_id,
    kind: action === "fail" ? "payment_failed_manually" : "payment_retry_manually",
    severity: action === "fail" ? "warning" : "info",
    message:
      action === "fail"
        ? `Verification payment marked failed manually${reason ? `: ${reason}` : ""}.`
        : "Verification payment reset to pending for customer retry.",
    details: {
      payment_id: payment.id,
      reference: payment.reference_code,
      admin_id: adminId,
      ...(reason ? { reason } : {}),
    },
  });

  await writeAudit({
    adminId,
    action: action === "fail" ? "payment_failed_manually" : "payment_retry_manually",
    targetUserId: payment.user_id,
    targetLabel: payment.reference_code,
    notes: reason || `Status set to ${nextStatus}`,
  });

  return { ok: true as const, userId: payment.user_id };
}

/** Looks a user up by e-mail (partial), handle or exact user id. */
export async function searchUsers(query: string): Promise<AdminUserRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const term = query.trim().replace(/^@/, "");
  if (!term) return [];

  const isUuid = /^[0-9a-f-]{36}$/i.test(term);
  const profileQuery = supabaseAdmin
    .from("profiles")
    .select("id, display_name, username, verified, tier");
  const { data: profiles } = isUuid
    ? await profileQuery.eq("id", term)
    : await profileQuery.ilike("username", `%${term}%`).limit(20);

  const found = new Map<string, AdminUserRow>();
  for (const p of profiles ?? []) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(p.id);
    found.set(p.id, {
      userId: p.id,
      email: data?.user?.email ?? null,
      displayName: p.display_name,
      username: p.username,
      verified: Boolean(p.verified),
      tier: p.tier ?? "free",
    });
  }

  // E-mail lookup goes through the auth admin API, then joins the profile.
  if (!isUuid && term.includes("@")) {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of list?.users ?? []) {
      if (!u.email?.toLowerCase().includes(term.toLowerCase()) || found.has(u.id)) continue;
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("display_name, username, verified, tier")
        .eq("id", u.id)
        .maybeSingle();
      found.set(u.id, {
        userId: u.id,
        email: u.email,
        displayName: p?.display_name ?? null,
        username: p?.username ?? null,
        verified: Boolean(p?.verified),
        tier: p?.tier ?? "free",
      });
    }
  }

  return [...found.values()];
}

/** Manual handle assignment + VIP badge toggle. Admin bypasses handle length limits. */
export async function overrideUser(opts: {
  userId: string;
  handle?: string | null;
  verified?: boolean;
  adminId: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const patch: {
    username?: string | null;
    verified?: boolean;
    verified_at?: string | null;
    status?: string;
  } = {};

  if (typeof opts.handle === "string") {
    const handle = opts.handle.trim().replace(/^@/, "");
    patch.username = handle.length > 0 ? handle : null;
  }
  if (typeof opts.verified === "boolean") {
    patch.verified = opts.verified;
    patch.verified_at = opts.verified ? new Date().toISOString() : null;
    if (opts.verified) patch.status = "active";
  }
  if (Object.keys(patch).length === 0) return { ok: true as const };

  const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", opts.userId);
  if (error) return { ok: false as const, reason: error.message };

  await supabaseAdmin.from("security_events").insert({
    user_id: opts.userId,
    kind: "admin_override",
    severity: "warning",
    message: "Profile updated by an administrator.",
    details: { ...patch, admin_id: opts.adminId },
  });

  await writeAudit({
    adminId: opts.adminId,
    action: "profile_override",
    targetUserId: opts.userId,
    targetLabel: patch.username ?? null,
    notes: JSON.stringify(patch),
  });

  return { ok: true as const };
}

/** Append-only trail of every admin action. Never throws — auditing must not block the action. */
export async function writeAudit(entry: {
  adminId: string;
  action: string;
  targetUserId?: string | null;
  targetLabel?: string | null;
  notes?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.getUserById(entry.adminId);
    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: entry.adminId,
      admin_email: data?.user?.email ?? null,
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      target_label: entry.targetLabel ?? null,
      notes: entry.notes ?? null,
    });
  } catch (error) {
    console.error("audit log write failed", error);
  }
}

export type AuditEntry = {
  id: string;
  adminEmail: string | null;
  action: string;
  targetUserId: string | null;
  targetLabel: string | null;
  notes: string | null;
  createdAt: string;
};

export type AuditFilters = {
  adminEmail?: string;
  action?: string;
  from?: string;
  to?: string;
};

/** Newest admin actions first, optionally narrowed by admin, action or date range. */
export async function fetchAuditLog(filters: AuditFilters = {}, limit = 500): Promise<AuditEntry[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("admin_audit_log")
    .select("id, admin_email, action, target_user_id, target_label, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.adminEmail) q = q.ilike("admin_email", `%${filters.adminEmail}%`);
  if (filters.action) q = q.eq("action", filters.action);
  if (filters.from) q = q.gte("created_at", new Date(filters.from).toISOString());
  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    q = q.lte("created_at", to.toISOString());
  }

  const { data } = await q;


  return (data ?? []).map((r) => ({
    id: r.id,
    adminEmail: r.admin_email,
    action: r.action,
    targetUserId: r.target_user_id,
    targetLabel: r.target_label,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

/** Moves a payment through the SEPA lifecycle without granting anything. */
export async function setPaymentStatus(
  paymentId: string,
  status: "pending" | "failed",
  adminId: string,
  reason?: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: payment } = await supabaseAdmin
    .from("verification_payments")
    .select("id, user_id, reference_code, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return { ok: false as const, reason: "not_found" as const };

  const { error } = await supabaseAdmin
    .from("verification_payments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", payment.id);
  if (error) return { ok: false as const, reason: error.message };

  // Only a `paid` payment grants the badge — moving away from paid revokes it.
  if (payment.status === "paid") {
    await supabaseAdmin
      .from("profiles")
      .update({ verified: false, verified_at: null })
      .eq("id", payment.user_id);
  }

  if (status === "failed") {
    await supabaseAdmin.from("security_events").insert({
      user_id: payment.user_id,
      kind: "verification_rejected",
      severity: "warning",
      message: "We could not match your verification payment.",
      details: {
        payment_id: payment.id,
        reference: payment.reference_code,
        reason: reason ?? null,
        notify: "email",
      },
    });
  }

  await writeAudit({
    adminId,
    action: status === "failed" ? "payment_rejected" : "payment_reopened",
    targetUserId: payment.user_id,
    targetLabel: payment.reference_code,
    notes: reason ?? null,
  });

  return { ok: true as const, userId: payment.user_id };
}

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const RESERVED_HANDLES = new Set([
  "admin",
  "api",
  "auth",
  "dashboard",
  "free",
  "rout",
  "settings",
  "studio",
  "support",
]);

export type HandleCheck = { ok: boolean; normalized: string; reason?: string };

/** Live format + uniqueness check used by the admin handle override field. */
export async function checkHandle(handle: string, forUserId?: string): Promise<HandleCheck> {
  const normalized = handle.trim().replace(/^@/, "").toLowerCase();
  if (!normalized) return { ok: false, normalized, reason: "Handle cannot be empty." };
  if (normalized.length > 120) return { ok: false, normalized, reason: "Maximum 120 characters." };
  if (!HANDLE_PATTERN.test(normalized)) {
    return {
      ok: false,
      normalized,
      reason: "Use a–z, 0–9, dot, dash or underscore; must start and end alphanumeric.",
    };
  }
  if (RESERVED_HANDLES.has(normalized)) {
    return { ok: false, normalized, reason: "This handle is reserved by the platform." };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, username")
    .ilike("username", normalized)
    .limit(5);

  const taken = (data ?? []).find((row) => row.id !== forUserId);
  if (taken) return { ok: false, normalized, reason: "Already taken by another account." };

  return { ok: true, normalized };
}
