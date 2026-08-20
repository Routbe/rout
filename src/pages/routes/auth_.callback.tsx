import { useEffect, useState } from "react";
import { RouteErrorFallback, RoutePendingSkeleton } from "@/components/RouteFallbacks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { amIAdmin } from "@/lib/admin.functions";

/**
 * Public OAuth / magic-link landing route.
 *
 * Every auth flow returns here (never straight into a protected route): the
 * Supabase session is hydrated client-side first, and only then does the user
 * get forwarded to /admin or /dashboard.
 */


function AuthCallback() {
  const nav = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    const resolve = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        setFailed(true);
        return;
      }
      let to = "/dashboard";
      try {
        const res = await amIAdmin({});
        if (res.isAdmin) to = "/admin";
      } catch {
        /* not an admin, or the probe failed — keep the dashboard */
      }
      if (active) nav({ to, replace: true });
    };

    void resolve();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void resolve();
    });

    const timer = window.setTimeout(() => active && setFailed(true), 8000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [nav]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        {failed ? (
          <>
            <h1 className="text-lg font-semibold text-foreground">Aanmelden niet afgerond</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              De link is verlopen of al gebruikt. Probeer opnieuw in te loggen.
            </p>
            <button
              onClick={() => nav({ to: "/auth", search: {}, replace: true } as never)}
              className="mt-4 inline-flex items-center justify-center border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Terug naar inloggen
            </button>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Sessie wordt gecontroleerd…
          </p>
        )}
      </div>
    </div>
  );
}

export default AuthCallback;
