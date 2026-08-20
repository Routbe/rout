import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/routes/u.username";

export const Route = createFileRoute("/u/$username")({
  head: () => ({
    meta: [
      { title: "ROUT" },
      { name: "description", content: "ROUT — QR-codes en korte links met karakter." },
      { property: "og:title", content: "ROUT" },
      { property: "og:description", content: "ROUT — QR-codes en korte links met karakter." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
