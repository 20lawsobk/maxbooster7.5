---
name: SMS phone-verification code ownership
description: Twilio Verify owns its own code — confirm must check via Twilio, never against a locally generated code; dev devCode must be gated to non-prod.
---

# SMS phone-verification: who owns the code

The phone-verification flow for enabling SMS notifications has two delivery
backends, and the confirm step MUST branch on which one sent the code:

- **Twilio Verify** (`verify.v2.services(sid).verifications.create`) generates and
  owns its own one-time code. You never see it. Confirmation MUST call
  `verificationChecks.create({ to, code })` and require `status === 'approved'`.
  Comparing the user's input against any locally generated code is guaranteed to
  fail — that was a real shipped bug.
- **Twilio Messages API** or **dev/no-provider** mode use a code WE generate and
  store; confirm compares the submitted code against the stored pending code.

Persist a `verificationMethod: 'twilio_verify' | 'local'` flag at send time so
confirm knows which path to take. For `twilio_verify`, don't store the code
locally (Twilio holds it).

**Why:** the two backends look interchangeable at send time but are not at confirm
time; mixing them silently breaks verification with a misleading "invalid code".

**Dev devCode:** when no SMS provider is configured, the API may return the code
in the response (`devCode`) so the built-in demo UI can display it — but ONLY when
`NODE_ENV !== 'production'` AND no real SMS was delivered. Returning it in
production would be a phone-verification bypass.

## Live config in this project (do not confuse SMS with Resend)

SMS verification/notifications go through **Twilio**, NOT Resend. Resend is
**email-only** (it cannot send SMS at all). A user once said "we swapped SMS
providers to Resend" — that was a misnomer; they meant Twilio (SMS) and Resend
(email) were both configured/upgraded in Secrets.

Configured Twilio secrets put the code on the **Twilio Verify** path:
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`,
`TWILIO_PHONE_NUMBER` present; `TWILIO_MESSAGING_SERVICE_SID` absent. Because the
verify branch is checked first (verifyServiceSid present), confirm must validate
via Twilio `verificationChecks`, never a locally stored code.
