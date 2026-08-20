import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { handleIssue, handleRuleHint, normalizeHandle, profilePath } from "@/lib/profile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProfileForm {
  username: string;
  display_name: string;
  tagline: string;
  bio: string;
  avatar_url: string;
}

interface ShowcaseRow {
  id: string;
  handle: string;
  display_name: string;
  tagline: string;
  link_count: number;
  verified: boolean;
}

interface ReservedRow {
  handle: string;
  label: string | null;
  reason: string;
}

const EMPTY: ProfileForm = {
  username: "",
  display_name: "",
  tagline: "",
  bio: "",
  avatar_url: "",
};

/** Flat panel: solid surface, single hairline border, no shadow, no gradient. */
function Panel({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border border-border bg-card p-4 sm:p-5", className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * /dashboard/profile — minimal profile management. Reads and writes the
 * caller's own `profiles` row only; RLS enforces that server-side, so no
 * user id is trusted from the client beyond the authenticated session.
 */
export default function ProfileSettings() {
  const { user, loading } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [initial, setInitial] = useState<ProfileForm>(EMPTY);
  const [verified, setVerified] = useState(false);
  const [legalName, setLegalName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [showcase, setShowcase] = useState<ShowcaseRow[]>([]);
  const [reserved, setReserved] = useState<ReservedRow[]>([]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const [{ data: profile }, { data: demo }, { data: res }] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, display_name, tagline, bio, avatar_url, verified, verified_legal_name")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("showcase_profiles")
          .select("id, handle, display_name, tagline, link_count, verified")
          .order("sort_order", { ascending: true }),
        supabase.from("reserved_handles").select("handle, label, reason").order("handle"),
      ]);
      if (!alive) return;
      const next: ProfileForm = {
        username: profile?.username ?? "",
        display_name: profile?.display_name ?? "",
        tagline: profile?.tagline ?? "",
        bio: profile?.bio ?? "",
        avatar_url: profile?.avatar_url ?? "",
      };
      setForm(next);
      setInitial(next);
      setVerified(Boolean(profile?.verified));
      setLegalName(
        ((profile as { verified_legal_name?: string | null } | null)?.verified_legal_name ?? null) ||
          null,
      );
      setShowcase((demo ?? []) as ShowcaseRow[]);
      setReserved((res ?? []) as ReservedRow[]);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const handleCtx = useMemo(
    () => ({ tier: (verified ? "verified" : "free") as "verified" | "free", legalName }),
    [verified, legalName],
  );
  const handleError = useMemo(
    () => (form.username ? handleIssue(normalizeHandle(form.username), handleCtx) : null),
    [form.username, handleCtx],
  );
  const dirty = useMemo(
    () => (Object.keys(form) as (keyof ProfileForm)[]).some((k) => form[k] !== initial[k]),
    [form, initial],
  );

  const set = (key: keyof ProfileForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    if (!user || handleError) return;
    setBusy(true);
    const payload = {
      username: normalizeHandle(form.username) || null,
      display_name: form.display_name.trim() || null,
      tagline: form.tagline.trim() || null,
      bio: form.bio.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
    };
    const { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("duplicate") || error.message.includes("unique")
          ? "That handle is already taken."
          : error.message,
      );
      return;
    }
    setInitial({ ...form, username: payload.username ?? "" });
    setForm((f) => ({ ...f, username: payload.username ?? "" }));
    toast.success("Profile saved");
  }

  if (loading || !user || !ready) {
    return (
      <AppLayout title="Profile">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const publicPath = form.username ? profilePath(normalizeHandle(form.username), verified) : null;

  return (
    <AppLayout
      title="Profile"
      description="Your public handle, name and bio. Everything else stays private."
      crumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Profile" }]}
      actions={
        publicPath ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <a href={publicPath} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> View public profile
            </a>
          </Button>
        ) : null
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Panel
            title="Public identity"
            hint="A handle is claimed automatically when you sign up — change it any time."
          >
            <div className="space-y-4">
              <Field label="Handle" htmlFor="handle" error={handleError}>
                <div className="flex items-stretch">
                  <span className="flex select-none items-center border border-r-0 border-border bg-muted px-3 text-sm text-muted-foreground">
                    rout.be/u/@
                  </span>
                  <Input
                    id="handle"
                    value={form.username}
                    onChange={(e) => set("username", e.target.value.toLowerCase())}
                    className="rounded-none"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{handleRuleHint(handleCtx)}</p>
              </Field>

              <Field label="Display name" htmlFor="display_name">
                <Input
                  id="display_name"
                  value={form.display_name}
                  onChange={(e) => set("display_name", e.target.value)}
                  className="rounded-none"
                  placeholder="Studio Noir"
                />
              </Field>

              <Field label="Tagline" htmlFor="tagline">
                <Input
                  id="tagline"
                  value={form.tagline}
                  onChange={(e) => set("tagline", e.target.value)}
                  className="rounded-none"
                  placeholder="Graphic studio · Ghent"
                />
              </Field>

              <Field label="Bio" htmlFor="bio">
                <Textarea
                  id="bio"
                  value={form.bio}
                  onChange={(e) => set("bio", e.target.value)}
                  rows={4}
                  className="rounded-none"
                  placeholder="What people should know in two lines."
                />
              </Field>

              <Field label="Avatar URL" htmlFor="avatar_url">
                <Input
                  id="avatar_url"
                  value={form.avatar_url}
                  onChange={(e) => set("avatar_url", e.target.value)}
                  className="rounded-none"
                  placeholder="https://…"
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button
                  onClick={save}
                  disabled={busy || !dirty || Boolean(handleError)}
                  className="gap-1.5 rounded-none"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save profile
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-none"
                  disabled={!dirty || busy}
                  onClick={() => setForm(initial)}
                >
                  Reset
                </Button>
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {isAdmin ? (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" /> Admin role active
                    </>
                  ) : (
                    <>Role: user</>
                  )}
                </span>
              </div>
            </div>
          </Panel>

          <Panel title="Example profiles" hint="Demo data — how a filled profile list looks.">
            <ul className="divide-y divide-border border border-border">
              {showcase.map((row) => (
                <li
                  key={row.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-background p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.display_name}
                      {row.verified ? (
                        <span className="ml-2 inline-block bg-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent-foreground">
                          verified
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{row.handle} · {row.tagline}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.link_count} links
                  </span>
                </li>
              ))}
              {showcase.length === 0 ? (
                <li className="bg-background p-3 text-xs text-muted-foreground">
                  No example profiles.
                </li>
              ) : null}
            </ul>
          </Panel>
        </div>

        <Panel
          title="Reserved handles"
          hint="These names belong to the platform and can never be claimed."
          className="h-fit"
        >
          <ul className="flex flex-wrap gap-1.5">
            {reserved.map((row) => (
              <li
                key={row.handle}
                title={row.label ?? row.reason}
                className="inline-flex items-center gap-1 border border-border bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                <Lock className="h-3 w-3" />@{row.handle}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Need one of these for a brand?{" "}
            <Link to="/contact" className="underline underline-offset-2">
              Contact us
            </Link>
            .
          </p>
        </Panel>
      </div>
    </AppLayout>
  );
}
