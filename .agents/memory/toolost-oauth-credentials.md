---
name: Too Lost OAuth credentials
description: Too Lost app IDs and client credentials are valid for token issuance, but catalog and distribution endpoints require a user-authorized OAuth token.
---

Too Lost's client ID and client secret can successfully obtain a bearer token with `client_credentials`, but that application token is rejected by `/v1/me` and `/v1/releases`. The service therefore needs an authorization-code user connection with stored access and refresh tokens for real catalog and distribution calls.

**Why:** A successful `/oauth/token` response alone can falsely suggest the integration is ready; the API distinguishes app authentication from a user-authorized account.

**How to apply:** Keep client credentials in environment-specific configuration, but complete and verify the browser OAuth connect flow before treating Too Lost as connected. Sandbox and production client IDs may require different secrets.