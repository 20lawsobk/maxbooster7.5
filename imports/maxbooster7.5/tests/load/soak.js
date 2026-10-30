// Soak test — 30 min at moderate load. Catches memory leaks,
// connection-pool drift, slow degradation.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '26m', target: 50 },  // soak
    { duration: '2m', target: 0 },
  ],
  tags: { test_type: 'soak' },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    checks: ['rate>0.99'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function () {
  const r = http.get(`${BASE_URL}/health`);
  check(r, { 'health 200': (r) => r.status === 200 });
  sleep(1);
}
