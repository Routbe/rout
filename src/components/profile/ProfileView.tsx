import { useEffect, useState } from "react";
import { BadgeCheck, Mail } from "lucide-react";
import { blockHref, themeOf, type ProfileRecord } from "@/lib/profile";
import { SocialPlatformIcon } from "@/lib/social-icons";
import { BadgeShowcase } from "@/components/profile/BadgeShowcase";
import { VerifiedInfoDialog } from "@/components/profile/VerifiedInfoDialog";
import { useI18n } from "@/lib/i18n";

/** Swaps the browser tab icon for the profile's own favicon (or avatar). */
function useProfileFavicon(url?: string | null) {
  useEffect(() => {
    if (!url || typeof document === "undefined") return;
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = url;
    document.head.appendChild(link);
    return () => link.remove();
  }, [url]);
}

/** Renders a public ROUT link hub for both the /@handle and /u/@handle namespaces. */
export function ProfileView({ profile, free = false }: { profile: ProfileRecord; free?: boolean }) {
  const { t: tr } = useI18n();
  const t = themeOf(profile.theme);
  const blocks = profile.blocks.filter((b) => !b.hidden && b.value.trim());
  const radius = profile.card_style === "pill" ? 999 : 16;
  const earlyBeliever = Boolean(profile.is_early_believer);
  const [showVerifyInfo, setShowVerifyInfo] = useState(false);
  const aliasEmail =
    profile.show_email_publicly && earlyBeliever && profile.username
      ? `${profile.username}@rout.be`
      : null;

  useProfileFavicon(profile.favicon_url ?? profile.avatar_url);

  return (
    <main className="min-h-screen w-full px-4 py-12" style={{ background: t.bg, color: t.text }}>
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name || `@${profile.username}`}
            className="h-20 w-20 rounded-full object-cover"
            style={{ border: `1px solid ${t.border}` }}
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-xl font-medium"
            style={{ background: t.card, border: `1px solid ${t.border}` }}
          >
            {(profile.display_name || profile.username || "R").slice(0, 1).toUpperCase()}
          </div>
        )}

        <h1 className="mt-4 flex items-center gap-1.5 break-words text-center font-display text-2xl">
          {profile.display_name || `@${profile.username}`}
          {profile.verified && (
            <button
              type="button"
              onClick={() => setShowVerifyInfo(true)}
              className="transition-opacity hover:opacity-70"
              aria-label={tr("verifyInfo.open")}
              title={tr("verifyInfo.open")}
            >
              <BadgeCheck className={earlyBeliever ? "h-6 w-6" : "h-5 w-5"} aria-hidden />
            </button>
          )}
        </h1>
        {earlyBeliever && (
          <button
            type="button"
            onClick={() => setShowVerifyInfo(true)}
            className="mt-2 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest transition-opacity hover:opacity-80"
            style={{ border: `1px solid ${t.border}`, color: t.text }}
          >
            <BadgeCheck className="h-3 w-3" aria-hidden /> Early Believer
          </button>
        )}

        <VerifiedInfoDialog
          open={showVerifyInfo}
          onClose={() => setShowVerifyInfo(false)}
          username={profile.username}
          createdAt={profile.created_at ?? null}
          verified={Boolean(profile.verified)}
          earlyBeliever={earlyBeliever}
        />
        <p className="mt-1 text-center text-sm" style={{ color: t.muted }}>
          {free ? "rout.be/u/@" : "@"}
          {profile.username}
        </p>
        {aliasEmail && (
          <a
            href={`mailto:${aliasEmail}`}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
            style={{ border: `1px solid ${t.border}`, color: t.text }}
          >
            <Mail className="h-3.5 w-3.5" aria-hidden /> Contact via {aliasEmail}
          </a>
        )}
        {(profile.bio || profile.tagline) && (
          <p className="mt-3 max-w-sm text-balance text-center text-sm" style={{ color: t.muted }}>
            {profile.bio || profile.tagline}
          </p>
        )}

        <BadgeShowcase userId={profile.id} theme={t} />

        <div className="mt-8 flex w-full flex-col gap-3">
          {blocks.length === 0 && (
            <p className="text-center text-sm" style={{ color: t.muted }}>
              No links yet.
            </p>
          )}
          {blocks.map((b) => (
            <a
              key={b.id}
              href={blockHref(b)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-opacity hover:opacity-80"
              style={{
                borderRadius: radius,
                background: profile.card_style === "solid" ? t.text : t.card,
                color: profile.card_style === "solid" ? t.bg : t.text,
                border: profile.card_style === "bordered" ? `1px solid ${t.border}` : "none",
              }}
            >
              <SocialPlatformIcon
                source={blockHref(b) || b.kind}
                className="h-4 w-4 text-current"
              />
              <span className="min-w-0 flex-1 truncate text-center">{b.label}</span>
              <span className="h-4 w-4 shrink-0" aria-hidden />
            </a>
          ))}
        </div>

        <a
          href="/"
          className="mt-10 text-[11px] uppercase tracking-widest"
          style={{ color: t.muted }}
        >
          Made with ROUT
        </a>
      </div>
    </main>
  );
}

export function ProfileMissing({ username, free }: { username: string; free?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
      <h1 className="font-display text-2xl">@{username} is still available</h1>
      <p className="text-sm text-muted-foreground">
        This handle has not been claimed {free ? "in the community namespace" : "or verified"} yet.
      </p>
      <a href="/auth?mode=signup" className="mt-2 text-sm font-medium underline">
        Claim it on ROUT →
      </a>
    </div>
  );
}
