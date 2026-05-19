import http from 'k6/http';
import { check, sleep } from 'k6';
import { getToken } from '../common/auth.js';

const BASE_URL = __ENV.BASE_URL || 'https://iseyaa-api.railway.app';

export default function transportFlow() {
  const token = getToken(BASE_URL, __ENV.TEST_PHONE, __ENV.TEST_PASSWORD);

  const res = http.post(
    `${BASE_URL}/api/v1/transport/estimate`,
    JSON.stringify({
      vehicleType: 'BIKE',
      pickupLat: 6.889,
      pickupLng: 3.721,
      dropoffLat: 6.900,
      dropoffLng: 3.730,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      tags: { endpoint: 'transport' },
    },
  );

  check(res, {
    'transport estimate status 200 or 201': (r) => r.status === 200 || r.status === 201,
  });

  sleep(1);
}
