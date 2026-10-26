/* global __ENV */
import http from 'k6/http';
import { check } from 'k6';

// Run only against an authorized isolated deployment; default traffic is one local read/second.
const base = (__ENV.BASE_URL || 'http://127.0.0.1:2008').replace(/\/$/, '');
const target = __ENV.TARGET_PATH || '/api/server/status';
const allowed = new Set(['/api/server/status', '/api/portal/world', '/api/map/realtime', '/api/player']);
if (!allowed.has(target.split('?')[0])) throw new Error('TARGET_PATH must be an approved read endpoint.');
const rate = Number(__ENV.RATE || 1);
const workers = Number(__ENV.VUS || 20);
if (!Number.isSafeInteger(rate) || rate < 1 || !Number.isSafeInteger(workers) || workers < 1)
  throw new Error('RATE and VUS must be positive integers.');
if (target !== '/api/server/status' && !__ENV.SESSION_COOKIE)
  throw new Error('Protected workloads require a test SESSION_COOKIE.');

export const options = {
  scenarios: {
    reads: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: workers,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    checks: ['rate>0.99'],
    // A generator that cannot deliver its requested rate must not produce a capacity "pass".
    dropped_iterations: ['count==0'],
  },
};

export default function readDashboard() {
  const response = http.get(`${base}${target}`, {
    headers: __ENV.SESSION_COOKIE ? { Cookie: __ENV.SESSION_COOKIE } : {},
    timeout: '10s',
    redirects: 0,
    tags: { name: target.split('?')[0] },
  });
  check(response, { 'successful data response': (result) => result.status === 200 });
}
