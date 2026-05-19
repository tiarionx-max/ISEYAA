import http from 'k6/http';
import { check, sleep } from 'k6';
import { getToken } from '../common/auth.js';

const BASE_URL = __ENV.BASE_URL || 'https://iseyaa-api.railway.app';

export default function walletFlow() {
  const token = getToken(BASE_URL, __ENV.TEST_PHONE, __ENV.TEST_PASSWORD);

  const res = http.get(
    `${BASE_URL}/api/v1/wallet/balance`,
    {
      headers: { Authorization: `Bearer ${token}` },
      tags: { endpoint: 'wallet' },
    },
  );

  check(res, {
    'wallet balance status 200': (r) => r.status === 200,
  });

  sleep(1);
}
