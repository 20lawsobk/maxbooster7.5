import { describe, expect, it } from "vitest";
import { validateMusicIdentifier } from "../../client/src/lib/musicIdentifierValidation";

describe("validateMusicIdentifier", () => {
  it("recognizes 12-character ISRCs before numeric identifier checks", () => {
    expect(validateMusicIdentifier("USABC1234567")).toMatchObject({
      type: "isrc",
      valid: true,
    });
    expect(validateMusicIdentifier("usabc1234567").type).toBe("isrc");
  });

  it("checks UPC-A and EAN-13 check digits", () => {
    expect(validateMusicIdentifier("036000291452")).toMatchObject({
      type: "gs1",
      valid: true,
    });
    expect(validateMusicIdentifier("4006381333931")).toMatchObject({
      type: "gs1",
      valid: true,
    });
    expect(validateMusicIdentifier("036000291453")).toMatchObject({
      type: "gs1",
      valid: false,
    });
  });

  it("does not treat a valid format as proof of assignment", () => {
    expect(validateMusicIdentifier("USABC1234567").message).toContain(
      "assignment is not verified",
    );
  });
});
