/**
 * EPC-QR ("Scan2Pay" / SEPA Credit Transfer QR) payload builder.
 *
 * Follows the European Payments Council standard EPC069-12 v3: 12 fixed lines,
 * LF separated, max 331 bytes. Every European banking app that supports
 * "scan a payment QR" fills its transfer screen from this payload, which
 * removes the two classic manual-transfer failure modes: a mistyped IBAN and a
 * missing/incorrect structured reference.
 */

export interface EpcPayloadInput {
  /** Account holder as printed on the bank account. Max 70 chars. */
  beneficiary: string;
  /** IBAN, spaces are stripped automatically. */
  iban: string;
  /** BIC / SWIFT — optional in v2, still accepted by every app. */
  bic?: string;
  /** Amount in cents; 0 renders an open-amount QR. */
  amountCents: number;
  /** Unstructured remittance information, e.g. `ROUT-4821`. Max 140 chars. */
  reference: string;
  /** Optional 4-char purpose code (e.g. `OTHR`). */
  purpose?: string;
}

const MAX_BYTES = 331;

function clean(value: string, max: number): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

/** `EUR12.34` — EPC requires a dot decimal separator and at most 2 decimals. */
export function epcAmount(amountCents: number): string {
  const cents = Math.max(0, Math.round(amountCents));
  return `EUR${(cents / 100).toFixed(2)}`;
}

/**
 * Builds the raw text that goes into the QR code. Returns `null` when the
 * mandatory fields are missing or the payload would exceed the 331-byte limit,
 * so the UI can fall back to plain copyable details instead of showing an
 * unscannable code.
 */
export function buildEpcPayload(input: EpcPayloadInput): string | null {
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  const beneficiary = clean(input.beneficiary, 70);
  if (!iban || !beneficiary) return null;

  const lines = [
    "BCD", // service tag
    "002", // version 2 — BIC optional
    "1", // character set: UTF-8
    "SCT", // SEPA Credit Transfer
    (input.bic ?? "").replace(/\s+/g, "").toUpperCase(),
    beneficiary,
    iban,
    input.amountCents > 0 ? epcAmount(input.amountCents) : "",
    clean(input.purpose ?? "", 4),
    "", // structured reference (RF creditor reference) — unused
    clean(input.reference, 140), // unstructured remittance information
    "", // beneficiary-to-originator information
  ];

  const payload = lines.join("\n");
  if (new TextEncoder().encode(payload).length > MAX_BYTES) return null;
  return payload;
}

/** One-shot clipboard text for mobile users pasting into their banking app. */
export function sepaClipboardText(input: {
  beneficiary: string;
  iban: string;
  bic?: string;
  amountCents: number;
  reference: string;
}): string {
  const amount = (Math.max(0, Math.round(input.amountCents)) / 100).toFixed(2).replace(".", ",");
  return [
    `Beneficiary: ${input.beneficiary}`,
    `IBAN: ${input.iban.replace(/\s+/g, "")}`,
    input.bic ? `BIC: ${input.bic}` : null,
    `Amount: EUR ${amount}`,
    `Reference: ${input.reference}`,
  ]
    .filter(Boolean)
    .join("\n");
}
