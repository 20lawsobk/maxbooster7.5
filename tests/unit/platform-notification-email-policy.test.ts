import { describe, expect, it } from "vitest";
import { platformEmailNotificationAllowed } from "../../server/services/notificationPreferences";

describe("platform notification email policy", () => {
  it("respects the admin setting for ordinary notification categories", () => {
    expect(platformEmailNotificationAllowed(false, "studio_render_complete")).toBe(
      false,
    );
    expect(platformEmailNotificationAllowed(true, "studio_render_complete")).toBe(
      true,
    );
  });

  it("never suppresses account-security notices", () => {
    expect(
      platformEmailNotificationAllowed(false, "security_password_changed"),
    ).toBe(true);
  });
});
