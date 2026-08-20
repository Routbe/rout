import { useEffect, useState } from "react";
import { useParams, Link } from "@/lib/router-compat";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Status = "resolving" | "not_found" | "disabled" | "expired" | "suspended" | "error";

const MESSAGES: Record<Exclude<Status, "resolving">, { title: string; body: string }> = {
  not_found: {
    title: "Deze link bestaat niet",
    body: "De korte code klopt niet of is verwijderd.",
  },
  disabled: {
    title: "Deze link staat uit",
    body: "De eigenaar heeft deze link tijdelijk gepauzeerd.",
  },
  expired: {
    title: "Deze link is verlopen",
    body: "De geldigheidsduur van deze link is voorbij.",
  },
  suspended: {
    title: "Deze link is opgeschort",
    body: "Deze link is tijdelijk geblokkeerd.",
  },
  error: {
    title: "Er ging iets mis",
    body: "We konden deze link nu niet openen. Probeer het zo opnieuw.",
  },
};

function device(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|kindle|playbook|silk/.test(ua)) return "tablet";
  if (/mobi|iphone|android|phone|ipod|blackberry|opera mini/.test(ua)) return "mobile";
  return "desktop";
}

/**
 * Public resolver for both QR redirects and short links (`/s/:slug`).
 *
 * The lookup runs through a database function so the links table stays fully
 * locked down — visitors can only ever resolve the exact code they hold.
 */
export default function ShortLink() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<Status>("resolving");

  useEffect(() => {
    if (!slug) {
      setStatus("not_found");
      return;
    }
    let active = true;

    void (async () => {
      const { data, error } = await supabase.rpc("resolve_short_link", { _slug: slug });
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : null;

      if (error || !row) {
        setStatus(error ? "error" : "not_found");
        return;
      }
      if (row.status !== "ok" || !row.target_url) {
        setStatus((row.status as Status) ?? "error");
        return;
      }

      // Count the visit, but never let logging delay the redirect.
      void supabase.rpc("log_qr_scan", {
        _tracked_qr_id: row.id,
        _device: device(),
        _country: null,
        _user_agent: navigator.userAgent.slice(0, 500),
      } as never);

      window.location.replace(row.target_url);
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  if (status === "resolving") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Je wordt doorgestuurd…
        </p>
      </div>
    );
  }

  const message = MESSAGES[status];
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-foreground">{message.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message.body}</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Naar ROUT
        </Link>
      </div>
    </div>
  );
}
