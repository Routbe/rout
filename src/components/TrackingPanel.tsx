import { errorMessage } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Check, BarChart3, Loader2, X, ExternalLink, Globe, Link2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { QRType } from "./QRTypeSelector";
import {
  allocateSlug,
  isSlugAvailable,
  mergeKind,
  normalizeSlug,
  shortLinkBase,
  randomToken,
  shortLinkUrl,
  validateSlug,
  type QrKind,
} from "@/lib/short-links";

export interface TrackedQR {
  id: string;
  slug: string;
  dashboard_token: string;
  target_type: string;
  target_url: string;
  label: string | null;
  redirect_url: string;
  created_at: string;
  kind?: QrKind;
  custom_domain?: string | null;
}

interface TrackingPanelProps {
  qrType: QRType;
  targetUrl: string; // resolved URL for the current QR (empty if not ready)
  tracked: TrackedQR | null;
  onTrackedChange: (t: TrackedQR | null) => void;
}

const TRACKABLE_TYPES: QRType[] = ["url", "image", "pdf", "mp3", "app"];

function localHistoryKey() {
  return "qr_tracking_history_v1";
}

export function addToHistory(t: TrackedQR) {
  try {
    const raw = localStorage.getItem(localHistoryKey());
    const arr: TrackedQR[] = raw ? JSON.parse(raw) : [];
    const filtered = arr.filter((x) => x.slug !== t.slug);
    filtered.unshift(t);
    localStorage.setItem(localHistoryKey(), JSON.stringify(filtered.slice(0, 50)));
  } catch {
    // ignore
  }
}

function normalizeUrl(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function TrackingPanel({ qrType, targetUrl, tracked, onTrackedChange }: TrackingPanelProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [copyMessage, setCopyMessage] = useState("");

  const [label, setLabel] = useState("");
  // Verified branded domains this user may publish links on.
  const [domains, setDomains] = useState<
    { domain: string; is_default: boolean; status: string; short_links_enabled: boolean }[]
  >([]);
  const [domainChoice, setDomainChoice] = useState<string>("default");
  // Optional vanity code; empty means "give me a random one".
  const [slugInput, setSlugInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      // Every connected domain is listed with its status; only a verified
      // domain with short links switched on can actually be picked.
      const { data } = await supabase
        .from("custom_domains")
        .select("domain, is_default, status, short_links_enabled")
        .order("is_default", { ascending: false });
      if (cancelled || !data) return;
      setDomains(data);
      const preferred = data.find(
        (d) => d.is_default && d.status === "verified" && d.short_links_enabled,
      );
      if (preferred) setDomainChoice(preferred.domain);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Label for the built-in domain (rout.be in production, the preview host otherwise).
  const routHost = shortLinkBase(null).replace(/^https?:\/\//, "") || "rout.be";

  const usableDomain = (d: { status: string; short_links_enabled: boolean }) =>
    d.status === "verified" && d.short_links_enabled;

  const domainStatusLabel = (d: { status: string; short_links_enabled: boolean }) => {
    if (d.status !== "verified") return "niet geverifieerd";
    return d.short_links_enabled ? "actief" : "uitgeschakeld";
  };

  const isTrackable = TRACKABLE_TYPES.includes(qrType);
  const ready = targetUrl.trim().length > 0;

  if (!isTrackable) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
        Tracking is available for URL, image, PDF, MP3 and App links. Wi-Fi, text, email and SMS QRs
        are decoded directly by the scanner and can't be redirected.
      </div>
    );
  }

  const handleCreate = async () => {
    const normalized = normalizeUrl(targetUrl);
    if (!normalized) {
      toast.error("Add a link or upload a file first");
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        toast.error("Sign in to create a trackable short link");
        return;
      }

      // A vanity code is validated and claimed here; otherwise we roll one.
      let slug: string | null;
      if (slugInput.trim()) {
        const check = validateSlug(slugInput);
        if (!check.slug) {
          toast.error(check.error ?? "Ongeldige korte code.");
          return;
        }
        if (!(await isSlugAvailable(check.slug))) {
          toast.error("Deze korte code is al bezet.");
          return;
        }
        slug = check.slug;
      } else {
        slug = await allocateSlug();
      }
      if (!slug) throw new Error("Could not allocate a short code");

      const picked = domains.find((d) => d.domain === domainChoice);
      if (domainChoice !== "default" && (!picked || !usableDomain(picked))) {
        toast.error("Dit domein is nog niet geverifieerd of heeft short links uitstaan.");
        return;
      }
      const custom_domain = domainChoice === "default" ? null : domainChoice;
      const { data, error } = await supabase
        .from("tracked_qrs")
        .insert({
          slug,
          dashboard_token: randomToken(24),
          target_type: qrType,
          target_url: normalized,
          label: label || null,
          user_id: user.id,
          custom_domain,
          kind: "qr" satisfies QrKind,
        })
        .select("id, slug, dashboard_token, target_type, target_url, label, custom_domain, kind, created_at")
        .single();

      if (error || !data) throw new Error(error?.message ?? "Failed to create tracked link");

      const t: TrackedQR = {
        ...data,
        kind: (data.kind as QrKind) ?? "qr",
        redirect_url: shortLinkUrl(data.slug, data.custom_domain),
      };
      onTrackedChange(t);
      addToHistory(t);
      setSlugInput("");
      toast.success("Trackable QR ready");
    } catch (e: unknown) {
      console.error(e);
      toast.error(errorMessage(e, "Failed to create tracked link"));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Promote a tracked QR to a shareable short link. Same row, same stats — the
   * only thing that changes is that the owner now uses the URL directly too.
   */
  const handleMakeShortLink = async () => {
    if (!tracked) return;
    setLoading(true);
    try {
      const nextKind = mergeKind(tracked.kind ?? "qr", "link");
      const { error } = await supabase
        .from("tracked_qrs")
        .update({ kind: nextKind, short_link_enabled: true })
        .eq("id", tracked.id);
      if (error) throw new Error(error.message);
      onTrackedChange({ ...tracked, kind: nextKind });
      await copy(tracked.redirect_url, "Short link gekopieerd");
    } catch (e: unknown) {
      console.error(e);
      toast.error(errorMessage(e, "Kon geen short link maken"));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    onTrackedChange(null);
    setLabel("");
  };

  /**
   * Copy with an accessible outcome: the result is mirrored in a polite live
   * region so screen readers announce it, and a failure keeps a retry visible
   * instead of vanishing with the toast.
   */
  const copy = async (v: string, msg: string) => {
    setCopyState("busy");
    setCopyMessage("Bezig met kopiëren…");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(v);
      setCopied(true);
      setCopyState("done");
      setCopyMessage(msg);
      setTimeout(() => {
        setCopied(false);
        setCopyState("idle");
        setCopyMessage("");
      }, 2500);
      toast.success(msg);
    } catch {
      setCopyState("error");
      setCopyMessage("Kopiëren mislukt — selecteer de link hierboven en kopieer handmatig.");
      toast.error("Kopiëren mislukt");
    }
  };



  if (tracked) {
    const statsPath = `/stats/${tracked.dashboard_token}`;
    const statsUrl = `${window.location.origin}${statsPath}`;
    return (
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-foreground" />
            <span className="text-sm font-medium">Tracking enabled</span>
          </div>
          <button
            onClick={handleRemove}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Remove
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor="short-link-value" className="block text-xs text-muted-foreground">
            Short link (encoded in QR)
          </label>
          <div className="flex gap-2">
            <Input
              id="short-link-value"
              readOnly
              value={tracked.redirect_url}
              className="h-10 text-xs font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => copy(tracked.redirect_url, "Short link gekopieerd")}
              aria-label="Kopieer short link"
            >
              <Copy className="w-4 h-4" aria-hidden />
            </Button>
          </div>
          {/* Primary, unmissable copy action with an inline confirmation. */}
          <Button
            type="button"
            className="mt-2 h-10 w-full text-xs font-semibold"
            disabled={copyState === "busy"}
            aria-describedby="short-link-copy-status"
            onClick={() => copy(tracked.redirect_url, "Short link gekopieerd")}
          >
            {copyState === "busy" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden /> Kopiëren…
              </>
            ) : copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5" aria-hidden /> Gekopieerd naar klembord
              </>
            ) : copyState === "error" ? (
              <>
                <Copy className="w-3.5 h-3.5 mr-1.5" aria-hidden /> Opnieuw proberen
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1.5" aria-hidden /> Kopieer short link
              </>
            )}
          </Button>
          {/* Announced by screen readers; also visible for sighted keyboard users. */}
          <p
            id="short-link-copy-status"
            role="status"
            aria-live="polite"
            className={`min-h-[1rem] text-[11px] ${
              copyState === "error" ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {copyMessage}
          </p>

          {tracked.kind === "qr" ? (
            <Button
              type="button"
              variant="outline"
              className="w-full h-9 mt-2 text-xs"
              disabled={loading}
              onClick={handleMakeShortLink}
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5" /> Ook als short link delen
            </Button>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Gedeeld als short link — scans en klikken tellen samen op.
            </p>
          )}
        </div>




        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Private stats link (save it!)</p>
          <div className="flex gap-2">
            <Input readOnly value={statsUrl} className="h-10 text-xs font-mono" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => copy(statsUrl, "Stats link copied")}
              aria-label="Copy stats link"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Anyone with this link can view scan stats. There's no way to recover it if lost.
          </p>
        </div>

        <RouterLink
          to={statsPath}
          className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
        >
          Open dashboard <ExternalLink className="w-3.5 h-3.5" />
        </RouterLink>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-foreground" />
        <span className="text-sm font-medium">Track scans</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Route this QR through a short link so we can count every scan. You'll get a private stats
        dashboard.
      </p>
      <Input
        placeholder="Label (optional, e.g. 'Poster v1')"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="h-10"
      />
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> Short link domain
        </p>
        <Select value={domainChoice} onValueChange={setDomainChoice}>
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{routHost} (standaard)</SelectItem>
            {domains.map((d) => (
              <SelectItem key={d.domain} value={d.domain} disabled={!usableDomain(d)}>
                <span className="flex items-center gap-2">
                  <span>{d.domain}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {domainStatusLabel(d)}
                    {d.is_default && usableDomain(d) ? " · standaard" : ""}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {domains.length > 0 && !domains.some(usableDomain) && (
          <p className="text-[11px] text-muted-foreground">
            Je domeinen zijn nog niet klaar voor short links.{" "}
            <RouterLink to="/domains" className="underline hover:text-foreground">
              Beheer domeinen
            </RouterLink>
          </p>
        )}
        {domains.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Eigen domein gebruiken?{" "}
            <RouterLink to="/domains" className="underline hover:text-foreground">
              Koppel een domein
            </RouterLink>{" "}
            en zet short links daar aan.
          </p>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> Custom code (optional)
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground shrink-0">
            {shortLinkBase(domainChoice === "default" ? null : domainChoice).replace(/^https?:\/\//, "")}/s/
          </span>
          <Input
            placeholder="my-poster"
            value={slugInput}
            onChange={(e) => setSlugInput(normalizeSlug(e.target.value))}
            className="h-10 font-mono text-xs"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">Leave empty for a random code.</p>
      </div>

      <Button
        type="button"
        onClick={handleCreate}
        disabled={!ready || loading}
        className="w-full h-10"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Short link + trackable QR maken"}
      </Button>
      {!ready && (
        <p className="text-[11px] text-muted-foreground">
          Add a link or upload a file to enable tracking.
        </p>
      )}
    </div>
  );
}
