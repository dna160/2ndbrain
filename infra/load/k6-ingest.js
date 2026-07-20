// Phase 8 load test (docs/03) — 20 concurrent voice-note ingests; assert no drops.
// Run against a seeded stack: k6 run -e BASE=http://localhost:3001 -e SECRET=<relay-secret> infra/load/k6-ingest.js
import http from 'k6/http';
import crypto from 'k6/crypto';
import { check } from 'k6';

export const options = {
  scenarios: {
    burst: { executor: 'per-vu-iterations', vus: 20, iterations: 5, maxDuration: '2m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // <1% errors — no silent drops
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE = __ENV.BASE || 'http://localhost:3001';
const SECRET = __ENV.SECRET || 'relay-secret-at-least-16';

export default function () {
  const msgId = `wamid.LOAD-${__VU}-${__ITER}`;
  const body = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'PN' },
              messages: [
                { id: msgId, from: `62810000${__VU}`, type: 'audio', timestamp: '1700000000', audio: { id: `MID-${__VU}-${__ITER}`, mime_type: 'audio/ogg' } },
              ],
            },
          },
        ],
      },
    ],
  });
  const ts = String(Date.now());
  const sig = crypto.hmac('sha256', SECRET, `${ts}.${body}`, 'hex');
  const res = http.post(`${BASE}/ingest/wa`, body, {
    headers: { 'Content-Type': 'application/json', 'x-relay-timestamp': ts, 'x-relay-signature': sig },
  });
  check(res, { 'ingest 200': (r) => r.status === 200 });
}
