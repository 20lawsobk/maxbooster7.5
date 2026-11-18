import { describe, expect, it } from "vitest";
import {
  isRegularE2eRegistration,
  isRegularE2eUser,
  regularE2eEmail,
} from "../../server/services/regularE2eAccountPolicy.js";

const baseEnv = {
  NODE_ENV: "development",
  MAXBOOSTER_REGULAR_E2E_USERNAME: "regular_test_01",
  MAXBOOSTER_REGULAR_E2E_PASSWORD: "safe-test-password",
};

describe("regular E2E account policy", () => {
  it("allows only the configured test credentials in the development workspace", () => {
    const env = {
      ...baseEnv,
      MAXBOOSTER_REGULAR_E2E_REGISTRATION_ENABLED: "true",
    };
    expect(isRegularE2eRegistration({
      username: "regular_test_01",
      email: "regular_test_01@maxbooster-test.invalid",
      password: "safe-test-password",
    }, env)).toBe(true);
    expect(isRegularE2eRegistration({
      username: "someone_else",
      email: "someone_else@maxbooster-test.invalid",
      password: "safe-test-password",
    }, env)).toBe(false);
    expect(isRegularE2eRegistration({
      username: "regular_test_01",
      email: "real-person@example.com",
      password: "safe-test-password",
    }, env)).toBe(false);
    expect(isRegularE2eRegistration({
      username: "regular_test_01",
      email: "REGULAR_TEST_01@maxbooster-test.invalid",
      password: "safe-test-password",
    }, env)).toBe(false);
    expect(isRegularE2eRegistration({
      username: "regular_test_01",
      email: "regular_test_01@maxbooster-test.invalid",
      password: "wrong-password",
    }, env)).toBe(false);
  });

  it("fails closed when disabled, malformed, or running in production", () => {
    const registration = {
      username: "regular_test_01",
      email: "regular_test_01@maxbooster-test.invalid",
      password: "safe-test-password",
    };
    expect(isRegularE2eRegistration(registration, baseEnv)).toBe(false);
    expect(isRegularE2eRegistration(registration, {
      ...baseEnv,
      NODE_ENV: "production",
      MAXBOOSTER_REGULAR_E2E_REGISTRATION_ENABLED: "true",
    })).toBe(false);
    expect(isRegularE2eRegistration(registration, {
      ...baseEnv,
      REPLIT_DEPLOYMENT: "deployment-id",
      MAXBOOSTER_REGULAR_E2E_REGISTRATION_ENABLED: "true",
    })).toBe(false);
  });

  it("admits only the configured regular account ID to development app APIs", () => {
    const env = {
      ...baseEnv,
      MAXBOOSTER_REGULAR_E2E_ACCESS_ENABLED: "true",
      MAXBOOSTER_REGULAR_E2E_ACCESS_USER_ID: "user-test-id",
    };
    const user = {
      id: "user-test-id",
      role: "user",
      username: "regular_test_01",
      email: regularE2eEmail("regular_test_01"),
    };
    expect(isRegularE2eUser(user, env)).toBe(true);
    expect(isRegularE2eUser({ ...user, id: "different-id" }, env)).toBe(false);
    expect(isRegularE2eUser({ ...user, role: "admin" }, env)).toBe(false);
    expect(isRegularE2eUser({ ...user, username: "another-user" }, env)).toBe(false);
    expect(isRegularE2eUser(user, {
      ...env,
      NODE_ENV: "production",
    })).toBe(false);
  });
});
