import { useEffect } from "react";
import { RouteErrorFallback, RoutePendingSkeleton } from "@/components/RouteFallbacks";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { ProfileMissing, ProfileView } from "@/components/profile/ProfileView";
import { ProfileSuspended } from "@/components/profile/ProfileSuspended";
import { useProfileRecord } from "@/hooks/useProfileRecord";




function PublicProfile() {
  const { username } = useParams({ strict: false }) as { username: string };
  const { profile, suspended, loading } = useProfileRecord(username);

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

  if (!profile) {
    return <ProfileMissing username={username} />;
  }

  // Moderation: a suspended profile is never rendered publicly.
  if (suspended || profile.status === "suspended" || profile.status === "banned") {
    return <ProfileSuspended username={username} />;
  }


  // Paid / verified namespace: free profiles live under /u/handle.
  if (!profile.verified || profile.status !== "active") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <h1 className="font-display text-2xl">@{username} is a community profile</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The verified namespace is reserved for verified accounts. This handle lives in the free
          community namespace.
        </p>
        <a href={`/u/${username}`} className="mt-2 text-sm font-medium underline">
          Go to rout.be/u/{username} →
        </a>
      </div>
    );
  }

  return <ProfileView profile={profile} />;
}

export default PublicProfile;
