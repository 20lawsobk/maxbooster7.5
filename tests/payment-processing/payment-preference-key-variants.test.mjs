import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasBankCredentials, publicPaymentPreferences } from '../../server/lib/paymentPreferencePrivacy.ts';

test('generic preference guard rejects common bank credential key spellings', () => {
  for (const key of [
    'bank_details', 'bank-account', 'bankAccountNumber', 'bank_routing_number',
    'account_number', 'routing-number', 'Bank Account Number', 'SWIFT_CODE',
    'sort_code', 'BIC',
  ]) {
    assert.equal(hasBankCredentials({ profile: [{ [key]: 'fixture-only' }] }), true, key);
  }
  assert.equal(hasBankCredentials({ payout: { stripeAccountId: 'acct_fixture', paypalEmail: 'test@example.invalid', bankTransferEnabled: true } }), false);
});

test('routine preference responses redact key variants without mutating stored JSON', () => {
  const stored = {
    theme: 'dark',
    payout: { bank_details: { account_number: 'fixture-only' }, paypalEmail: 'test@example.invalid' },
    alternate: [{ bankAccountNumber: 'fixture-only', label: 'retained' }, { 'routing-number': 'fixture-only', safe: true }],
  };
  const original = structuredClone(stored);
  assert.deepEqual(publicPaymentPreferences(stored), {
    theme: 'dark',
    payout: { paypalEmail: 'test@example.invalid' },
    alternate: [{ label: 'retained' }, { safe: true }],
  });
  assert.deepEqual(stored, original);
});
