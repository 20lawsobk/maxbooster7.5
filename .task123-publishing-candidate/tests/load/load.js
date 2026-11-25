// Load test — baseline capacity. Ramp 0→50 VUs, hold, ramp down.
// Finds the knee where latency degrades. Tests critical paths.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },  // ramp up
    { duration: '5m', target: 50 },  // hold
    { duration: '2m', target: 0 },   // ramp down
  ],
  tags: { test_type: 'load' },
  thresholds: {
    http_req_failed: ['rate<0.005'],           // 99.5% success
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    'http_req_duration{test_type:load}': ['p(95)<600'],
    checks: ['rate>0.99'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const API_KEY = __ENV.API_KEY || '';

function headers() {
  return API_KEY
    ? { headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' } }
    : { headers: { 'Content-Type': 'application/json' } };
}

export default function () {
  // Critical path 1: health (DB + Redis deep check).
  const health = http.get(`${BASE_URL}/health`, headers());
  check(health, { 'health 200': (r) => r.status === 200 });

  // Critical path 2: authenticated API (heaviest DB queries).
  // Adjust path to your heaviest endpoint.
  const api = http.get(`${BASE_URL}/api/director/platforms`, headers());
  check(api, {
    'platforms 200 or 401': (r) => r.status === 200 || r.status === 401,
    'not 500': (r) => r.status !== 500,
  });

  sleep(0.5);
}
