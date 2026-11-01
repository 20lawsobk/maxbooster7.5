// Smoke test — CI gate. 5 VUs, 1 minute.
// Catches wiring errors, verifies harness works. Thresholds relaxed.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '1m',
  tags: { test_type: 'smoke' },
  thresholds: {
    http_req_failed: ['rate<0.05'],  // relaxed for smoke
    http_req_duration: ['p(95)<2000'],
    checks: ['rate>0.95'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function () {
  // Health check (unauthenticated).
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'health 200': (r) => r.status === 200,
  });

  // API root (may require auth — just check it responds, not 500).
  const api = http.get(`${BASE_URL}/api/health`);
  check(api, {
    'api responds (not 500)': (r) => r.status !== 500,
  });

  sleep(1);
}
