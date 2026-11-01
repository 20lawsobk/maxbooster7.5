import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findChromium } from './helpers-browser-processes.mjs';

test('browser discovery honors explicit selection and executable PATH entries', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-discovery-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const executable = path.join(directory, 'chromium');
  fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  assert.equal(findChromium({ PATH: directory }), executable);
  assert.equal(findChromium({ REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE: executable }), executable);
  assert.equal(findChromium({ CHROMIUM_PATH: '/missing-explicit-browser', PATH: directory }), undefined);
  fs.chmodSync(executable, 0o644);
  assert.equal(findChromium({ PATH: directory }), undefined);
  assert.equal(findChromium({ CHROMIUM_PATH: directory }), undefined);
});
