# Monitoring alert transport and receipts

Run from the repository root with Node 22.12+ and installed JavaScript
dependencies:

```sh
node --import tsx --test --test-concurrency=1 tests/sendgrid-alert-transport.test.mjs
```

The canonical Node group discovers this file. No real provider credentials,
email delivery, application database or external webhook is used. The service
and Express route are bundled from their actual source with owned logger/env
boundaries. Unrelated monitoring services and admission middleware are controlled
fixture boundaries; these assertions do not certify production authentication.
Separate existing HTTP suites verify real authentication.

The eleven cases establish:

- Actual alert dispatch reaches the fixed SendGrid mail endpoint, escapes HTML
  fields and sends separate recipient personalizations.
- Rejection permits another explicit attempt; only provider acceptance starts
  that channel's cooldown. An accepted webhook does not suppress failed email.
- Simultaneous identical alerts have one process-local in-flight admission;
  unconfigured email makes no request.
- Invalid addresses, header injection, credentials, excessive recipients and
  oversized bodies fail before transport.
- Only HTTP 202 establishes SendGrid acceptance. Provider bodies, credentials
  and raw network diagnostics are absent from returned errors.
- A real owned loopback HTTP server verifies serialized requests, redirect
  refusal, timeout cancellation and subsequent recovery. Its URL is supplied
  only by the test's injected fetch adapter; production has no endpoint override.
- The actual monitoring route returns 202 with acceptance receipts, 503 when
  all attempted channels fail or none is configured, and 409 for cooldown
  suppression. Controlled fixture admission rejects absent/non-admin/unverified
  identities before dispatch.

`sendSendGridAlert` preserves configured SendGrid credentials and sender. It
has a fixed HTTPS endpoint, rejects redirects, bounds requests to ten seconds
and 1 MiB, and performs no automatic retry. The service retains independent
channel outcomes and a 15-minute process-local cooldown. Accepted responses
do not establish inbox delivery, signed delivery webhooks or cross-instance
deduplication. No Resend email-worker behavior is changed by removing its unused
SendGrid initialization.

The [retained evidence](../../reports/email-acceptance/2026-10-27-sendgrid-alert/README.md)
includes successive test additions and the same final eleven cases run against
the old service/route and repaired service/route. The former fails seven cases;
the latter passes eleven. The explicit `MAXBOOSTER_ALERT_BASELINE_FILE` and
`MAXBOOSTER_MONITORING_BASELINE_FILE` selectors load extracted baseline source
only in this test harness for before/after reproduction; ordinary runs omit
them. They are not runtime configuration.

Live delivery remains a separate deployed provider journey. Secret presence,
HTTP fixture acceptance and a passing SDK audit cannot establish that journey.
