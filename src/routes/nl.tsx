import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/routes/nl";

export const Route = createFileRoute("/nl")({
  head: () => ({
    meta: [
      { title: "ROUT — QR-codes en korte links met karakter" },
      { name: "description", content: "Ontwerp QR-codes en trackbare korte links. Gratis, privacyvriendelijk en zelf te hosten." },
      { property: "og:title", content: "ROUT — QR-codes en korte links met karakter" },
      { property: "og:description", content: "Ontwerp QR-codes en trackbare korte links. Gratis, privacyvriendelijk en zelf te hosten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
