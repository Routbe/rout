import { useEffect, useState } from "react";
import { LayoutDashboard, LogOut, Settings, ChevronDown, ShieldCheck, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useRouterState } from "@tanstack/react-router";
import { Link, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, clearAdminRoleCache } from "@/hooks/useIsAdmin";

/**
 * Account context only. Platform tools live in the burger menu so the two
 * surfaces never duplicate each other.
 */
export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [fullName, setFullName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [tier, setTier] = useState<string>("free");
  const [verified, setVerified] = useState(false);
  const [earlyBeliever, setEarlyBeliever] = useState(false);
  const { isAdmin } = useIsAdmin();

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setFullName(null);
      setUsername(null);
      setTier("free");
      setVerified(false);
      setEarlyBeliever(false);
      return;
    }
    (async () => {
      // Self-scoped RPC: the only way to read private billing columns.
      const { data } = await supabase.rpc("get_my_profile");
      if (cancelled || !data) return;
      setFullName(data.display_name ?? null);
      setUsername(data.username ?? null);
      setTier(data.tier ?? "free");
      setVerified(Boolean(data.verified));
      setEarlyBeliever(Boolean(data.is_early_believer || data.is_paid));
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    // On the auth portal itself the header CTAs are redundant noise.
    if (pathname.startsWith("/auth") || pathname.startsWith("/login")) return null;
    return (
      <div className="flex items-center gap-1.5">
        <Button asChild variant="ghost" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link to="/auth?mode=signup">Sign up</Link>
        </Button>
      </div>
    );
  }

  const name = fullName || user.user_metadata?.full_name || user.email?.split("@")[0] || "Account";
  const displayName = String(name).charAt(0).toUpperCase() + String(name).slice(1);
  const initials = String(name)
    .split(" ")
    .map((s: string) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const handle = username || user.email?.split("@")[0] || "you";
  const tierLabel = earlyBeliever
    ? "Early Believer"
    : verified || tier === "pro"
      ? "Pro"
      : "Free";
  const isPaidTier = tierLabel !== "Free";
  const profilePath = verified || earlyBeliever ? `/@${handle}` : `/u/@${handle}`;

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border pl-1 pr-2 transition-colors hover:bg-secondary"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-[11px] font-medium text-background">
              {initials}
            </span>
            <span className="hidden max-w-[9rem] truncate text-sm sm:inline">{displayName}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72 bg-card">
          <div className="px-2 py-2">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <span
                className={
                  "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase " +
                  (isPaidTier
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground")
                }
              >
                {tierLabel}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => nav("/studio")} className="gap-2">
            <User className="h-4 w-4 shrink-0" aria-hidden />
            <div className="flex flex-col">
              <span>Profile Studio</span>
              <span className="text-[11px] text-muted-foreground">rout.be{profilePath}</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => nav("/dashboard")} className="gap-2">
            <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden /> Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => nav("/settings")} className="gap-2">
            <Settings className="h-4 w-4 shrink-0" aria-hidden /> Account &amp; Security
          </DropdownMenuItem>

          {isAdmin ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => nav("/admin")}
                className="gap-2"
                data-testid="menu-admin"
              >
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden /> Super Admin Portal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => nav("/admin?tab=inbound")} className="gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 opacity-0" aria-hidden /> Inbound payments
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => nav("/admin?tab=audit")} className="gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 opacity-0" aria-hidden /> Audit log
              </DropdownMenuItem>
            </>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 text-red-600"
            onClick={async () => {
              clearAdminRoleCache();
              await signOut();
              nav("/", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden /> Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
