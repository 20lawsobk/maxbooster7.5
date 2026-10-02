---
name: Certificate crypto boundary
description: Why certificate automation separates ACME protocol handling from cryptographic primitives.
---

Certificate automation must retain issuance, renewal, DNS challenges, and existing account-key compatibility while using native cryptographic primitives. Do not restore a protocol client that transitively introduces an unpatched signature-verification library.

**Why:** The newest certificate-client release still depended on a cryptography package with a high-severity signature-verification advisory and no patched registry release. Merely updating the parent or hiding the finding could not fix it.

**How to apply:** Check the entire cryptographic dependency path when changing certificate automation. Verify signatures, CSRs, nonce retry, authorization polling, account reuse, and challenge cleanup independently; a clean package inventory alone does not prove certificate issuance works.

ACME client initialization must be shared while pending and cached only after successful account registration and persistence. Account identifiers belong to a directory, not merely a key; retrieve the account with its key against the current directory rather than trusting a global stored account URL.

**Why:** A transient registration failure otherwise leaves a permanently unregistered cached client, and changing from staging to production reuses an invalid staging account identifier.

**How to apply:** Test failed first initialization, concurrent callers, persistence failure, and a directory switch with the same key.

Publishing a DNS challenge in the database is not proof that the authoritative server serves it yet.

**Why:** The authoritative DNS service refreshes its zone data on a five-second ticker. Immediate challenge readiness can race that refresh and spend failed-validation attempts.

**How to apply:** Confirm the expected TXT value is visible before asking the certificate authority to validate; bound retries and clean up the record on propagation failure.