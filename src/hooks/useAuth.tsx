import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SANDBOX_MODE_MESSAGE } from "@/lib/api-secrets";
import { syncSignupProfile } from "@/lib/signup-profile.functions";
import { claimReferral } from "@/lib/referral.functions";
import { clearReferrer, readReferrer } from "@/lib/referral";

/**
 * Moves the sign-up form fields (full name, requested handle) from auth
 * metadata onto the profile row the very first time a member signs in, then
 * marks them as applied so it never runs twice.
 */
async function flushSignupProfile(user: User | null | undefined) {
  if (!user) return;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  if (meta["signup_profile_applied"] === true) return;
  if (!meta["full_name"] && !meta["name"] && !meta["handle"] && !meta["username"]) return;
  try {
    await syncSignupProfile({});
    await supabase.auth.updateUser({ data: { signup_profile_applied: true } });
  } catch {
    /* best-effort: the member can still claim a handle on /claim */
  }
}

/**
 * Binds a freshly signed-in member to whoever invited them via
 * `rout.be/r/<handle>`. The database refuses duplicates and self-referrals, so
 * running this on every sign-in is safe; the local tag is dropped either way.
 */
async function flushReferral(user: User | null | undefined) {
  if (!user) return;
  const referrer = readReferrer();
  if (!referrer) return;
  try {
    await claimReferral({ data: { referrer } });
  } catch {
    /* best-effort — never block sign-in on a referral */
  }
  clearReferrer();
}


interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** False when the backend is unconfigured — the app runs in sandbox mode. */
  available: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  available: true,
  signOut: async () => {},
});

let sandboxWarned = false;

/** Every surface that must never render without a live session. */
const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/domains", "/admin"];


/** True once the backend turned out to be unconfigured — read by dev/admin panels. */
export let sandboxMode = false;

/**
 * A missing backend key must degrade to sandbox mode, never crash the route —
 * and never interrupt normal use with a toast. Sandbox status is surfaced
 * silently inside the developer/admin tabs instead.
 */
function warnSandbox() {
  sandboxMode = true;
  if (sandboxWarned) return;
  sandboxWarned = true;
  if (import.meta.env.DEV) console.info(SANDBOX_MODE_MESSAGE);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
        setSession(s);
        setLoading(false);
        // Only identity transitions matter — TOKEN_REFRESHED fires hourly and
        // INITIAL_SESSION on every mount, both would thrash router and cache.
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
          if (event === "SIGNED_OUT") {
            // Covers an expired/revoked refresh token just as much as a manual
            // sign-out: drop every cached private byte first, then leave the
            // protected surface so no stale dashboard data can flash.
            void queryClient.cancelQueries();
            queryClient.clear();
            void router.invalidate();
            const path = window.location.pathname;
            const isProtected = PROTECTED_PREFIXES.some(
              (p) => path === p || path.startsWith(`${p}/`),
            );
            if (isProtected) {
              void router.navigate({ to: "/auth", search: {}, replace: true } as never);
            }
            return;
          }
          if (event === "SIGNED_IN") void flushSignupProfile(s?.user);
          void router.invalidate();
          void queryClient.invalidateQueries();
        }
      });

      unsubscribe = () => sub.subscription.unsubscribe();
      supabase.auth
        .getSession()
        .then(({ data }) => {
          setSession(data.session);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } catch {
      setAvailable(false);
      setLoading(false);
      warnSandbox();
    }
    return () => unsubscribe?.();
  }, [queryClient, router]);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        available,
        signOut: async () => {
          try {
            // Order matters: stop in-flight requests, drop cached private data,
            // then clear the session so nothing 401s or survives the back button.
            await queryClient.cancelQueries();
            queryClient.clear();
            await supabase.auth.signOut();
          } catch {
            warnSandbox();
          }
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}


export const useAuth = () => useContext(Ctx);
