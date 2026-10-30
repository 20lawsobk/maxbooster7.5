import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mayReadDirectStorageObject as canRead } from '../server/services/directStorageReadPolicy.ts';

const active = { userId: 'owner', deletedAt: null };

describe('authenticated direct-storage fallback authorization', () => {
  it('allows a tracked object only to its owner', () => {
    assert.equal(canRead('owner', 'legacy/random.wav', active, null), true);
    assert.equal(canRead('other', 'legacy/random.wav', active, null), false);
  });
  it('denies unknown unprefixed keys rather than falling back to raw object storage', () => {
    assert.equal(canRead('other', 'owner/private.wav', undefined, null), false);
    assert.equal(canRead('other', 'studio-renders/secret.wav', undefined, null), false);
    assert.equal(canRead('other', 'storefronts/private.wav', undefined, null), false);
  });
  it('preserves legacy own-prefixed objects but denies another owner', () => {
    assert.equal(canRead('owner', 'users/owner/audio/file.wav', undefined, null), true);
    assert.equal(canRead('other', 'users/owner/audio/file.wav', undefined, null), false);
    assert.equal(canRead('owner', 'users/owner', undefined, null), false);
  });
  it('trusts a database owner over a spoofed own-prefix key', () => {
    assert.equal(canRead('owner', 'users/owner/audio/file.wav', { userId: 'other' }, null), false);
  });
  it('allows only separately verified completed-order stem access', () => {
    assert.equal(canRead('buyer', 'other/private-stem.wav', undefined, true), true);
    assert.equal(canRead('buyer', 'other/private-stem.wav', undefined, false), false);
    assert.equal(canRead('buyer', 'other/private-stem.wav', undefined, null), false);
  });
  it('never returns a soft-deleted tracked file, even with a stem entitlement', () => {
    assert.equal(canRead('owner', 'legacy/file.wav', { userId: 'owner', deletedAt: new Date() }, null), false);
    assert.equal(canRead('buyer', 'legacy/file.wav', { userId: 'owner', deletedAt: new Date() }, true), false);
  });
  it('denies an absent authenticated principal', () => {
    assert.equal(canRead('', 'users/owner/file.wav', undefined, true), false);
    assert.equal(canRead('', 'users/owner/file.wav', active, null), false);
  });
});
