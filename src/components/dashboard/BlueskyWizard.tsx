import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, AtSign, Check, Copy, Loader2, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { resolveBskyHandle } from "@/lib/verification.functions";
import { cn } from "@/lib/utils";

type Health = "idle" | "checking" | "ok" | "fail";

/** Turns any resolve failure into a short, actionable sentence. */
function resolveHint(error: string): string {
  const e = error.toLowerCase();
  if (e.includes("not found") || e.includes("unable to resolve")) {
    return "Bluesky does not know this handle. Check the spelling — it usually ends in .bsky.social.";
  }
  if (e.includes("network") || e.includes("fetch") || e.includes("timeout")) {
    return "The AT Protocol directory did not answer. Wait a moment and retry.";
  }
  return error;
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
          done ? "border-foreground bg-foreground text-background" : "border-border",
        )}
      >
        {done ? <Check className="h-3 w-3" aria-hidden /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

/**
 * Step-by-step Bluesky handle wizard: point the DNS/handle at your ROUT
 * subdomain, resolve the DID through AT Protocol, then health-check the
 * `/.well-known/atproto-did` endpoint that Bluesky will crawl.
 */
export function BlueskyWizard() {
  const { user } = useAuth();
  const resolve = useServerFn(resolveBskyHandle);
  const [handle, setHandle] = useState("");
  const [routHandle, setRoutHandle] = useState("");
  const [did, setDid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health>("idle");
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, bluesky_did")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setRoutHandle(data?.username ?? "");
      setDid(data?.bluesky_did ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const subdomain = `${routHandle || "handle"}.rout.be`;
  const wellKnown = `https://${subdomain}/.well-known/atproto-did`;

  const onResolve = async () => {
    setBusy(true);
    setResolveError(null);
    setAttempts((n) => n + 1);
    try {
      const res = await resolve({ data: { handle } });
      if (res.success) {
        setDid(res.did);
        setResolveError(null);
        toast.success(`DID resolved for @${res.handle}`);
      } else {
        setResolveError(resolveHint(res.error));
        toast.error(res.error);
      }
    } catch (err) {
      setResolveError(
        resolveHint(err instanceof Error ? err.message : "Could not reach the AT Protocol directory."),
      );
      toast.error("Could not resolve that handle right now.");
    } finally {
      setBusy(false);
    }
  };

  const onHealthCheck = async () => {
    setHealth("checking");
    setHealthError(null);
    try {
      const res = await fetch(wellKnown, { cache: "no-store" });
      const body = (await res.text()).trim();
      if (res.ok && body.startsWith("did:")) {
        setHealth("ok");
        return;
      }
      setHealth("fail");
      setHealthError(
        !res.ok
          ? `The endpoint answered ${res.status}. Enable your subdomain in the Subdomain panel, then retry.`
          : "The endpoint answered, but not with a DID. Resolve your DID in step 1 first.",
      );
    } catch {
      setHealth("fail");
      setHealthError(
        "The endpoint could not be reached — DNS for your subdomain may still be propagating. Retry in a few minutes.",
      );
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <AtSign className="h-4 w-4" aria-hidden /> Bluesky handle wizard
      </h2>
      <p className="text-xs text-muted-foreground">
        Use <strong className="font-mono">{subdomain}</strong> as your Bluesky handle — ROUT serves
        the AT Protocol verification record for you.
      </p>

      <ol className="space-y-4">
        <Step n={1} title="Enter your current Bluesky handle" done={Boolean(did)}>
          <div className="flex flex-wrap gap-2">
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourname.bsky.social"
              className="input-field h-10 min-w-0 flex-1 rounded-xl"
              aria-label="Bluesky handle"
            />
            <Button
              type="button"
              className="h-10 rounded-xl"
              disabled={busy || handle.trim().length < 3}
              onClick={onResolve}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Resolve DID
            </Button>
          </div>
          {resolveError && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p role="alert" className="text-xs text-destructive">
                  {resolveError}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-lg text-xs"
                  disabled={busy || handle.trim().length < 3}
                  onClick={onResolve}
                >
                  <RotateCw className="mr-1.5 h-3 w-3" aria-hidden />
                  Retry{attempts > 1 ? ` (${attempts})` : ""}
                </Button>
              </div>
            </div>
          )}
          {did && (
            <p className="break-all font-mono text-[11px] text-muted-foreground">Saved DID: {did}</p>
          )}
        </Step>

        <Step n={2} title="Set the handle in the Bluesky app" done={Boolean(did)}>
          <p className="text-xs text-muted-foreground">
            Bluesky → Settings → Handle → “I have my own domain” and enter{" "}
            <strong className="font-mono">{subdomain}</strong>. Choose the “No DNS Panel” /
            HTTP-file option; ROUT already answers that request.
          </p>
          <div className="flex items-start gap-1.5">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-muted p-2 font-mono text-[11px]">
              {wellKnown}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Copy .well-known endpoint"
              onClick={() => {
                void navigator.clipboard.writeText(wellKnown);
                toast.success("Endpoint copied!");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Step>

        <Step n={3} title="Verify the endpoint is live" done={health === "ok"}>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl"
              disabled={health === "checking"}
              onClick={onHealthCheck}
            >
              {health === "checking" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Run health check
            </Button>
            {health === "ok" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                <Check className="h-3.5 w-3.5" aria-hidden /> Endpoint serves your DID
              </span>
            )}
            {health === "fail" && (
              <span
                role="alert"
                className="inline-flex items-start gap-1 text-xs font-medium text-destructive"
              >
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {healthError ?? "Not reachable yet — resolve your DID and enable your subdomain first."}
              </span>
            )}
          </div>
        </Step>
      </ol>
    </section>
  );
}
