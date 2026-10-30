# Authentication and authorization

This guide describes the current implementation boundaries, not a security
certification. Current sources are `server/middleware/auth.ts`,
`server/middleware/sessionConfig.ts`, `server/services/sessionAuthority.ts`,
`server/services/jwtAuthService.ts`, and the auth handlers in `server/routes.ts`.

## Sessions and tokens

The primary browser session uses the configured session store, including PDIM
and the documented PostgreSQL fallback. The session cookie is `httpOnly` and
`SameSite=Lax`; production secure-cookie behavior is defined by sessionConfig.
The separate readable CSRF cookie uses `SameSite=Strict`.

`SESSION_SECRET` is required and must contain at least 32 characters. Supply it
through secure environment configuration, never source or logs. Session authority
is generation-bound; MFA and account-security mutations must preserve the actual
rotation/revocation rules. JWT token-version checks alone do not describe the
whole current session-authority contract.

JWT support is implemented by jwtAuthService and the authentication middleware.
A transport fallback must not bypass signature, expiration, account, subscription,
MFA or authority checks. If an authority dependency cannot establish valid
access, do not interpret fallback availability as permission to continue.

The historical `server/replitAuth.ts` OIDC module is not present. Do not infer
active SSO from older diagrams. Social-provider OAuth connections are separate
from application account authentication and require provider-specific verification.

## CSRF

`GET /api/csrf-token` returns `{ csrfToken }` and uses the token already generated
by middleware. Reuse the same cookie jar/session and send the matching value in
`X-CSRF-Token` for protected mutations. The cookie is named `csrf-token`.

Use the shared client request helper. For an HTTP fixture, first fetch the token
while retaining cookies, then submit the mutation with those cookies and header.
Do not assume login returns a CSRF token or that a route is exempt merely because
it is an authentication endpoint.

The exact current exemption policy lives in `server/middleware/csrf.ts`.
Provider webhook exemptions apply to explicit POST consumers with signature
verification; a lookalike URL or an entire webhook namespace is not exempt.
Internal transports have their own authentication and are not browser-session
shortcuts.

## Authenticator MFA

The current enrollment and sign-in challenge use authenticator TOTP, implemented
by `mfaLifecycle`, `mfaChallengeFlow`, `factorRepository`, and `totpReplay`.
Enrollment is session-bound, requires recent reauthentication, expires, and does
not replace an active factor until proof succeeds. Existing-factor replacement
requires a fresh unused current code. Factor changes rotate session authority.

A pending sign-in challenge is not an authenticated session. The challenge must
complete with the correct owner, authority generation, expiration and replay-safe
code before normal access is issued. Twilio/SMS integrations elsewhere do not
replace this TOTP contract, and older development bypass descriptions are not an
authorization policy.

## Authorization and account data

Routes enforce their actual resource ownership, subscription and administrator
requirements. Administrator-only operations may additionally require verified
MFA. Demo writes are restricted by the demo guard; a demo account is not evidence
that ordinary tenant or paid access can be bypassed.

Routine account and preference responses omit passwords, factor/reset/verification
secrets and historical bank-credential fields. General preference writes reject
bank credentials; bank payouts use verified provider onboarding. Explicit owner
exports and historical-data remediation are separate review surfaces.

Validate denial paths, cross-owner access, revoked sessions, pending MFA, CSRF,
logout and provider outage behavior in isolated fixtures. A mounted login page,
HTTP 200 or a passing source-level test does not establish all those properties.
