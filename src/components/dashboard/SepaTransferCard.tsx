import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, ClipboardCopy, Copy, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifySuccess } from "@/lib/notify";
import { SEPA_DETAILS, euro } from "@/lib/profile";
import { buildEpcPayload, sepaClipboardText } from "@/lib/epc-qr";

interface SepaTransferCardProps {
  /** `ROUT-XXXX` reference the bank transfer must carry. */
  reference: string;
  /** Exact amount to transfer, in cents. */
  amountCents: number;
  /** Live payment state, driven by the webhook / admin match. */
  status: "pending" | "processing" | "paid";
}

/**
 * Adaptive SEPA payment surface. Desktop leads with the EPC-QR code (scan it
 * with a banking app and every field is prefilled); mobile leads with a single
 * "Copy details" action, because on a phone the banking app is one paste away.
 */
export function SepaTransferCard({ reference, amountCents, status }: SepaTransferCardProps) {
  const [copied, setCopied] = useState(false);

  const payload = buildEpcPayload({
    beneficiary: SEPA_DETAILS.beneficiary,
    iban: SEPA_DETAILS.iban,
    bic: SEPA_DETAILS.bic,
    amountCents,
    reference,
  });

  const copy = (value: string, what: string) => {
    void navigator.clipboard.writeText(value);
    notifySuccess(`Copied · ${what}`);
  };

  const copyAll = () => {
    void navigator.clipboard.writeText(
      sepaClipboardText({
        beneficiary: SEPA_DETAILS.beneficiary,
        iban: SEPA_DETAILS.iban,
        bic: SEPA_DETAILS.bic,
        amountCents,
        reference,
      }),
    );
    setCopied(true);
    notifySuccess("IBAN, amount and reference copied");
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted p-3 text-[11px]">
      {/* Status indicator — flips to “Verified” the moment the badge lands. */}
      <div
        role="status"
        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
          status === "paid"
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "border-border bg-background text-muted-foreground"
        }`}
      >
        {status === "paid" ? (
          <>
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Geverifieerd
          </>
        ) : (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Betaling in behandeling
          </>
        )}
      </div>

      {/* Desktop: scan-first. */}
      {payload && (
        <div className="hidden flex-col items-center gap-2 rounded-lg border border-border bg-background p-4 sm:flex">
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={payload} size={168} level="M" marginSize={0} />
          </div>
          <p className="text-center text-[11px] font-medium text-foreground">
            Scan deze code met uw bankapp om de betalingsgegevens automatisch in te vullen.
          </p>
          <p className="text-center text-[10px] text-muted-foreground">
            EPC-QR (SEPA-standaard) · {euro(amountCents)} · {reference}
          </p>
        </div>
      )}

      {/* Mobile: one action, straight to the banking app. */}
      <div className="sm:hidden">
        <Button
          type="button"
          className="h-11 w-full rounded-xl text-sm font-semibold"
          onClick={copyAll}
        >
          {copied ? (
            <Check className="mr-2 h-4 w-4" aria-hidden />
          ) : (
            <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden />
          )}
          {copied ? "Gekopieerd" : "Copy details"}
        </Button>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          IBAN, bedrag en referentie in één keer gekopieerd — plak ze in je bankapp.
        </p>
      </div>

      <dl className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <dt className="text-muted-foreground">Beneficiary</dt>
          <dd className="text-right font-semibold">{SEPA_DETAILS.beneficiary}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">IBAN</dt>
          <dd className="flex items-center gap-1.5">
            <span className="font-mono" data-testid="sepa-iban">
              {SEPA_DETAILS.iban}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-lg px-2"
              onClick={() => copy(SEPA_DETAILS.iban.replace(/\s/g, ""), "IBAN")}
            >
              <Copy className="h-3 w-3" />
              <span className="sr-only">Copy IBAN</span>
            </Button>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">BIC / Swift</dt>
          <dd className="font-mono">{SEPA_DETAILS.bic}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Bank</dt>
          <dd className="text-right">
            {SEPA_DETAILS.bank} — {SEPA_DETAILS.country}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="font-semibold tabular-nums" data-testid="sepa-amount">
            {euro(amountCents)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Reference</dt>
          <dd className="flex items-center gap-1.5">
            <span className="font-mono font-semibold" data-testid="sepa-reference">
              {reference}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-lg px-2"
              onClick={() => copy(reference, "Reference")}
            >
              <Copy className="h-3 w-3" />
              <span className="sr-only">Copy reference</span>
            </Button>
          </dd>
        </div>
      </dl>

      <p className="text-muted-foreground">
        Use the reference exactly as shown — it is how we match your transfer. If the amount matches
        but the reference is missing, we e-mail you a short form to complete it. Bank transfers are
        reconciled automatically; verification usually goes live 1–2 working days after the money
        lands.
      </p>
    </div>
  );
}
