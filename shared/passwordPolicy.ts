/** Validate newly chosen passwords before bcrypt can truncate UTF-8 input. */
export function getNewPasswordError(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return "Password is required";
  if (value.length < 8) return "Password must be at least 8 characters";
  if (new TextEncoder().encode(value).byteLength > 72) {
    return "Password must be 72 UTF-8 bytes or fewer";
  }
  return undefined;
}
