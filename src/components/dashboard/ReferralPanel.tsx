import { useEffect, useState } from "react";
import { Check, Copy, Share2, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { referralUrl } from "@/lib/referral";
import { useI18n } from "@/lib/i18n";

/**
 * Referral hub — the member's personal `rout.be/r/<handle>` link plus a live
 * counter of how many friends signed up through it. The counter is DB truth
 * and updates in place when a new invite lands.
 */
export function ReferralPanel() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [handle, setHandle] = useState<string | null>(null);
  const [invited, setInvited] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () =>
      void supabase
        .from("profiles")
        .select("username, invited_count" as "*")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data) return;
          const row = data as unknown as Record<string, unknown>;
          setHandle(typeof row["username"] === "string" ? row["username"] : null);
          setInvited(Number(row["invited_count"] ?? 0));
        });

    load();
    const channel = supabase
      .channel(`referrals-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  if (!handle) return null;
  const link = referralUrl(handle);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link stays selectable in the field */
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ url: link, title: t("referral.shareTitle") });
        return;
      } catch {
        /* dismissed — fall back to copy */
      }
    }
    void copy();
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{t("referral.title")}</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {t("referral.count", { count: invited })}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{t("referral.body")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={link}
          aria-label={t("referral.title")}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? t("referral.copied") : t("referral.copy")}
        </button>
        <button
          type="button"
          onClick={share}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {t("referral.share")}
        </button>
      </div>
    </section>
  );
}
