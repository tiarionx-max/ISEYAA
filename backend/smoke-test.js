const http = require('http');

let token = null;
let passed = 0;
let failed = 0;

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3001,
      path: `/api/v1${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      let chunks = '';
      res.on('data', (d) => (chunks += d));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); }
        catch { resolve({ status: res.statusCode, body: chunks }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function check(label, condition, detail = '') {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

async function run() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     ISEYAA API SMOKE TEST                ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ── Public endpoints ──────────────────────────────────────────────────────
  console.log('── Public Endpoints ──');

  let r = await req('GET', '/lgas');
  check('GET /lgas → 200, 20 LGAs', r.status === 200 && r.body.length === 20,
    `status=${r.status} count=${r.body?.length}`);

  // Attractions returns array directly (not paginated)
  r = await req('GET', '/attractions?limit=5');
  check('GET /attractions → 200 with array', r.status === 200 && Array.isArray(r.body),
    `status=${r.status} type=${typeof r.body} isArr=${Array.isArray(r.body)}`);
  check('Attractions returns data', Array.isArray(r.body) && r.body.length > 0,
    `count=${r.body?.length}`);

  r = await req('GET', '/lgas/abeokuta-south');
  check('GET /lgas/abeokuta-south → 200', r.status === 200, `status=${r.status}`);
  check('LGA name correct', r.body?.name === 'Abeokuta South', `name=${r.body?.name}`);

  r = await req('GET', '/events?limit=3');
  check('GET /events → 200', r.status === 200, `status=${r.status} body=${JSON.stringify(r.body).slice(0,50)}`);

  r = await req('GET', '/studio/feed');
  check('GET /studio/feed → 200', r.status === 200, `status=${r.status}`);

  // Marketplace products at /products (not /marketplace/products)
  r = await req('GET', '/products?limit=3');
  check('GET /products → 200', r.status === 200, `status=${r.status}`);

  // Stays properties at /properties
  r = await req('GET', '/properties?limit=3');
  check('GET /properties → 200', r.status === 200, `status=${r.status}`);

  // ── Auth ──────────────────────────────────────────────────────────────────
  console.log('\n── Auth ──');

  // Use timestamp + random to avoid both email AND phone conflicts
  const ts = Date.now();
  // +234 803 XXXXXXX — valid MTN Nigeria format (10 digits after +234)
  const testPhone = `+234803${ts.toString().slice(-7)}`;
  const testEmail = `smoketest${ts}@iseyaa.ng`;

  r = await req('POST', '/auth/register', {
    email: testEmail,
    phone: testPhone,
    password: 'SmokeTest1!',
    firstName: 'Smoke',
    lastName: 'Test',
    ndpaConsent: true,
  });
  check('POST /auth/register → 201', r.status === 201,
    `status=${r.status} err=${JSON.stringify(r.body?.message)}`);
  check('Register returns accessToken', !!r.body?.accessToken);
  check('Register user.role=CITIZEN', r.body?.user?.role === 'CITIZEN');
  token = r.body?.accessToken;

  // Login with identifier (email or phone)
  r = await req('POST', '/auth/login', {
    identifier: testEmail,
    password: 'SmokeTest1!',
  });
  check('POST /auth/login → 200/201', r.status === 200 || r.status === 201,
    `status=${r.status} err=${r.body?.message}`);
  check('Login returns accessToken', !!r.body?.accessToken);
  token = r.body?.accessToken ?? token;

  // Login by phone
  r = await req('POST', '/auth/login', {
    identifier: testPhone,
    password: 'SmokeTest1!',
  });
  check('Login by phone → 200/201', r.status === 200 || r.status === 201,
    `status=${r.status}`);

  // Wrong password
  r = await req('POST', '/auth/login', {
    identifier: testEmail,
    password: 'WrongPass123!',
  });
  check('Login with wrong password → 401', r.status === 401, `status=${r.status}`);

  // ── Authenticated endpoints ───────────────────────────────────────────────
  console.log('\n── Authenticated Endpoints ──');

  const auth = { Authorization: `Bearer ${token}` };

  r = await req('GET', '/users/me', null, auth);
  check('GET /users/me → 200', r.status === 200, `status=${r.status}`);
  check('/users/me returns correct email', r.body?.email?.includes('smoketest'), `email=${r.body?.email}`);

  r = await req('GET', '/wallet/balance', null, auth);
  check('GET /wallet/balance → 200', r.status === 200,
    `status=${r.status} body=${JSON.stringify(r.body).slice(0,80)}`);
  check('balance_ngn is 0', r.body?.balance_ngn === 0);
  check('kyc_tier is number', typeof r.body?.kyc_tier === 'number', `tier=${r.body?.kyc_tier}`);
  check('daily_limit_ngn is number', typeof r.body?.daily_limit_ngn === 'number');

  r = await req('GET', '/wallet/transactions?limit=5', null, auth);
  check('GET /wallet/transactions → 200', r.status === 200, `status=${r.status}`);
  check('Transactions cursor meta present', r.body?.meta?.hasNext === false,
    `meta=${JSON.stringify(r.body?.meta)}`);

  r = await req('GET', '/studio/slots', null, auth);
  check('GET /studio/slots (authenticated) → 200', r.status === 200, `status=${r.status}`);

  // ── CBN daily limit ───────────────────────────────────────────────────────
  console.log('\n── CBN Tier Limit ──');

  r = await req('POST', '/wallet/topup', { amount: 1000, email: testEmail }, auth);
  // Phone is set → Tier 1 → ₦50K limit. ₦1K is within limit, but Paystack isn't wired in smoke test
  // We expect either a Paystack error or success (both mean the tier check passed)
  check('POST /wallet/topup → not 400 tier error', r.status !== 400 || !r.body?.message?.includes('limit'),
    `status=${r.status} msg=${r.body?.message}`);

  // Exceed tier 1 limit (₦50K+1)
  r = await req('POST', '/wallet/topup', { amount: 51000, email: testEmail }, auth);
  check('POST /wallet/topup ₦51K as Tier 1 → 400 daily limit', r.status === 400,
    `status=${r.status} msg=${r.body?.message}`);

  // ── Role guards ───────────────────────────────────────────────────────────
  console.log('\n── Role Guards ──');

  r = await req('GET', '/admin/dashboard', null, auth);
  check('GET /admin/dashboard as CITIZEN → 403', r.status === 403, `status=${r.status}`);

  r = await req('PATCH', '/admin/vendors/fake-id/status', { status: 'ACTIVE' }, auth);
  check('PATCH /admin/vendors/:id/status as CITIZEN → 403', r.status === 403, `status=${r.status}`);

  // Studio upload requires CREATIVE role (CITIZEN → 403)
  r = await req('POST', '/studio/content/upload', {}, auth);
  check('POST /studio/content/upload as CITIZEN → 403', r.status === 403, `status=${r.status}`);

  // ── Auth guards ───────────────────────────────────────────────────────────
  console.log('\n── Auth Guards (unauthenticated) ──');

  r = await req('GET', '/wallet/balance');
  check('GET /wallet/balance no token → 401', r.status === 401, `status=${r.status}`);

  r = await req('GET', '/users/me');
  check('GET /users/me no token → 401', r.status === 401, `status=${r.status}`);

  r = await req('POST', '/studio/bookings', { slotId: 'x', startTime: new Date().toISOString(), durationHours: 1 });
  check('POST /studio/bookings no token → 401', r.status === 401, `status=${r.status}`);

  // ── HMAC webhook guard ────────────────────────────────────────────────────
  console.log('\n── Webhook Security ──');

  r = await req('POST', '/webhooks/paystack', { event: 'charge.success' });
  check('Webhook without x-paystack-signature → 401', r.status === 401, `status=${r.status}`);

  r = await req('POST', '/webhooks/paystack', { event: 'charge.success' }, { 'x-paystack-signature': 'bad-sig' });
  check('Webhook with bad signature → 401', r.status === 401, `status=${r.status}`);

  // ── Summary ──────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n╔══════════════════════════════════════════╗`);
  const status = failed === 0 ? 'ALL GREEN ✓' : `${failed} FAILED ✗`;
  console.log(`║  ${passed}/${total} passed  ${status.padEnd(20)}║`);
  console.log(`╚══════════════════════════════════════════╝`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
