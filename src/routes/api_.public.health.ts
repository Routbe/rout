import { createFileRoute } from "@tanstack/react-router";

/**
 * Public health probe used by the status widget in the footer.
 *
 * Deliberately privacy-clean: nothing about the caller is read, stored or
 * logged — the handler only reports whether the app can reach its own
 * database and how long that round-trip took.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        let status: "operational" | "degraded" = "operational";

        try {
          const url = process.env["SUPABASE_URL"];
          const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
          if (url && key) {
            const res = await fetch(`${url}/auth/v1/health`, {
              headers: { apikey: key },
            });
            if (!res.ok) status = "degraded";
          }
        } catch {
          status = "degraded";
        }

        return Response.json(
          { status, latency_ms: Date.now() - started },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
