import type { Metric } from 'web-vitals';

const VITALS_ENDPOINT = '/api/metrics/web-vitals';

function send(metric: Metric): void {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    page: window.location.pathname,
    ts: Date.now(),
  });

  if (typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(VITALS_ENDPOINT, blob)) return;
    } catch {
      // fall through to fetch
    }
  }

  void fetch(VITALS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => undefined);
}

export function reportWebVitals(): void {
  if (typeof window === 'undefined') return;

  void import('web-vitals')
    .then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
      onCLS(send);
      onINP(send);
      onLCP(send);
      onFCP(send);
      onTTFB(send);
    })
    .catch((err) => {
      if (import.meta.env.DEV) {
        console.warn('[web-vitals] failed to load:', err);
      }
    });
}
