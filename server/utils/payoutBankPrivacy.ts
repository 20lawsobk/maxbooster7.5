/**
 * Legacy bank preference records may contain full account/routing details.
 * Never echo these records to clients. This summary is display-only and is
 * intentionally NOT evidence that a payment provider verified an account.
 */
export interface LegacyBankSummary {
  bankName: string | null;
  accountNumber: string | null;
  accountType: "checking" | "savings" | null;
  country: string | null;
  verified: false;
}

export function summarizeLegacyBankDetails(value: unknown): LegacyBankSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const details = value as Record<string, unknown>;
  const safeString = (field: unknown, maxLength: number): string | null =>
    typeof field === "string" ? field.trim().slice(0, maxLength) || null : null;

  const account = typeof details.accountNumber === "string"
    ? details.accountNumber
    : typeof details.accountNumberFull === "string"
      ? details.accountNumberFull
      : "";
  const digits = account.slice(-256).replace(/\D/g, "");
  const lastFour = digits.length >= 4 ? digits.slice(-4) : null;

  return {
    bankName: safeString(details.bankName, 100),
    accountNumber: lastFour ? `****${lastFour}` : null,
    accountType: details.accountType === "checking" || details.accountType === "savings"
      ? details.accountType
      : null,
    country: safeString(details.country, 2),
    verified: false,
  };
}
