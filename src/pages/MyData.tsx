import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { AlertTriangle, Download, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/** /my-data — one clear place to export everything or delete everything. */
export default function MyData() {
  const { user, loading, signOut } = useAuth();
  const nav = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav("/auth", { replace: true });
  }, [user, loading, nav]);

  if (loading || !user) {
    return (
      <AppLayout title="Mijn gegevens" crumbs={[{ label: "Mijn gegevens" }]}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const exportData = async () => {
    setExporting(true);
    try {
      const [{ data: profile }, { data: saved }, { data: tracked }, { data: badges }] =
        await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          supabase.from("saved_qrs").select("*"),
          supabase.from("tracked_qrs").select("*").eq("user_id", user.id),
          supabase.from("user_badges").select("*").eq("user_id", user.id),
        ]);

      const payload = {
        exported_at: new Date().toISOString(),
        note: "ROUT bewaart geen IP-adressen, user agents of referrers. Scans bevatten enkel een grove toestel-, browser- en OS-omschrijving.",
        account: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          display_name: user.user_metadata?.display_name ?? null,
        },
        profile: profile ?? null,
        saved_qrs: saved ?? [],
        short_links: tracked ?? [],
        badges: badges ?? [],
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rout-mijn-gegevens-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export gedownload");
    } catch {
      toast.error("Export mislukt. Probeer het later opnieuw.");
    } finally {
      setExporting(false);
    }
  };

  const deleteEverything = async () => {
    if (confirmText !== "VERWIJDER") return;
    setDeleting(true);
    try {
      const { data: mine } = await supabase
        .from("tracked_qrs")
        .select("id")
        .eq("user_id", user.id);
      const ids = (mine ?? []).map((r) => r.id);
      if (ids.length) await supabase.from("qr_scans").delete().in("tracked_qr_id", ids);

      await Promise.all([
        supabase.from("saved_qrs").delete().neq("id", ""),
        supabase.from("tracked_qrs").delete().eq("user_id", user.id),
        supabase.from("user_badges").delete().eq("user_id", user.id),
      ]);

      const { error } = await supabase.rpc("delete_account" as never);
      if (error) {
        toast.error(
          "Je gegevens zijn gewist, maar het account zelf kon niet automatisch verwijderd worden. Neem contact op zodat we het afronden.",
        );
      } else {
        toast.success("Account en gegevens verwijderd.");
      }
      await signOut();
      nav("/", { replace: true });
    } catch {
      toast.error("Er ging iets mis bij het verwijderen.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppLayout
      title="Mijn gegevens"
      description="Alles wat we van je bewaren — downloaden of definitief wissen."
      crumbs={[{ label: "Mijn gegevens" }]}
    >
      <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <ShieldCheck className="h-4 w-4" /> Wat we bewaren
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Je account (e-mailadres, weergavenaam) en je publieke profiel.</li>
          <li>Je bewaarde QR-codes en short links.</li>
          <li>
            Per scan enkel een teller met een grove toestel-, browser- en OS-omschrijving — geen
            IP-adres, geen user agent, geen referrer, geen locatie.
          </li>
          <li>Toegekende badges.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Meer details staan in ons <Link to="/privacy" className="underline">privacybeleid</Link>.
        </p>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Download className="h-4 w-4" /> Exporteer je gegevens
        </h2>
        <p className="text-sm text-muted-foreground">
          Eén JSON-bestand met alles wat aan jouw account hangt. Direct in je browser gemaakt.
        </p>
        <Button onClick={exportData} disabled={exporting} className="h-11 w-full gap-1.5 sm:w-auto">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download JSON
        </Button>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-medium text-red-600">
          <AlertTriangle className="h-4 w-4" /> Alles verwijderen
        </h2>
        <p className="text-sm text-muted-foreground">
          Dit wist je account, je profiel, je QR-codes, je short links met hun scantellers en je
          badges. Dit kan niet ongedaan gemaakt worden. Typ{" "}
          <span className="font-mono font-semibold">VERWIJDER</span> om te bevestigen.
        </p>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="VERWIJDER"
          className="h-11 rounded-xl sm:max-w-xs"
        />
        <Button
          onClick={deleteEverything}
          disabled={confirmText !== "VERWIJDER" || deleting}
          className="h-11 w-full gap-1.5 bg-red-600 text-white hover:bg-red-700 sm:w-auto"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Account en gegevens definitief verwijderen
        </Button>
      </section>
    </AppLayout>
  );
}
