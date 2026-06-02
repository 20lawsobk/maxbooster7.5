/**
 * Unit tests for schema validators (Zod schemas derived from Drizzle schema).
 * These tests run in isolation — no DB, no server required.
 */
import { describe, it, expect } from "vitest";
import { insertUserSchema } from "../../shared/schema.js";

describe("insertUserSchema", () => {
  const validUser = {
    email: "test@example.com",
    password: "SecurePass123!",
    firstName: "Alice",
    lastName: "Smith",
  };

  it("accepts valid user data", () => {
    const result = insertUserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  it("requires email", () => {
    const { email: _e, ...without } = validUser;
    const result = insertUserSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("requires password", () => {
    const { password: _p, ...without } = validUser;
    const result = insertUserSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("allows missing firstName and lastName (optional)", () => {
    const result = insertUserSchema.safeParse({
      email: validUser.email,
      password: validUser.password,
    });
    expect(result.success).toBe(true);
  });

  it("does not accept extra fields in strict mode", () => {
    const strict = insertUserSchema.strict();
    const result = strict.safeParse({
      ...validUser,
      role: "admin",
      isAdmin: true,
    });
    expect(result.success).toBe(false);
  });
});
