import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Check, Loader2, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { checkHandleAvailability } from "@/lib/bootstrap.functions";
import { claimHandle, getMyHandle, getVerifiedHandleOptions } from "@/lib/claim.functions";
import { handleLengthMessage } from "@/lib/handle-rules";
import { hasValidDigitSuffix } from "@/lib/handle-suggestions";
import { HandleOptionPicker, type HandleOption } from "@/components/HandleOptionPicker";
import { notifyError, notifySuccess } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";

type State = { checking: boolean; ok: boolean | null; reason?: string };

/**
 * Flat-UI claim tool: type a handle, get instant availability feedback, claim it.
 * Doubles as the post-confirmation landing page for every auth e-mail.
 */
export default function Claim() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [handle, setHandle] = useState("");
  const [state, setState] = useState<State>({ checking: false, ok: null });
  const [claiming, setClaiming] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [options, setOptions] = useState<HandleOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getMyHandle({})
      .then((r) => active && setCurrent(r.handle))
      .catch(() => undefined);
    supabase
      .from("profiles")
      .select("verified, status, display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setVerified(Boolean(data.verified) && data.status === "active");
      });
    return () => {
      active = false;
    };
  }, [user]);

  const loadOptions = useCallback(async () => {
    setOptionsLoading((prev) => {
      if (!prev) setRegenerating(true);
      return true;
    });
    try {
      const res = await getVerifiedHandleOptions({});
      setOptions(res.options.map((o) => ({ handle: o.handle, status: o.status as HandleOption["status"] })));
    } catch {
      notifyError("Couldn't load handle options", {
        description: "Try again in a moment.",
        key: "claim:load-options",
      });
    } finally {
      setOptionsLoading(false);
      setRegenerating(false);
    }
  }, []);

  // Verified members: load their generated options exactly once per session,
  // not on every render — the effect only re-runs if `verified` flips.
  useEffect(() => {
    if (!user || !verified) return;
    loadOptions();
  }, [user, verified, loadOptions]);

  const onSelectOption = (option: string) => {
    setHandle(option);
    setState({ checking: false, ok: true });
  };

  const onChange = (value: string) => {
    setHandle(value);
    window.clearTimeout(timer.current);
    if (!value.trim()) return setState({ checking: false, ok: null });

    const lengthIssue = handleLengthMessage(value);
    if (lengthIssue) return setState({ checking: false, ok: false, reason: lengthIssue });
    if (!hasValidDigitSuffix(value)) {
      return setState({
        checking: false,
        ok: false,
        reason: "You can add at most 2 or 3 digits at the end of your handle.",
      });
    }

    setState({ checking: true, ok: null });
    timer.current = window.setTimeout(async () => {
      try {
        const res = await checkHandleAvailability({ data: { handle: value } });
        setState({ checking: false, ok: res.ok, reason: res.reason });
      } catch {
        setState({
          checking: false,
          ok: null,
          reason:
            typeof navigator !== "undefined" && navigator.onLine === false
              ? "You appear to be offline — we'll check this handle once you're back online."
              : "We couldn't check this handle right now. Try again in a moment.",
        });
      }
    }, 300);
  };


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      nav(`/auth?mode=signup&redirect=${encodeURIComponent("/claim")}`);
      return;
    }
    setClaiming(true);
    try {
      const res = await claimHandle({ data: { handle } });
      if (!res.ok) {
        setState({ checking: false, ok: false, reason: res.reason });
        notifyError(res.reason ?? "Could not claim this handle.", { key: "claim:submit" });
        return;
      }
      notifySuccess(`rout.be/u/@${res.handle} is yours`);
      nav("/dashboard/routes");
    } catch {
      notifyError("Claiming failed — please try again.", { key: "claim:submit-fail" });
    } finally {
      setClaiming(false);
    }
  };

  const preview = handle.trim().replace(/^@/, "").toLowerCase() || "your.handle";

  return (
    <AppLayout>
      <main className="mx-auto w-full max-w-xl px-4 py-14 sm:py-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Claim your namespace
        </p>
        <h1 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">
          Pick your handle
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          One handle, one identity: your public profile, your short links and your{" "}
          <span className="font-mono">@rout.be</span> alias all live on it.
        </p>

        {current ? (
          <div className="mt-6 border border-border bg-card p-4">
            <p className="text-sm text-foreground">
              You already claimed <span className="font-mono">rout.be/u/@{current}</span>.
            </p>
            <Button className="mt-3 h-10 rounded-lg" onClick={() => nav("/dashboard/routes")}>
              Go to my routes
            </Button>
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-8 space-y-4">
          {verified ? (
            <div className="space-y-2">
              <Label className="text-sm">Handle</Label>
              <HandleOptionPicker
                options={options}
                loading={optionsLoading}
                value={handle.trim().replace(/^@/, "").toLowerCase()}
                onSelect={onSelectOption}
                onRegenerate={loadOptions}
                regenerating={regenerating}
              />
              <p
                aria-live="polite"
                className={`text-xs ${state.ok === false ? "text-destructive" : "text-muted-foreground"}`}
              >
                {state.ok === true
                  ? `rout.be/u/@${preview} is available`
                  : (state.reason ?? "Pick one of the generated options.")}
              </p>
            </div>
          ) : (
          <div className="space-y-2">
            <Label htmlFor="claim-handle" className="text-sm">
              Handle
            </Label>
            <div className="flex items-stretch border border-border bg-card">
              <span className="flex select-none items-center px-3 font-mono text-sm text-muted-foreground">
                rout.be/u/@
              </span>
              <Input
                id="claim-handle"
                value={handle}
                onChange={(e) => onChange(e.target.value)}
                placeholder="jane.doe"
                autoComplete="off"
                aria-invalid={state.ok === false}
                aria-describedby="claim-msg"
                className="h-12 flex-1 rounded-none border-0 bg-transparent font-mono text-base focus-visible:ring-0"
              />
              <span className="flex w-10 items-center justify-center">
                {state.checking ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                ) : state.ok === true ? (
                  <Check className="h-4 w-4 text-accent" aria-hidden />
                ) : state.ok === false ? (
                  <X className="h-4 w-4 text-destructive" aria-hidden />
                ) : null}
              </span>
            </div>
            <p
              id="claim-msg"
              aria-live="polite"
              className={`text-xs ${state.ok === false ? "text-destructive" : "text-muted-foreground"}`}
            >
              {state.checking
                ? "Checking availability…"
                : state.ok === true
                  ? `rout.be/u/@${preview} is available`
                  : (state.reason ?? `rout.be/u/@${preview}`)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              5+ characters are free to claim. You may add 2 or 3 digits at the end.
            </p>
          </div>
          )}

          <Button
            type="submit"
            className="h-12 w-full rounded-lg text-base font-medium"
            disabled={claiming || authLoading || state.ok !== true}
          >
            {claiming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : user ? (
              "Claim this handle"
            ) : (
              "Create account & claim"
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Handles are at least 3 characters and first come, first served.
          </p>

        </form>
      </main>
    </AppLayout>
  );
}
