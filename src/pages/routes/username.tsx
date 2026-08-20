import { useEffect } from "react";
import { RouteErrorFallback, RoutePendingSkeleton } from "@/components/RouteFallbacks";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { ProfileMissing, ProfileView } from "@/components/profile/ProfileView";
import { ProfileSuspended } from "@/components/profile/ProfileSuspended";
import { useProfileRecord } from "@/hooks/useProfileRecord";
import { useI18n } from "@/lib/i18n";

/**
 * Clean namespace: `rout.be/<handle>` is reserved for verified members.
 * Unverified handles keep living under `/u/<handle>` so the root namespace
 * never collides with product routes.
 */


function CleanProfile() {
  const { username } = useParams({ from: "/$username" });
  const { t } = useI18n();
  const handle = username.replace(/^@/, "").toLowerCase();
  const { profile, suspended, loading } = useProfileRecord(handle);

  useEffect(() => {
    if (profile) document.title = `${profile.display_name || `@${profile.username}`} — ROUT`;
  }, [profile]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) return <ProfileMissing username={handle} />;

  if (suspended || profile.status === "suspended" || profile.status === "banned") {
    return <ProfileSuspended username={handle} />;
  }

  if (!profile.verified || profile.status !== "active") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <h1 className="font-display text-2xl">{t("profile.ns.title", { handle })}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("profile.ns.body")}</p>
        <Link
          to="/u/$username"
          params={{ username: handle }}
          className="mt-2 text-sm font-medium underline"
        >
          {t("profile.ns.cta", { handle })}
        </Link>
      </div>
    );
  }

  return <ProfileView profile={profile} />;
}

export default CleanProfile;
