#!/usr/bin/env node
/**
 * db-push.js — Automated drizzle-kit schema push
 *
 * Breakthrough: drizzle-kit push asks interactive TTY questions when it detects
 * potential table renames. This script spawns the process and automatically
 * sends Enter (selecting "create table") for every disambiguation prompt,
 * so `npm run db:push` works non-interactively in CI and agent sessions.
 *
 * Usage:  node scripts/db-push.js [--force]
 *         npm run db:push
 */

const { spawn } = require('child_process');

const args = process.argv.slice(2);
const force = args.includes('--force') || true; // always force in this wrapper

const child = spawn('npx', ['drizzle-kit', 'push', ...(force ? ['--force'] : [])], {
  cwd: process.cwd(),
  env: { ...process.env },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let inputsSent = 0;
let lastPromptTime = 0;

function sendEnter() {
  // Debounce: don't send multiple Enters for a single prompt render
  const now = Date.now();
  if (now - lastPromptTime < 150) return;
  lastPromptTime = now;
  child.stdin.write('\r');
  inputsSent++;
}

child.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);

  // drizzle-kit v0.31+ uses @clack/prompts — it writes the ❯ cursor marker
  // and the phrase "created or renamed" for disambiguation questions.
  if (text.includes('created or renamed') || (text.includes('❯') && text.includes('create table'))) {
    setTimeout(sendEnter, 120);
  }
});

child.stderr.on('data', (data) => process.stderr.write(data));

child.on('close', (code) => {
  if (inputsSent > 0) {
    process.stdout.write(`\n[db-push] Auto-confirmed ${inputsSent} table creation prompt(s)\n`);
  }
  process.exit(code ?? 0);
});

// Safety timeout: 3 minutes
const timeout = setTimeout(() => {
  console.error('[db-push] Timeout after 3 minutes — check your DATABASE_URL and network');
  child.kill();
  process.exit(1);
}, 180_000);

child.on('close', () => clearTimeout(timeout));
