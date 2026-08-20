import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

/**
 * Progressive profiling: passwordless sign-in only ever gives us an e-mail
 * address, so the very first time a member lands with an empty display name we
 * ask for it once — non-blocking, dismissible, and never shown again after it
 * is answered.
 */
export function NameOnboardingDialog() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();
        const existing = (data?.display_name ?? "").trim();
        if (!active || existing) return;
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const guess = typeof meta["full_name"] === "string" ? meta["full_name"] : "";
        setName(guess);
        setOpen(true);
      } catch {
        /* profile unreachable — never block the app on a nicety */
      }
    })();
    return () => {
      active = false;
    };
  }, [user, loading]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!user || value.length < 2) return;
    setSaving(true);
    try {
      await supabase
        .from("profiles")
        .upsert({ id: user.id, display_name: value }, { onConflict: "id" });
      await supabase.auth.updateUser({ data: { full_name: value } });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>What should we call you?</DialogTitle>
          <DialogDescription>
            Your name appears on your public profile and in the e-mails we send you. You can change
            it any time in settings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-name">Name</Label>
            <Input
              id="onboarding-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
              autoFocus
              maxLength={80}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Not now
            </button>
            <Button type="submit" disabled={saving || name.trim().length < 2}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
