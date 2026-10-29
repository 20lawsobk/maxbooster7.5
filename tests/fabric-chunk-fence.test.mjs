import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFabricChunkFence } from '../external/pdim/lib/db/src/fabricChunkFence.ts';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
class MockPool {
  static held = new Set();
  static released = [];
  static queries = [];
  constructor(options = {}) { this.options = options; }
  on() {}
  async connect() {
    const client = {
      held: null, handlers: new Set(),
      on(_event, handler) { this.handlers.add(handler); },
      removeListener(_event, handler) { this.handlers.delete(handler); },
      release(discard = false) { MockPool.released.push(discard); },
      async query(query, values) {
        MockPool.queries.push(query);
        if (query.startsWith('SELECT pg_advisory_xact_lock')) {
          const key = values[0];
          while (MockPool.held.has(key)) await wait(2);
          MockPool.held.add(key);
          this.held = key;
        }
        if (query === 'COMMIT' || query === 'ROLLBACK') {
          if (this.held) MockPool.held.delete(this.held);
          this.held = null;
        }
        return { rows: [] };
      },
    };
    return client;
  }
}
const source = new MockPool({ application_name: 'test' });
const fenced = createFabricChunkFence(source);
const secondWorker = createFabricChunkFence(new MockPool({ application_name: 'second-worker' }));

test('same chunk cannot overlap across independent fence holders', async () => {
  const sequence = [];
  const one = fenced('same', async () => { sequence.push('one-start'); await wait(25); sequence.push('one-end'); });
  await wait(4);
  const two = secondWorker('same', async () => { sequence.push('two-start'); sequence.push('two-end'); });
  await Promise.all([one, two]);
  assert.deepEqual(sequence, ['one-start', 'one-end', 'two-start', 'two-end']);
  assert.equal(MockPool.held.size, 0);
});

test('different chunks do not block each other', async () => {
  let entered = 0;
  await Promise.all([fenced('a', async () => { entered++; await wait(20); assert.equal(entered, 2); }),
    fenced('b', async () => { entered++; await wait(20); assert.equal(entered, 2); })]);
});

test('callback failure rolls back, releases the fence and propagates error', async () => {
  await assert.rejects(fenced('failure', async () => { throw Error('disk unavailable'); }), /disk unavailable/);
  assert.equal(MockPool.held.size, 0);
  assert.ok(MockPool.queries.includes('ROLLBACK'));
  assert.equal(await fenced('failure', async () => 42), 42);
});

test('fence client error fails closed before COMMIT', async () => {
  const original = MockPool.prototype.connect;
  MockPool.prototype.connect = async function() {
    const client = await original.call(this);
    const query = client.query.bind(client);
    client.query = async function(sql, values) {
      const result = await query(sql, values);
      if (sql.startsWith('SELECT pg_advisory_xact_lock')) for (const cb of this.handlers) cb(Error('connection lost'));
      return result;
    };
    return client;
  };
  try {
    await assert.rejects(fenced('error', async () => 1), /connection lost/);
    assert.equal(MockPool.released.at(-1), true);
    assert.equal(MockPool.held.size, 0);
  } finally { MockPool.prototype.connect = original; }
});
