import { useEffect, useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { HANDLE_MIN_LENGTH, handleIssue, normalizeHandle, profilePath } from "@/lib/profile";

interface Props {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

/**
 * The QR generator no longer edits profile content: it only picks the
 * @handle the QR points to. All content is managed in /studio.
 */
export function ProfileHubPicker({ values, onChange }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [manual, setManual] = useState("");

  const origin = typeof window === "undefined" ? "https://rout.be" : window.location.origin;
  const host = origin.replace(/^https?:\/\//, "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("username, verified, status")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.username) {
        const isVerified = Boolean(data.verified) && data.status === "active";
        setHandle(data.username);
        setVerified(isVerified);
        onChange("hub_url", `${origin}${profilePath(data.username, isVerified)}`);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const setManualHandle = (raw: string) => {
    const h = normalizeHandle(raw);
    setManual(raw);
    setHandle(h || null);
    setVerified(false);
    onChange("hub_url", h ? `${origin}${profilePath(h, false)}` : "");
  };

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-border">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const shown = handle ?? normalizeHandle(manual);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Social Profile Hub</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose which @handle this QR code opens. Manage your profile content in the Studio.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[13px] text-muted-foreground">@</span>
        <Input
          className="input-field h-11 min-w-0 flex-1 rounded-xl"
          placeholder="yourname"
          maxLength={30}
          minLength={HANDLE_MIN_LENGTH}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={shown ? !!handleIssue(shown) : undefined}
          aria-describedby="hub-handle-help"
          value={manual || handle || ""}
          onChange={(e) => setManualHandle(e.target.value)}
          aria-label="ROUT handle"
        />
        {verified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
      </div>

      {shown && handleIssue(shown) && (
        <p id="hub-handle-help" role="status" className="text-[11px] text-muted-foreground">
          {handleIssue(shown)}
        </p>
      )}

      <div className="rounded-lg bg-muted/50 px-3 py-2">
        <p className="break-all font-mono text-[13px] font-medium text-foreground">
          rout.id/@{shown || "yourname"}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Free profile hosted on rout.id. Custom domains available on Pro.
        </p>
        {!verified && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Free profiles live on the <strong>/u/</strong> namespace. Verify to claim your custom
            handle.
          </p>
        )}
      </div>

      <Link
        to="/studio"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        ⚙ Manage Profile Hub →
      </Link>

      {values.hub_url && (
        <p className="break-all text-[11px] text-muted-foreground">Target: {values.hub_url}</p>
      )}
    </div>
  );
}
