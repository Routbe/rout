import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/routes/en";

export const Route = createFileRoute("/en")({
  head: () => ({
    meta: [
      { title: "ROUT — QR codes and short links with character" },
      { name: "description", content: "Design QR codes and trackable short links. Free to use, privacy-first and self-hostable." },
      { property: "og:title", content: "ROUT — QR codes and short links with character" },
      { property: "og:description", content: "Design QR codes and trackable short links. Free to use, privacy-first and self-hostable." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
