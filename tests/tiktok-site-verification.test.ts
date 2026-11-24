import assert from "node:assert/strict";
import { test } from "node:test";
import {
  developmentVerificationFilePath,
  verificationTextForHost,
} from "../server/services/tiktokSiteVerification.js";

test("TikTok verification serves the submitted token only on the configured dev host", () => {
  assert.equal(
    developmentVerificationFilePath,
    "/tiktokYuaYzlWqoobUDQLsXg8nt8UAv5y5jBxr.txt",
  );
  assert.equal(
    verificationTextForHost(
      "a28d7898-bbab-4e83-93d1-b2a6ecd20030-00-hv6pcaw3lbdn.spock.replit.dev",
      "a28d7898-bbab-4e83-93d1-b2a6ecd20030-00-hv6pcaw3lbdn.spock.replit.dev",
    ),
    "tiktok-developers-site-verification=YuaYzlWqoobUDQLsXg8nt8UAv5y5jBxr",
  );
  assert.equal(
    verificationTextForHost(
      "A28D7898-BBAB-4E83-93D1-B2A6ECD20030-00-HV6PCAW3LBDN.SPOCK.REPLIT.DEV:443",
      "a28d7898-bbab-4e83-93d1-b2a6ecd20030-00-hv6pcaw3lbdn.spock.replit.dev",
    ),
    "tiktok-developers-site-verification=YuaYzlWqoobUDQLsXg8nt8UAv5y5jBxr",
  );
  assert.equal(
    verificationTextForHost("maxbooster.replit.app", "maxbooster.replit.dev"),
    "tiktok-developers-site-verification=hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx",
  );
  assert.equal(
    verificationTextForHost(undefined, "maxbooster.replit.dev"),
    "tiktok-developers-site-verification=hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx",
  );
  assert.equal(
    verificationTextForHost("maxbooster.replit.dev", undefined),
    "tiktok-developers-site-verification=hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx",
  );
});
