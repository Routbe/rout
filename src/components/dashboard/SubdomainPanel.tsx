import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, XCircle, Zap } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { testAtprotoDid } from "@/lib/subdomain.functions";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/**
 * Wildcard subdomain settings: handle.rout.be either serves the ROUT profile
 * or redirects to Bluesky, with the AT Protocol DID for handle verification.
 * Autosaves in the background — the central Studio save bar covers the rest.
 */
export function SubdomainPanel() {
  const { user } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [target, setTarget] = useState<"rout_profile" | "bluesky">("rout_profile");
  const [did, setDid] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    status: number;
    body: string;
    url: string;
  } | null>(null);
  const runTest = useServerFn(testAtprotoDid);

  const test = async () => {
    if (!username) return toast.error("Claim a handle first.");
    setTesting(true);
    setResult(null);
    try {
      setResult(await runTest({ data: { handle: username } }));
    } catch {
      toast.error("Test failed to run.");
    }
    setTesting(false);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, subdomain_enabled, redirect_target, bluesky_did")
        .eq("id", user.id)
        .maybeSingle();
      if (!data) return;
      setUsername(data.username);
      setEnabled(Boolean(data.subdomain_enabled));
      setTarget(data.redirect_target === "bluesky" ? "bluesky" : "rout_profile");
      setDid(data.bluesky_did ?? "");
      setLoaded(true);
    })();
  }, [user]);

  // Silent autosave whenever the toggle, target or DID change.
  useEffect(() => {
    if (!user || !loaded) return;
    if (target === "bluesky" && !did.trim().startsWith("did:")) return;
    const id = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          subdomain_enabled: enabled,
          redirect_target: target,
          bluesky_did: did.trim() || null,
        })
        .eq("id", user.id);
      setSaving(false);
      if (error) toast.error(error.message);
    }, 800);
    return () => clearTimeout(id);
  }, [user, loaded, enabled, target, did]);

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-medium">Subdomain</h2>
      <p className="text-xs text-muted-foreground">
        {username ? `${username}.rout.be` : "yourhandle.rout.be"} — served through wildcard DNS.
        Choose whether it loads your ROUT profile or redirects to Bluesky.
      </p>

      <dl className="grid gap-2 rounded-xl border border-border p-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className={cn("font-medium", enabled ? "text-foreground" : "text-muted-foreground")}>
            {enabled ? "Enabled" : "Disabled"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Redirect target</dt>
          <dd className="font-medium text-foreground">
            {target === "bluesky" ? "Bluesky" : "ROUT profile"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Bluesky DID</dt>
          <dd className="truncate font-medium text-foreground">{did.trim() || "Not set"}</dd>
        </div>
      </dl>

      <div className="flex items-center justify-between rounded-xl border border-border p-3">
        <span className="text-sm">Enable my subdomain</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable subdomain" />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "rout_profile", label: "ROUT profile" },
            { id: "bluesky", label: "Redirect to Bluesky" },
          ] as const
        ).map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setTarget(o.id)}
            className={cn(
              "h-10 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
              target === o.id ? "border-primary/50 bg-primary/10" : "border-border",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label className="input-label" htmlFor="p-did">
          Bluesky DID{" "}
          <span className="font-normal text-muted-foreground">(for handle verification)</span>
        </label>
        <Input
          id="p-did"
          value={did}
          maxLength={200}
          placeholder="did:plc:…"
          onChange={(e) => setDid(e.target.value)}
          className="input-field h-11 rounded-xl"
        />
        <p className="text-[11px] text-muted-foreground">
          Enter your Bluesky DID (e.g. did:plc:123...) for handle resolution.
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            Served at https://{username ?? "yourhandle"}.rout.be/.well-known/atproto-did
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label="Copy .well-known endpoint"
            onClick={() => {
              void navigator.clipboard.writeText(
                `https://${username ?? "yourhandle"}.rout.be/.well-known/atproto-did`,
              );
              toast.success("Endpoint copied!");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={test}
        disabled={testing}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
      >
        {testing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" aria-hidden />
        )}
        Test .well-known endpoint
      </button>

      {result && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-xl border p-3 text-xs",
            result.ok ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5",
          )}
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              {result.ok ? "DID served correctly" : `No valid DID (HTTP ${result.status})`}
            </p>
            <p className="break-all text-muted-foreground">{result.url}</p>
            {result.body && <p className="break-all text-muted-foreground">{result.body}</p>}
          </div>
        </div>
      )}

      <p aria-live="polite" className="text-center text-[11px] text-muted-foreground">
        {saving ? "Saving…" : "Subdomain settings autosave"}
      </p>
    </section>
  );
}
