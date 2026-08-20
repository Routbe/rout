import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/Index";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ROUT — QR codes en korte links met karakter" },
      { name: "description", content: "Maak stijlvolle QR-codes en trackbare korte links. Gratis te gebruiken, privacyvriendelijk en volledig in eigen beheer." },
      { property: "og:title", content: "ROUT — QR codes en korte links met karakter" },
      { property: "og:description", content: "Maak stijlvolle QR-codes en trackbare korte links. Gratis te gebruiken, privacyvriendelijk en volledig in eigen beheer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
