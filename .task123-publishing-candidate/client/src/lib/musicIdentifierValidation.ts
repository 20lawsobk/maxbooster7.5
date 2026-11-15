export interface IdentifierValidation {
  type: "isrc" | "gs1" | null;
  valid: boolean;
  message: string;
}

export function validateMusicIdentifier(value: string): IdentifierValidation {
  const code = value.trim().toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(code)) {
    return {
      type: "isrc",
      valid: true,
      message: "Valid ISRC format; issuing-authority assignment is not verified.",
    };
  }

  if (!/^(?:\d{12}|\d{13})$/.test(code)) {
    return {
      type: null,
      valid: false,
      message: "Enter an ISRC or a 12/13-digit GS1 identifier.",
    };
  }

  const dataDigits = code.slice(0, -1);
  const firstWeight = code.length === 12 ? 3 : 1;
  const weightedSum = [...dataDigits].reduce(
    (sum, digit, index) =>
      sum + Number(digit) * (index % 2 === 0 ? firstWeight : 4 - firstWeight),
    0,
  );
  const expected = (10 - (weightedSum % 10)) % 10;
  const valid = expected === Number(code.at(-1));
  return {
    type: "gs1",
    valid,
    message: valid
      ? "Valid GS1 check digit; issuing-authority assignment is not verified."
      : `Invalid GS1 check digit. Expected ${expected}.`,
  };
}
