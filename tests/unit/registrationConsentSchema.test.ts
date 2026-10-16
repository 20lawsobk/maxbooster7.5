import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("registration consent schema parity", () => {
  it("declares consent tables in both migration and Drizzle schema", () => {
    const migration = read("migrations/0095_registration_consents.sql");
    const schema = read("shared/registration-consent-schema.ts");
    const drizzle = read("drizzle.config.ts");

    for (const table of ["registration_consents", "consent_logs"]) {
      expect(migration).toContain(table);
      expect(schema).toContain(table);
    }

    expect(drizzle).toContain("./shared/registration-consent-schema.ts");
  });

  it("persists DOB, age verification, legal policy versions, and marketing choice", () => {
    const migration = read("migrations/0095_registration_consents.sql");
    const service = read("server/services/consentService.ts");

    for (const field of [
      "birthdate",
      "age_verified",
      "tos_accepted_at",
      "tos_version",
      "privacy_accepted_at",
      "privacy_version",
      "marketing_consent",
      "marketing_consent_at",
    ]) {
      expect(migration).toContain(field);
      expect(service).toContain(field);
    }
  });
});
