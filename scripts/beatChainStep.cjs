#!/usr/bin/env node
/**
 * beatChainStep.cjs
 * One-shot chain stepper — call it any time.
 * - If current cycle is still running: prints status and exits 0
 * - If current cycle finished/failed: fires the next genre
 * - If all genres have been fired: prints summary and exits 0
 *
 * State is entirely in the DB (beat_money_loop_cycles table), no file state.
 */

const { neon } = require('@neondatabase/serverless');
const http = require('http');

const s = neon(process.env.NEON_DATABASE_URL);
const API_HOST = '127.0.0.1';
const API_PORT = 5000;
const API_PATH = '/api/dev/trigger-beat';

// Ordered genre/mood targets for this session
const GENRES = [
  { genre: 'drill',      mood: 'aggressive',  key: 'C# Minor' },
  { genre: 'hiphop',     mood: 'empowering',  key: 'G Minor'  },
  { genre: 'r&b',        mood: 'melancholic', key: 'Eb Minor' },
  { genre: 'pop',        mood: 'energetic',   key: 'C Major'  },
  { genre: 'electronic', mood: 'euphoric',    key: 'D Minor'  },
  { genre: 'dancehall',  mood: 'energetic',   key: 'A Major'  },
  { genre: 'lofi',       mood: 'chill',       key: 'F Major'  },
  { genre: 'afrobeats',  mood: 'euphoric',    key: 'E Minor'  },
];

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: API_HOST, port: API_PORT, path: API_PATH,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

function checkMaxCore() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'secure-ai-forge.replit.app',
      port: 443,
      path: '/api/platform/model/info',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${process.env.MAXCORE_API_KEY || process.env.MAXCORE_ADMIN_KEY || ''}` },
      timeout: 8000,
    }, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve(res.statusCode < 500));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    // Need https for external
    req.end();
  });
}

async function main() {
  // Fetch all cycles ordered oldest→newest
  const rows = await s`
    SELECT id, status, started_at, error_message
    FROM beat_money_loop_cycles
    ORDER BY started_at ASC
  `;

  const chainStart = new Date('2026-07-23T02:58:43.000Z');
  const chainRows = rows.filter(r => new Date(r.started_at) >= chainStart);
  
  console.log(`Total cycles: ${rows.length}, Chain cycles: ${chainRows.length}`);
  
  if (chainRows.length === 0) {
    console.log('No chain cycles yet — firing first genre');
    await fireNext(0);
    return;
  }
  
  const latest = chainRows[chainRows.length - 1];
  console.log(`Latest chain cycle: status=${latest.status} started=${latest.started_at}`);
  
  if (latest.status === 'generating' || latest.status === 'producing') {
    const elapsed = Math.round((Date.now() - new Date(latest.started_at)) / 1000);
    console.log(`Still running (${elapsed}s elapsed) — nothing to do yet`);
    return;
  }
  
  // Latest cycle is done (failed/listed/completed)
  const nextIdx = chainRows.length; // 0-based: if 1 done → fire index 1
  
  if (nextIdx >= GENRES.length) {
    console.log(`All ${GENRES.length} genres fired. Summary:`);
    chainRows.forEach((r, i) => {
      const g = GENRES[i] || { genre:'?', mood:'?' };
      const succeeded = r.status === 'listed' || r.status === 'completed';
      console.log(`  [${i+1}] ${g.genre}×${g.mood} → ${r.status} ${succeeded ? '✅' : '❌'}`);
    });
    const succeeded = chainRows.filter(r => r.status === 'listed' || r.status === 'completed').length;
    console.log(`\nResult: ${succeeded}/${GENRES.length} beats succeeded`);
    return;
  }

  // Check MaxCore before firing next (don't burn genres when MaxCore is down)
  // Use https module for external
  const { request } = require('https');
  const mcReachable = await new Promise((resolve) => {
    const r = request({
      hostname: 'secure-ai-forge.replit.app',
      port: 443,
      path: '/api/platform/model/info',
      method: 'GET',
      timeout: 8000,
    }, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    r.on('error', () => resolve(false));
    r.on('timeout', () => { r.destroy(); resolve(false); });
    r.end();
  });

  if (!mcReachable) {
    console.log(`MaxCore unreachable — not firing next genre yet (${nextIdx} chain cycles done, ${GENRES.length - nextIdx} remaining)`);
    console.log(`Next up: ${GENRES[nextIdx].genre}×${GENRES[nextIdx].mood}`);
    return;
  }
  
  console.log(`MaxCore reachable ✅ — firing genre[${nextIdx}]: ${GENRES[nextIdx].genre}×${GENRES[nextIdx].mood}`);
  await fireNext(nextIdx);
}

async function fireNext(idx) {
  const g = GENRES[idx];
  try {
    const r = await post(g);
    console.log(`Fired ${g.genre}×${g.mood}: HTTP ${r.status} — ${r.body.slice(0, 120)}`);
  } catch (e) {
    console.error(`Fire failed: ${e.message}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
