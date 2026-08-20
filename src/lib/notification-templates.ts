/**
 * Four-language e-mail + in-app notification copy (NL / EN / FR / DE).
 *
 * Client-safe: pure data and string helpers, no server imports. The same copy
 * feeds the Resend e-mail and the in-app `notifications` row, so a member never
 * reads two different stories about the same payment.
 */

export type NotificationLocale = "nl" | "en" | "fr" | "de";

export const NOTIFICATION_LOCALES: NotificationLocale[] = ["nl", "en", "fr", "de"];

export function asNotificationLocale(value: unknown): NotificationLocale {
  return NOTIFICATION_LOCALES.includes(value as NotificationLocale)
    ? (value as NotificationLocale)
    : "nl";
}

export type NotificationKind =
  | "payment_processing"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_refunded"
  | "subscription_renewed"
  | "subscription_cancelled";

interface Copy {
  subject: string;
  title: string;
  body: string;
  cta: string;
}

const CTA: Record<NotificationLocale, string> = {
  nl: "Open je ROUT-dashboard",
  en: "Open your ROUT dashboard",
  fr: "Ouvrir votre tableau de bord ROUT",
  de: "ROUT-Dashboard öffnen",
};

const COPY: Record<NotificationKind, Record<NotificationLocale, Omit<Copy, "cta">>> = {
  payment_processing: {
    nl: {
      subject: "Je SEPA-betaling wordt verwerkt",
      title: "SEPA-betaling onderweg",
      body: "We hebben je opdracht ontvangen. Een SEPA-domiciliëring duurt enkele werkdagen; zodra het bedrag binnen is, lichten je verificatie en badges automatisch op.",
    },
    en: {
      subject: "Your SEPA payment is clearing",
      title: "SEPA payment on its way",
      body: "We received your instruction. A SEPA debit takes a few business days; as soon as it clears, your verification and badges light up automatically.",
    },
    fr: {
      subject: "Votre paiement SEPA est en cours",
      title: "Paiement SEPA en route",
      body: "Nous avons reçu votre instruction. Un prélèvement SEPA prend quelques jours ouvrables ; dès réception, votre vérification et vos badges s'activent automatiquement.",
    },
    de: {
      subject: "Deine SEPA-Zahlung wird verarbeitet",
      title: "SEPA-Zahlung unterwegs",
      body: "Wir haben deinen Auftrag erhalten. Eine SEPA-Lastschrift dauert einige Werktage; sobald der Betrag da ist, werden Verifizierung und Badges automatisch aktiv.",
    },
  },
  payment_succeeded: {
    nl: {
      subject: "Je ROUT-verificatie is actief",
      title: "Betaling ontvangen",
      body: "Bedankt! Je Early Believer-verificatie is actief en je badges staan klaar in je dashboard.",
    },
    en: {
      subject: "Your ROUT verification is live",
      title: "Payment received",
      body: "Thank you! Your Early Believer verification is active and your badges are waiting in your dashboard.",
    },
    fr: {
      subject: "Votre vérification ROUT est active",
      title: "Paiement reçu",
      body: "Merci ! Votre vérification Early Believer est active et vos badges vous attendent dans votre tableau de bord.",
    },
    de: {
      subject: "Deine ROUT-Verifizierung ist aktiv",
      title: "Zahlung erhalten",
      body: "Danke! Deine Early-Believer-Verifizierung ist aktiv und deine Badges warten im Dashboard.",
    },
  },
  payment_failed: {
    nl: {
      subject: "Je betaling is niet gelukt",
      title: "Betaling mislukt",
      body: "De betaling kon niet worden voltooid — vaak door een verlopen kaart of onvoldoende saldo. Je kan het opnieuw proberen vanuit je dashboard.",
    },
    en: {
      subject: "Your payment did not go through",
      title: "Payment failed",
      body: "The payment could not be completed — usually an expired card or insufficient funds. You can try again from your dashboard.",
    },
    fr: {
      subject: "Votre paiement n'a pas abouti",
      title: "Paiement échoué",
      body: "Le paiement n'a pas pu être finalisé — souvent une carte expirée ou un solde insuffisant. Vous pouvez réessayer depuis votre tableau de bord.",
    },
    de: {
      subject: "Deine Zahlung ist fehlgeschlagen",
      title: "Zahlung fehlgeschlagen",
      body: "Die Zahlung konnte nicht abgeschlossen werden — meist eine abgelaufene Karte oder fehlende Deckung. Du kannst es im Dashboard erneut versuchen.",
    },
  },
  payment_refunded: {
    nl: {
      subject: "Je betaling is terugbetaald",
      title: "Terugbetaling bevestigd",
      body: "We hebben je betaling terugbetaald. De bijhorende verificatie en badges zijn daarom weer op vrij niveau gezet.",
    },
    en: {
      subject: "Your payment was refunded",
      title: "Refund confirmed",
      body: "We refunded your payment. The related verification and badges have been reset to the free tier.",
    },
    fr: {
      subject: "Votre paiement a été remboursé",
      title: "Remboursement confirmé",
      body: "Nous avons remboursé votre paiement. La vérification et les badges associés sont repassés au niveau gratuit.",
    },
    de: {
      subject: "Deine Zahlung wurde zurückerstattet",
      title: "Rückerstattung bestätigt",
      body: "Wir haben deine Zahlung zurückerstattet. Verifizierung und Badges wurden auf die kostenlose Stufe zurückgesetzt.",
    },
  },
  subscription_renewed: {
    nl: {
      subject: "Bedankt om ROUT levend te houden",
      title: "Bijdrage vernieuwd",
      body: "Je terugkerende bijdrage is ontvangen. Je Supporter-badge blijft actief — merci!",
    },
    en: {
      subject: "Thanks for keeping ROUT alive",
      title: "Contribution renewed",
      body: "Your recurring contribution came through. Your Supporter badge stays lit — thank you!",
    },
    fr: {
      subject: "Merci de garder ROUT en vie",
      title: "Contribution renouvelée",
      body: "Votre contribution récurrente a été reçue. Votre badge Supporter reste actif — merci !",
    },
    de: {
      subject: "Danke, dass du ROUT am Leben hältst",
      title: "Beitrag verlängert",
      body: "Dein wiederkehrender Beitrag ist eingegangen. Dein Supporter-Badge bleibt aktiv — danke!",
    },
  },
  subscription_cancelled: {
    nl: {
      subject: "Je terugkerende bijdrage is gestopt",
      title: "Bijdrage gestopt",
      body: "Je terugkerende bijdrage is beëindigd. Je levenslange verificatie blijft, enkel de Supporter-badge vervalt.",
    },
    en: {
      subject: "Your recurring contribution stopped",
      title: "Contribution ended",
      body: "Your recurring contribution has ended. Your lifetime verification stays; only the Supporter badge expires.",
    },
    fr: {
      subject: "Votre contribution récurrente est arrêtée",
      title: "Contribution terminée",
      body: "Votre contribution récurrente est terminée. Votre vérification à vie reste ; seul le badge Supporter expire.",
    },
    de: {
      subject: "Dein wiederkehrender Beitrag wurde beendet",
      title: "Beitrag beendet",
      body: "Dein wiederkehrender Beitrag ist beendet. Deine lebenslange Verifizierung bleibt; nur das Supporter-Badge verfällt.",
    },
  },
};

export function notificationCopy(kind: NotificationKind, locale: NotificationLocale): Copy {
  const entry = COPY[kind][locale] ?? COPY[kind].nl;
  return { ...entry, cta: CTA[locale] ?? CTA.nl };
}

export const NOTIFICATION_SEVERITY: Record<NotificationKind, "info" | "success" | "warning"> = {
  payment_processing: "info",
  payment_succeeded: "success",
  payment_failed: "warning",
  payment_refunded: "warning",
  subscription_renewed: "success",
  subscription_cancelled: "info",
};

/** Shared ROUT e-mail shell — inline styles only, white body, no external CSS. */
export function renderNotificationEmail(copy: Copy, dashboardUrl: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;background:#ffffff;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;text-align:left">
        <tr><td style="padding-bottom:20px;font:600 18px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em">ROUT</td></tr>
        <tr><td style="padding-bottom:8px;font-size:20px;font-weight:600">${escapeHtml(copy.title)}</td></tr>
        <tr><td style="padding-bottom:24px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(copy.body)}</td></tr>
        <tr><td style="padding-bottom:28px">
          <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600">${escapeHtml(copy.cta)}</a>
        </td></tr>
        <tr><td style="border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;color:#64748b">rout.be — soevereine identiteit &amp; links</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
