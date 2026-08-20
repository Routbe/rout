import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoutePendingSkeleton } from "@/components/RouteFallbacks";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

/**
 * Session gate for every signed-in surface. The Supabase session lives in
 * localStorage, so the check has to run client-side; the blocked URL is kept so
 * the user lands back where they intended after signing in.
 */
function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const [state, setState] = useState<"checking" | "in" | "out">("checking");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setState(error || !data.user ? "out" : "in");
    });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (state !== "out") return;
    const redirect = `${location.pathname}${location.searchStr ?? ""}`;
    navigate({ to: "/auth", search: { redirect }, replace: true } as never);
  }, [state, navigate, location.pathname, location.searchStr]);

  if (state !== "in") return <RoutePendingSkeleton />;
  return <Outlet />;
}
