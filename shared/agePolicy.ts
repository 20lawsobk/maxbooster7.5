/** New-account eligibility only. Never use this policy to revoke existing accounts. */
export const MINIMUM_ACCOUNT_AGE = 16;
export const ACCOUNT_AGE_REQUIREMENT = `You must be at least ${MINIMUM_ACCOUNT_AGE} years old to create an account`;

/** Strict date-only calendar parsing; Date's rollover normalization is rejected. */
export function parseBirthdate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      value.startsWith("0000-")) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

/** UTC calendar age. A February 29 birthday is reached March 1 in non-leap years. */
export function calculateAgeUtc(value: unknown, now: Date = new Date()): number | null {
  const birthdate = parseBirthdate(value);
  if (!birthdate || Number.isNaN(now.getTime())) return null;
  const today = now.toISOString().slice(0, 10);
  if ((value as string) > today) return null;
  let age = now.getUTCFullYear() - birthdate.getUTCFullYear();
  if (now.getUTCMonth() < birthdate.getUTCMonth() ||
      (now.getUTCMonth() === birthdate.getUTCMonth() && now.getUTCDate() < birthdate.getUTCDate())) age--;
  return age;
}

export function getAccountEligibilityError(value: unknown, now: Date = new Date()): string | undefined {
  if (value === undefined || value === null || value === "") return "Date of birth is required to create an account";
  const age = calculateAgeUtc(value, now);
  if (age === null) return "Enter a valid date of birth in YYYY-MM-DD format that is not in the future";
  return age >= MINIMUM_ACCOUNT_AGE ? undefined : ACCOUNT_AGE_REQUIREMENT;
}
