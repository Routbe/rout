import { RouteErrorFallback, RoutePendingSkeleton } from "@/components/RouteFallbacks";
import { createFileRoute } from "@tanstack/react-router";
import { canonicalLink, canonicalMeta, socialImageMeta } from "@/lib/site";
import { useEffect } from "react";
import Index from "@/pages/Index";
import { useI18n } from "@/lib/i18n";



function EnPage() {
  const { setLocale } = useI18n();
  useEffect(() => {
    setLocale("en");
  }, [setLocale]);
  return <Index />;
}

export default EnPage;
