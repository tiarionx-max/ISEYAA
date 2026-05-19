import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://iseyaa-api.railway.app';

export default function eventsFlow() {
  const res = http.get(
    `${BASE_URL}/api/v1/events?page=1&limit=10`,
    { tags: { endpoint: 'events' } },
  );

  check(res, {
    'events list status 200': (r) => r.status === 200,
  });

  sleep(1);
}
