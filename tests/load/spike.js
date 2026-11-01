// Spike test — elasticity. Sudden 10x jump, verify graceful degradation.
// Must not cascade; must recover within 30s of spike end.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // baseline
    { duration: '30s', target: 100 }, // spike to 10x
    { duration: '2m', target: 100 },  // hold spike
    { duration: '30s', target: 10 },  // drop back
    { duration: '1m', target: 10 },   // recovery
  ],
  tags: { test_type: 'spike' },
  thresholds: {
    // Relaxed during spike — we assert no cascading failure, not SLO compliance.
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(99)<5000'],
    checks: ['rate>0.95'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function () {
  const r = http.get(`${BASE_URL}/health`);
  check(r, {
    'responds (not timeout)': (r) => r.status !== 0,
    'not 500': (r) => r.status !== 500,
  });
  sleep(0.3);
}
