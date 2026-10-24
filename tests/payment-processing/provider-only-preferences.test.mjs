import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadIsolatedClosed } from './helpers-inbound.mjs';
import { publicPaymentPreferences, hasBankCredentials } from '../../server/lib/paymentPreferencePrivacy.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { responseHarness } from './helpers-inbound.mjs';

// Execute the exact registered handler, without booting workers or providers.
function preferenceHandler(method, url, dependencies, file = 'server/routes.ts', receiver = 'app') {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  let handler;
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(source) === receiver && node.expression.name.text === method &&
      node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === url) {
      handler = node.arguments.at(-1).getText(source);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(handler, `${method} ${url} is registered`);
  return vm.runInNewContext(ts.transpile(`const handler = ${handler}; handler;`, {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  }), { publicPaymentPreferences, hasBankCredentials, ...dependencies });
}

test('registered generic preference routes reject bank writes and redact historical credentials', async () => {
  const writes = [];
  const dependencies = { db: { update: () => ({ set: value => ({ where: async () => writes.push(value) }) }) },
    users: { id: 'user-id' }, eq: () => true, logger: { warn() {} } };
  const post = preferenceHandler('post', '/api/user/preferences', dependencies);
  const historical = { theme: 'dark', payout: { bankDetails: { accountNumberFull: 'synthetic' }, paypalEmail: 'owner@example.invalid' } };
  const user = { id: 'owner', preferences: historical };
  const denied = responseHarness();
  await post({ user, body: { payoutSettings: { bankDetails: {} } } }, denied);
  assert.equal(denied.statusCode, 400);
  assert.equal(writes.length, 0);
  const put = preferenceHandler('put', '/api/auth/preferences', dependencies);
  const nested = responseHarness();
  await put({ user, body: { language: { bankDetails: { accountNumber: 'synthetic' } } } }, nested);
  assert.equal(nested.statusCode, 400);
  assert.equal(writes.length, 0);
  const saved = responseHarness();
  await post({ user, body: { theme: 'light' } }, saved);
  assert.equal(writes.length, 1);
  assert.equal(saved.body.preferences.theme, 'light');
  assert.equal(hasBankCredentials(saved.body), false);
  for (const url of ['/api/auth/preferences', '/api/user/preferences']) {
    const get = preferenceHandler('get', url, dependencies);
    const response = responseHarness();
    await get({ user }, response);
    assert.equal(hasBankCredentials(response.body), false);
    assert.equal(response.body.payout.paypalEmail, 'owner@example.invalid');
    const unauthorized = responseHarness();
    await get({}, unauthorized);
    assert.equal(unauthorized.statusCode, 401);
  }
  assert.equal(historical.payout.bankDetails.accountNumberFull, 'synthetic');
  const me = preferenceHandler('get', '/api/auth/me', { ...dependencies, isProductionEnv: () => false });
  const account = responseHarness();
  await me({ user: { ...user, password: 'synthetic-hash', twoFactorSecret: 'synthetic-factor' } }, account);
  assert.equal(hasBankCredentials(account.body), false);
  assert.equal(Object.hasOwn(account.body, 'password'), false);
  assert.equal(Object.hasOwn(account.body, 'twoFactorSecret'), false);
});

test('legacy payout routes fail closed and historical bank records are never treated as verified', async () => {
  const dependencies = { logger: { warn() {} }, instantPayoutService: {
    verifyStripeAccount: async () => ({ verified: false, requiresOnboarding: true }),
  } };
  const file = 'server/routes/payouts.ts';
  const bank = preferenceHandler('post', '/preferences/bank', dependencies, file, 'router');
  const response = responseHarness();
  await bank({ user: { id: 'owner' }, body: { accountNumber: 'synthetic' } }, response);
  assert.equal(response.statusCode, 410);
  const user = { id: 'owner', preferences: { payout: { bankDetails: { verified: true, accountNumberFull: 'synthetic' } } } };
  const read = preferenceHandler('get', '/preferences', dependencies, file, 'router');
  const visible = responseHarness();
  await read({ user }, visible);
  assert.equal(visible.body.bankDetails, null);
  assert.equal(visible.body.preferredMethod, 'stripe');
  const verify = preferenceHandler('get', '/verify', dependencies, file, 'router');
  const verification = responseHarness();
  await verify({ user }, verification);
  assert.equal(verification.body.verified, false);
  const royalty = preferenceHandler('post', '/api/royalties/payment-methods', dependencies);
  const rejected = responseHarness();
  await royalty({ user, body: { type: 'bank_transfer', bankDetails: {} } }, rejected);
  assert.equal(rejected.statusCode, 410);
});

test('paid and administrator dashboard account responses redact banking and verification secrets', async () => {
  for (const [file, receiver] of [['server/routes/paid.ts', 'paidRouter'], ['server/routes/admin.ts', 'adminRouter']]) {
    const dashboard = preferenceHandler('get', '/dashboard', {}, file, receiver);
    const response = responseHarness();
    await dashboard({ user: { id: 'owner', password: 'synthetic', emailVerificationToken: 'synthetic',
      preferences: { payout: { bankDetails: { accountNumberFull: 'synthetic' }, paypalEmail: 'owner@example.invalid' } } } }, response);
    assert.equal(Object.hasOwn(response.body.user, 'password'), false);
    assert.equal(Object.hasOwn(response.body.user, 'emailVerificationToken'), false);
    assert.equal(hasBankCredentials(response.body.user), false);
    assert.equal(response.body.user.preferences.payout.paypalEmail, 'owner@example.invalid');
  }
});

test('generic preference privacy preserves settings without exposing historical banking fields', () => {
  const stored = { theme: 'dark', payout: { bankDetails: { accountNumberFull: 'synthetic' },
    paypalEmail: 'owner@example.invalid' }, payoutSettings: { routingNumber: 'synthetic',
    stripeAccountId: 'acct_fixture' }, nested: [{ IBAN: 'synthetic', label: 'saved' }] };
  assert.equal(hasBankCredentials(stored), true);
  const visible = publicPaymentPreferences(stored);
  assert.deepEqual(visible, { theme: 'dark', payout: { paypalEmail: 'owner@example.invalid' },
    payoutSettings: { stripeAccountId: 'acct_fixture' }, nested: [{ label: 'saved' }] });
  assert.equal(hasBankCredentials(visible), false);
  assert.equal(stored.payout.bankDetails.accountNumberFull, 'synthetic');
  assert.equal(hasBankCredentials({ payout: { bankDetails: {} } }), true);
  assert.equal(hasBankCredentials({ theme: 'light', defaultBPM: 120 }), false);
});

test('payment preferences reject bank credentials before persistence and preserve provider settings', async () => {
  const writes = [];
  globalThis.__providerOnlyPrefs = {
    insert: () => ({ values: value => ({ onConflictDoUpdate: async () => writes.push(value) }) }),
  };
  try {
    const { PayoutService } = await loadIsolatedClosed('server/services/payoutService.ts', {
      '../db.js': 'export const db = globalThis.__providerOnlyPrefs;',
    });
    const service = new PayoutService();
    const base = { userId: 'fixture-owner', minimumThreshold: 100, currency: 'USD',
      frequency: 'monthly', preferredMethod: 'paypal', paypalEmail: 'owner@example.invalid', autoPayoutEnabled: false };
    for (const bankDetails of [{ accountNumber: 'synthetic-account', routingNumber: 'synthetic-routing' }, {}, 'unexpected']) {
      await assert.rejects(service.setPaymentPreferences({ ...base, bankDetails }), /bank account details/);
    }
    assert.equal(writes.length, 0);
    assert.equal(await service.getPaymentPreferences(base.userId), null);
    await service.setPaymentPreferences(base);
    assert.deepEqual(writes, [{ key: 'payment_prefs:fixture-owner', value: base }]);
    assert.deepEqual(await service.getPaymentPreferences(base.userId), base);
  } finally { delete globalThis.__providerOnlyPrefs; }
});

test('royalty split acceptance rejects bank credentials without storage writes and preserves provider identity', async () => {
  const writes = [];
  globalThis.__providerOnlySplits = { updateRoyaltySplit: async (id, value) => {
    writes.push({ id, value }); return { id, ...value };
  } };
  try {
    const { DistributionService } = await loadIsolatedClosed('server/services/distributionService.ts', {
      '../storage': 'export const storage = globalThis.__providerOnlySplits;',
    });
    const service = new DistributionService();
    for (const details of [{ payoutMethod: 'bank' }, { payoutMethod: 'stripe', bankDetails: {} },
      { payoutMethod: 'paypal', bankDetails: { accountNumber: 'synthetic-account' } }]) {
      await assert.rejects(service.acceptRoyaltySplit('split', 'owner', details), /Direct bank details/);
    }
    assert.equal(writes.length, 0);
    for (const details of [{ payoutMethod: 'stripe', stripeAccountId: 'acct_fixture' },
      { payoutMethod: 'paypal', paypalEmail: 'owner@example.invalid' }]) {
      const result = await service.acceptRoyaltySplit('split', 'owner', details);
      assert.equal(result.userId, 'owner');
      assert.equal(result.status, 'accepted');
      assert.equal(result.payoutMethod, details.payoutMethod);
      assert.equal(result.stripeAccountId, details.stripeAccountId);
      assert.equal(result.paypalEmail, details.paypalEmail);
      assert.equal(Object.hasOwn(result, 'bankDetails'), false);
    }
    assert.equal(writes.length, 2);
  } finally { delete globalThis.__providerOnlySplits; }
});

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
