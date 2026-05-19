// Run locally (smoke test, 50 VUs): k6 run --vus 50 --duration 60s load-tests/k6/main.js
// Full acceptance run (10K VUs): k6 run --env BASE_URL=https://staging.railway.app load-tests/k6/main.js
// Requires: k6 binary installed (choco install k6 on Windows)
// Requires: TEST_PHONE and TEST_PASSWORD env vars for authenticated endpoints

import authFlow from './scenarios/auth-flow.js';
import walletFlow from './scenarios/wallet-flow.js';
import eventsFlow from './scenarios/events-flow.js';
import transportFlow from './scenarios/transport-flow.js';

export const options = {
  stages: [
    { duration: '2m', target: 500 },
    { duration: '3m', target: 10000 },
    { duration: '5m', target: 10000 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'http_req_failed': ['rate<0.001'],
    'http_req_duration{endpoint:wallet}': ['p(95)<500'],
    'http_req_duration{endpoint:events}': ['p(95)<500'],
    'http_req_duration{endpoint:auth}': ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://iseyaa-api.railway.app';

export default function () {
  authFlow();
  walletFlow();
  eventsFlow();
  transportFlow();
}
