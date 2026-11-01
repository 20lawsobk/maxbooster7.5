import { describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { getNewPasswordError } from "../../shared/passwordPolicy";
import { validateRegistrationPassword } from "../../client/src/lib/registrationCompletion";

describe("new password bcrypt boundary", () => {
  it.each([null, undefined, {}, 123, "", "short"])("rejects invalid input %j", value => {
    expect(getNewPasswordError(value)).toBeTypeOf("string");
  });
  it.each(["a".repeat(72), "é".repeat(36), "😀".repeat(18)])("accepts exactly 72 UTF-8 bytes", value => {
    expect(getNewPasswordError(value)).toBeUndefined();
    expect(() => validateRegistrationPassword(value, value)).not.toThrow();
  });
  it.each(["a".repeat(73), "é".repeat(37), "😀".repeat(19)])("rejects input beyond 72 UTF-8 bytes", value => {
    expect(getNewPasswordError(value)).toContain("72 UTF-8 bytes");
    expect(() => validateRegistrationPassword(value, value)).toThrow("72 UTF-8 bytes");
  });
  it("rejects distinct passwords bcrypt would otherwise treat as equal", async () => {
    const prefix = "é".repeat(36);
    const hash = await bcrypt.hash(prefix + "first", 4);
    expect(await bcrypt.compare(prefix + "second", hash)).toBe(true);
    expect(getNewPasswordError(prefix + "first")).toBeDefined();
    expect(getNewPasswordError(prefix + "second")).toBeDefined();
  });
});
