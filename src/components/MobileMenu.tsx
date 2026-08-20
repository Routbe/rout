import { useState } from "react";
import {
  Menu,
  QrCode,
  Layers,
  Link2,
  Globe,
  KeyRound,
  BookOpen,
  Palette,
  ShieldCheck,
  ReceiptText,
  ScrollText,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Link } from "@/lib/router-compat";
import type { LucideIcon } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const itemClass =
  "flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-muted/60 transition-colors";

const TOOLS = [
  { to: "/", label: "QR Generator", hint: "Snelle standalone studio", icon: QrCode },
  {
    to: "/studio",
    label: "Profile Hub Studio",
    hint: "Sovereign link-in-bio & micro-site builder",
    icon: Palette,
  },
  { to: "/batch", label: "Batch Engine", hint: "Massa QR-generatie", icon: Layers },
  {
    to: "/dashboard?tab=links",
    label: "Dynamic Links & Analytics",
    hint: "Herleidbare korte links",
    icon: Link2,
  },
] as const;

const INFRASTRUCTURE = [
  { to: "/domains", label: "Custom Domains", hint: "DNS & CNAME configuratie", icon: Globe },
  { to: "/api", label: "API & MCP Endpoints", hint: "Developer hub", icon: KeyRound },
  { to: "/docs", label: "Open Source & Docs", hint: "AGPLv3 & protocol", icon: BookOpen },
] as const;

/** Only rendered for accounts holding the admin role. */
const ADMIN_TOOLS = [
  { to: "/admin", label: "Super Admin Portal", hint: "Moderatie & verificaties", icon: ShieldCheck },
  {
    to: "/admin?tab=inbound",
    label: "Inbound Payments",
    hint: "Bankreferenties & CSV-export",
    icon: ReceiptText,
  },
  { to: "/admin?tab=audit", label: "Audit Log", hint: "Admin-acties & filters", icon: ScrollText },
] as const;

interface NavItem {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

function Section({ title, items }: { title: string; items: readonly NavItem[] }) {
  return (
    <nav className="border-t border-border pt-3">
      <p className="eyebrow px-3 pb-1 pt-1">{title}</p>
      {items.map(({ to, label, hint, icon: Icon }) => (
        <Link key={to} to={to} className={itemClass}>
          <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            {label}
            <span className="block truncate text-xs text-muted-foreground">{hint}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Platform tools & infrastructure only — account links live in the profile popover. */
export function MobileMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { isAdmin } = useIsAdmin();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className={
          className ??
          "h-10 w-10 shrink-0 rounded-xl border border-border flex items-center justify-center transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        }
      >
        <Menu className="h-5 w-5" strokeWidth={1.8} />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-[86vw] max-w-xs flex-col overflow-y-auto bg-background"
      >
        <SheetHeader>
          <SheetTitle className="text-left font-display text-xl">Platform</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3" onClick={() => setOpen(false)}>
          <Section title="Tools" items={TOOLS} />
          <Section title="Infrastructure" items={INFRASTRUCTURE} />
          {isAdmin ? <Section title="Admin" items={ADMIN_TOOLS} /> : null}

          <div
            className="mt-auto flex items-center gap-2 border-t border-border pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
