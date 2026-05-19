import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://iseyaa-api.railway.app';

export default function authFlow() {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({
      phone: __ENV.TEST_PHONE,
      password: __ENV.TEST_PASSWORD,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'auth' },
    },
  );

  check(res, {
    'auth login status 200': (r) => r.status === 200,
  });

  sleep(1);
}
