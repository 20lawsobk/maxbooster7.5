// Only dependency-injected factories; never call lazy default DB accessors.
import assert from "node:assert/strict";
import pg from "pg";
import { createSessionAuthority } from "../server/services/sessionAuthority";
import { createFactorRepository } from "../server/services/factorRepository";

const host = process.argv[2];
assert.match(host, /^\/tmp\/readiness-pg-[A-Za-z0-9]+$/);
const pool = new pg.Pool({ host, port: 55439, user: "rehearsal", database: "postgres", password: "local-synthetic-only", max: 5 });
try {
  const authority = createSessionAuthority(pool);
  const first = await authority.issue("rehearsal-user");
  assert.equal(first, "1");
  assert.equal(await authority.validate("rehearsal-user", first), true);
  assert.equal(await authority.validate("rehearsal-user", undefined), false);
  await Promise.all(Array.from({ length: 8 }, () => authority.revoke("rehearsal-user")));
  assert.equal(await authority.issue("rehearsal-user"), "9");
  assert.equal(await authority.validate("rehearsal-user", first), false);
  const factors = createFactorRepository(pool);
  assert.equal(await factors.replace("rehearsal-user", null, false, "synthetic-test-factor", true, 100), "10");
  await assert.rejects(factors.replace("rehearsal-user", null, false, "stale-factor", true, 101), /changed during verification/);
  assert.equal(await authority.issue("rehearsal-user"), "10");
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    await createFactorRepository(tx).replace("rehearsal-user", "synthetic-test-factor", true, null, false);
    await tx.query("ROLLBACK");
  } finally { tx.release(); }
  assert.equal(await authority.issue("rehearsal-user"), "10");
  assert.equal((await pool.query("SELECT two_factor_secret FROM users WHERE id='rehearsal-user'")).rows[0].two_factor_secret, "synthetic-test-factor");
  await assert.rejects(authority.issue("missing-user"), /does not exist/);
  console.log("Real pg-backed security factory assertions passed (8 concurrent revocations, CAS rejection, atomic rollback).");
} finally {
  await pool.end();
}