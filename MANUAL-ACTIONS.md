# ISEYAA — Manual Actions Required (Phases 1–6)

Everything Claude cannot do for you. Work through each section in order. Each section has a **Resume Signal** — reply with it when done so Claude can proceed to the next phase's automated work or create gap-closure plans if anything fails.

---

## Environment Setup (do this first — required by all phases)

Generate your `ENCRYPTION_KEY` (required for KYC — backend won't start without it):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output into your `.env` file as `ENCRYPTION_KEY=<64-hex-chars>`.

Full list of env vars that need real values before production (stub mode is acceptable for dev testing — see Phase 5 section):

| Variable | Service | Where to get it |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL | Neon dashboard → Connection string, `-pooler` endpoint, add `connection_limit`/`pool_timeout` query params (no legacy `pgbouncer` query parameter — that's for standalone PgBouncer, not Neon's managed proxy) |
| `REDIS_URL` | Upstash Redis | Upstash Console → Redis database → REST URL |
| `PAYSTACK_SECRET_KEY` | Paystack | Paystack dashboard → Settings → API Keys |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack | Paystack dashboard → Settings → Webhooks |
| `ANTHROPIC_API_KEY` | Claude AI | console.anthropic.com → API Keys |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Cloudflare R2 | R2 dashboard → Manage R2 API tokens |
| `AWS_S3_BUCKET` | Cloudflare R2 | Your R2 bucket name |
| `AWS_REGION` | Cloudflare R2 | `auto` (R2 uses `auto` as region) |
| `AWS_CLOUDFRONT_URL` | R2 public domain | Your R2 public bucket URL |
| `SENDGRID_API_KEY` | SendGrid | app.sendgrid.com → Settings → API Keys |
| `RESEND_API_KEY` | Resend | resend.com → API Keys |
| `TERMII_API_KEY` | Termii SMS | termii.com → developer portal |
| `FIREBASE_SERVER_KEY` | FCM push | Firebase Console → Project Settings → Cloud Messaging |
| `ENCRYPTION_KEY` | KYC (AES-256-GCM) | Generate above |
| `UPSTASH_VECTOR_REST_URL` | AI vector search | Upstash Console → Vector database |
| `UPSTASH_VECTOR_REST_TOKEN` | AI vector search | Upstash Console → Vector database |
| `DOJAH_API_KEY` + `DOJAH_APP_ID` | NIN verification | dojah.io → Developer Console |
| `SMILE_IDENTITY_PARTNER_ID` + `SMILE_IDENTITY_API_KEY` | Liveness check | smileidentity.com → dashboard |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Grafana Cloud | Grafana Cloud → Connections → OpenTelemetry |
| `SENTRY_DSN` | Sentry (backend) | sentry.io → Project Settings → Client Keys |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry (mobile) | sentry.io → Project Settings → Client Keys |
| `INFISICAL_TOKEN` + `INFISICAL_PROJECT_ID` | Secrets manager | app.infisical.com → Project Settings |
| `NEXTAUTH_SECRET` | Web admin auth | `openssl rand -base64 32` |
| `GOOGLE_MAPS_API_KEY` | Maps | Google Cloud Console → APIs & Services |
| `META_WHATSAPP_ACCESS_TOKEN` | Meta Business Cloud API | Meta Business Manager → WhatsApp → API Setup → System User permanent token |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Meta Business Cloud API | Meta Business Manager → WhatsApp → API Setup → Phone number ID |
| `META_WHATSAPP_TEMPLATE_NAME` | Meta Business Cloud API | Meta Business Manager → WhatsApp → Message Templates → approved template name |
| `META_WHATSAPP_TEMPLATE_LANG` | Meta Business Cloud API | Language code of the approved template (default `en_US`) |

> **Stub mode:** If `TERMII_API_KEY`, `DOJAH_API_KEY`, `SMILE_IDENTITY_*`, `UPSTASH_VECTOR_*` are absent, the backend runs in stub mode — OTPs are printed to the console log, KYC tiers auto-verify, and AI personalisation is skipped. Stub mode is acceptable for manual testing.

---

## Phase 2 — Infrastructure Deployment Checkpoint (02-06)

**What was built:** Neon PostgreSQL, Upstash Redis TLS, Cloudflare R2, Typesense, OpenTelemetry + Grafana Cloud, Sentry, and a production Dockerfile that injects secrets from Infisical. Railway deployment config.

**Your job:** Push to GitHub and confirm all infrastructure is wired up correctly on Railway.

### Step 1 — Push to GitHub main
```bash
git push origin main
```
Wait for Railway to detect the push and start a deployment. Expected: green deployment status within 5 minutes.

### Step 2 — Verify Railway service health
```bash
curl https://<your-railway-domain>/api/v1/health
```
Expected: HTTP 200 (or 404 — the service must respond, not time out).

### Step 3 — Verify Neon database (triggers DB write via OTP)
```bash
curl -X POST https://<your-railway-domain>/api/v1/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "+2348000000001"}'
```
Expected: HTTP 200 with `"OTP sent"`.

### Step 4 — Verify Upstash Redis
After Step 3, open Upstash Console → Data Browser. Look for key `otp:+2348000000001` with a 5-minute TTL.

### Step 5 — Verify Cloudflare R2
Upload a test image via the admin or tourism API. Confirm the returned URL contains your R2 public domain (not an S3 URL).

### Step 6 — Verify Grafana Cloud traces
Grafana Cloud → Explore → Traces datasource → search last 15 minutes. Expected: at least one trace from `iseyaa-api` visible.

### Step 7 — Verify Sentry
Visit sentry.io → iseyaa-backend project → Issues. If empty, trigger a test:
```bash
curl https://<railway-domain>/api/v1/nonexistent-route
```
Expected: Sentry captures the 404 within 30 seconds.

### Step 8 — Verify no `.env` files in Railway
Railway Dashboard → Service → Variables. Expected: only `INFISICAL_TOKEN` and `INFISICAL_PROJECT_ID` visible (all other secrets come from Infisical).

### Step 9 — Verify Typesense (if deployed)
```bash
curl https://<railway-domain>/api/v1/search?q=olumo
```
Expected: HTTP 200 with a results array (empty is OK; an error is not).

### Step 10 — Local test suite
```bash
cd c:/Developer/work/ISEYAA/backend && npx jest --passWithNoTests --no-coverage 2>&1 | tail -5
```
Expected: all tests pass.

### Resume Signal
Reply: **`02-approved`** if all 10 steps pass.
If a step fails, reply: **`02-FAIL step N: <description>`**

---

## Phase 3 — Transport Module E2E Checkpoint (03-08)

**What was built:** Transport backend (8 routes + WebSocket GPS gateway), mobile Rider tab (T-1 through T-5), mobile Driver tab (D-1 through D-5), live GPS streaming, wallet credit on trip completion.

**Your job:** Test the full rider ↔ driver flow on two devices (or two simulators).

### Setup
1. Start backend: `npm run dev:backend` — confirm "Application is running on: http://0.0.0.0:3001"
2. Start mobile: `npx expo start --workspace=mobile`
3. Open app on **two devices** (or iOS Simulator + Android Emulator). Log in as:
   - Device A: a test user with role `CITIZEN` (rider)
   - Device B: a test user with role `DRIVER` (driver)
4. Pre-approve the driver account:
   ```sql
   UPDATE drivers SET status = 'APPROVED' WHERE "userId" = '<driver-userId>';
   ```
   (Use Prisma Studio: `cd backend && npx prisma studio` — or run via psql.)

### Step 1 — Tabs visible (both devices)
Confirm a **Transport** tab (Car icon) and a **Driver** tab (Truck icon) appear in the tab bar. Tapping each loads its home screen.

### Step 2 — Driver goes online (Driver device)
Tap the large **GO ONLINE** button. Grant location permission.
Expected: button turns FOREST green, status dot turns green, label changes to "GO OFFLINE". Backend logs show Redis `GEOADD`.

### Step 3 — Rider requests a ride (Rider device)
Tap Transport tab → select "Car" → enter a pickup near the driver's GPS location (within 5 km) → enter a dropoff → tap **Get Fare Estimate**.
Expected: Fare Estimate screen with map, polyline, fare breakdown in GOLD. Tap **Confirm Ride**.

### Step 4 — Driver receives and accepts (Driver device)
Within 60 seconds: driver sees the Incoming Request card with pickup, dropoff, fare, and a 15-second animated countdown timer. Tap **Accept**.
Expected: card dismisses → driver goes to D-3 Active Pickup screen. Rider device automatically advances from T-3 (Matching) to T-4 (Active Trip) showing driver name + rating.

### Step 5 — Live GPS streaming (both devices)
Move the driver device a few steps (or change simulator location ~50 m away).
Expected: within ~2 seconds, the rider's map shows the driver marker at the new position with a smooth animated transition.

### Step 6 — Trip completion + wallet credit (Driver device)
Tap **Complete Trip** → confirm in the bottom sheet → wait for the green banner showing "₦{N} credited to your wallet."
Then verify in the database:
```sql
SELECT reference, amount, gateway, metadata
FROM transactions
WHERE reference LIKE 'ISY-DRV-%'
ORDER BY "createdAt" DESC LIMIT 1;
```
Expected: row exists with `gateway = 'INTERNAL'` and amount = 0.85 × trip fare.

### Step 7 — Rider rates the trip (Rider device)
T-5 Trip Complete screen appears. Tap stars (1–5). Confirm **Done** button is disabled until a rating is selected. After rating + Done, rider returns to T-1.

### Step 8 — Earnings dashboard (Driver device)
On D-5, tap "Today" then "This Week". Confirm totals update and the trip list re-renders. Confirm acceptance rate and avg rating appear.

### Resume Signal
Reply: **`03-approved`** if all 8 steps pass.
If a step fails, reply: **`03-FAIL step N: <description>`**

---

## Phase 4 — Delivery Module E2E Checkpoint (04-08)

**What was built:** Delivery backend (DeliveryService with 12 methods, WebSocket gateway), mobile Delivery tab (D-1 through D-5 sender screens), mobile Rider/Delivery tab (R-1 through R-5 rider screens), OTP + photo dual-gate completion, ISY-RDR- wallet credit.

**Your job:** Test the full sender → rider delivery flow on two devices.

### Setup
1. Backend and Expo running (same as Phase 3 setup).
2. Two devices: one as **Sender** (any role), one as **Rider** (DRIVER role).
3. Approve the rider for delivery:
   ```bash
   curl -X PATCH http://localhost:3001/api/v1/delivery/riders/<rider-id>/approve \
     -H "Authorization: Bearer <admin-or-lga-admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"approved": true}'
   ```

### Step 1 — Tabs visible
Confirm **Delivery** tab (Package icon) and **Rider** tab (Bike icon) appear in the tab bar on both devices.

### Step 2 — Rider profile screen
Rider device → Rider tab → R-1 screen. If rider is not yet APPROVED, "Your KYC is under review" badge appears. After approval (Step Setup above), R-1 shows the go-online button.

### Step 3 — Rider goes online
Rider taps **GO ONLINE**. Status dot turns green. Backend logs confirm Redis `GEOADD riders:online`.

### Step 4 — Sender requests delivery
Sender device → Delivery tab → D-1. Enter:
- Pickup: any Abeokuta address
- Dropoff: any Abeokuta address
- Item description: "Test parcel"
- Weight: **3 kg**

Tap **Get Delivery Quote**. Confirm D-2 shows:
- Base fee: ₦300
- Weight surcharge: > 0 (3 kg = 1 kg above 2 kg free threshold = ₦50 surcharge)
- Total: ₦350

Tap **Confirm Delivery**. D-3 matching screen appears with 60-second countdown.

### Step 5 — Rider receives delivery request
Rider device → R-2 shows incoming delivery card with pickup, item description, fee, 15-second timer bar. Tap **Accept**. Rider navigates to R-3 Pickup screen.

### Step 6 — Live GPS tracking
Sender (D-4) shows rider marker on map. Move Rider device — confirm marker updates within ~3 seconds. Delivery status shows "Picking Up" stage.

### Step 7 — Parcel collected
Rider approaches pickup location within 200 m. **"I've Collected"** CTA activates (was previously disabled). Tap it. Rider navigates to R-4 Active Delivery screen.

### Step 8 — OTP entry
Check SMS on the recipient's phone. If Termii is not configured, check backend logs for:
```
[TERMII STUB] Delivery OTP {OTP} for {phone}
```
Once near the dropoff (within 200 m), R-4 shows 6-digit OTP input cells. Enter the OTP. Cells turn green. Photo upload button activates.

### Step 9 — Photo upload
Tap the photo button → select or take a test photo. Button shows a thumbnail with a green CheckCircle. **Confirm Delivery** CTA activates.

### Step 10 — Delivery confirmation
Tap **Confirm Delivery** → Alert: "₦{amount} will be credited." → Tap **Yes, Confirm**. Credit banner appears with the exact amount. Auto-navigate to R-5 Earnings screen after ~2 seconds. Today's earnings show the credited amount.

### Step 11 — Sender completion
Sender device → D-5 Complete screen: "Delivered!" heading, total fee, proof photo thumbnail. Rate the rider. Tap **Done**.

### Step 12 — Wallet verification
```bash
curl -H "Authorization: Bearer <rider-jwt>" \
  http://localhost:3001/api/v1/wallet/balance
```
Or call the ledger endpoint. Confirm a transaction with reference matching `ISY-RDR-*` and amount = 80% of the delivery fee.

### Resume Signal
Reply: **`04-approved`** if all 12 steps pass.
If a step fails, reply: **`04-FAIL step N: <description>`**

---

## Phase 5 — AI Concierge + KYC Checkpoint (05-07)

**What was built:** KYC three-tier system (BVN → NIN → Liveness) with AES-256-GCM encryption + bcrypt hash for lookup; Claude AI streaming chat with 5 tools; Upstash Vector personalisation; mobile AI chat screen; mobile KYC screen; wallet daily limits from PlatformConfig.

**Your job:** Confirm PII safety, AI streaming, and KYC tier progression.

### Prerequisites
- `ENCRYPTION_KEY` is set in `.env` (see Environment Setup section above — backend will not start without it).
- Decide which services you're using vs stubbing (stubs are OK for dev):

| Service | Stub behavior when env var absent |
|---|---|
| Paystack BVN | Auto-verifies any BVN |
| Dojah NIN | Auto-verifies any NIN |
| Smile Identity | Tier 3 auto-completes |
| Upstash Vector | No AI personalisation (chat still works) |

### Step 1 — AI Chat reachable
Mobile Profile tab → tap **AI Concierge**. Screen header: "AI Concierge"; background: JUNGLE green; empty state shows Bot icon.

### Step 2 — AI Chat streams text
Type "Hello" → send. User bubble appears on right (GOLD-tinted). AI bubble streams token-by-token on left (FOREST-tinted). Completes within ~5 seconds.

### Step 3 — Tool use renders a card
Send: "Show me 3 attractions in Abeokuta". The AI response contains an inline tool card with a MapPin icon and a label like "Found 3 attractions". AI narrates the results below.

### Step 4 — Chat history persists
Fully close the app (swipe-kill on iOS / Force Stop on Android). Reopen → navigate to AI Concierge. Prior messages are still visible.

### Step 5 — Vector personalisation (skip if Upstash not configured)
After Step 2, check backend logs. If real Upstash keys are set: no `[UPSTASH VECTOR STUB]` line. If stub mode: the line appears. Either is acceptable.

### Step 6 — KYC screen reachable
Profile → tap **Verify Identity**. Screen header: "Identity Verification". Three tier cards render: Tier 1 active (GOLD border), Tiers 2 and 3 locked.

### Step 7 — BVN verification (Tier 1)
Enter test BVN `22248185000` (or any 11 digits in stub mode). Tap **Verify BVN**. Brief pending state → Tier 1 transitions to green "Verified" with a date. Tier 2 unlocks.
Check backend logs: confirm `KYC_BVN_VERIFIED` audit entry exists. The BVN digits must NOT appear anywhere in the logs.

### Step 8 — NIN verification (Tier 2)
Enter any 11-digit NIN. Tap **Verify NIN**. Tier 2 → verified. Tier 3 unlocks. Audit log shows `KYC_NIN_VERIFIED`.

### Step 9 — Liveness (Tier 3)
Tap **Start Liveness Check**. In stub mode: Tier 3 auto-verifies immediately. In real mode (Development Build only): Smile Identity SDK launches.

### Step 10 — Wallet limit updates
```bash
curl -H "Authorization: Bearer <user-jwt>" \
  http://localhost:3001/api/v1/wallet/balance
```
Confirm `daily_limit_ngn` is `5000000` (post-Tier-3). This proves the limit reads from PlatformConfig, not hardcoded constants.

### Step 11 — PII hygiene (critical)
Search the backend log output for the BVN and NIN strings you submitted. They must NOT appear anywhere in any log line. Only `userId`, `verified: true`, and action names should be visible.

### Step 12 — Driver KYC banner (optional — only if DRIVER-role test user available)
Log in as a driver with `kycStatus !== 'VERIFIED'`. Open KYC screen. Orange "Driver KYC Pending" banner appears above the tier cards. Have an LGA_ADMIN approve the driver — the banner switches to green "Driver Approved" within ~5 seconds (the screen polls every 5 seconds).

### Resume Signal
Reply: **`05-approved`** if all 12 steps pass.
Reply: **`05-approved-stubs: [list which services were stubbed]`** if some services ran in stub mode.
Reply: **`05-FAIL step N: <description>`** if any step failed.

---

## Phase 6 — QA, Security & Performance Checkpoint (06-06)

**What was built (automated, already done):**
- 4 bugs fixed: admin SQL `v.category` → `v.status`, escrow `checkIn` → `checkOut` cutoff, marketplace stock decrement, webhook rawBody confirmed
- 9 FK indexes applied to Neon (transactions, tickets, bookings, orders, order_items, audit_logs, trips)
- WebP image pipeline (ImageService + stays + events callers)
- 6 cross-user isolation tests (282 total tests passing)
- k6 load test scripts (`load-tests/k6/`)
- Artillery Socket.IO stress test (`load-tests/artillery/`)
- Sentry React Native SDK initialized in mobile
- Hermes JS engine configured in `mobile/app.json`

**Your job:** Run the external QA tools against staging and confirm 7 acceptance criteria.

---

### QA-03 — Data Isolation (automated — run this now)
```bash
cd c:/Developer/work/ISEYAA/backend && npx jest --testPathPattern "isolation" --no-coverage
```
Expected: 6/6 tests pass.

---

### QA-05 — Database Index Audit (EXPLAIN ANALYZE)

Prerequisites: `DATABASE_URL` in your `.env` points to the Neon dev branch (not localhost).

```bash
cd c:/Developer/work/ISEYAA
npx ts-node --project load-tests/db-audit/tsconfig.json load-tests/db-audit/explain-analyze.ts
```

Look for `Index Scan` (not `Seq Scan`) on every query. The critical one:
```
Index Scan using transactions_walletId_idx on transactions
```
If any query still shows `Seq Scan`, the migration may not have run on Neon yet — run:
```bash
cd backend && npx prisma migrate deploy
```

---

### QA-04 — OWASP ZAP Passive Security Scan

Prerequisites: Docker Desktop running. Staging backend deployed and accessible.

```bash
mkdir zap-reports
docker run --rm \
  -v "${PWD}/zap-reports:/zap/reports" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py \
  -t https://iseyaa-staging.railway.app/api/docs-json \
  -f openapi \
  -r zap-reports/passive-report.html \
  -S
```

Open `zap-reports/passive-report.html` in a browser. Count CRITICAL (red) findings.
**Target: 0 CRITICAL findings.**
Note any HIGH (orange) findings — these go to Phase 7 remediation.

> Note: `NEXT_PUBLIC_` or `EXPO_PUBLIC_` vars are intentionally public. Sentry DSN is safe to expose. Flag anything else HIGH or CRITICAL.

---

### QA-01 — k6 HTTP Load Test

Prerequisites: k6 installed.
```bash
# Windows
winget install k6

# Smoke test first (500 VUs, 2 minutes)
k6 run \
  --vus 500 \
  --duration 120s \
  --env BASE_URL=https://iseyaa-staging.railway.app \
  --env TEST_PHONE=+2349000000001 \
  --env TEST_PASSWORD=testpass123 \
  load-tests/k6/main.js
```

**Target: P95 < 500 ms, error rate < 0.1%.**

Full 10,000-VU run (only if smoke passes):
```bash
k6 run \
  --env BASE_URL=https://iseyaa-staging.railway.app \
  --env TEST_PHONE=+2349000000001 \
  --env TEST_PASSWORD=testpass123 \
  load-tests/k6/main.js
```
> The full run needs 8 GB+ RAM on the machine running k6, and Neon PgBouncer connection pooling enabled (Neon dashboard → Connection pooling → Enable).

---

### QA-02 — Artillery Socket.IO GPS Stress Test

Prerequisites: `npm install -g artillery@2.0.31`. A test driver account with an active trip on staging.

```bash
TEST_DRIVER_PHONE=+2349000000002 \
TEST_DRIVER_PASSWORD=testpass123 \
TEST_TRIP_ID=<active-trip-id> \
BASE_URL=https://iseyaa-staging.railway.app \
artillery run load-tests/artillery/socketio-gps.yml
```

Watch Railway logs for `Client connected:` messages.
**Target: 500 concurrent connections for 10 minutes, zero disconnects.**

> If connections open but no NestJS log: try `npm install -g artillery-engine-socketio-v3` and change `engines: socketio: {}` to `engines: socketio-v3: {}` in the YAML.

---

### QA-06 — WebP Image Pipeline

Upload a test image to any event or property:
```bash
curl -X POST \
  https://iseyaa-staging.railway.app/api/v1/events/<event-id>/images \
  -H "Authorization: Bearer <your-token>" \
  -F "file=@test.jpg"
```

Open the returned URL in Chrome → DevTools → Network tab → click the image resource.
**Confirm `Content-Type: image/webp`.**

LCP check: Chrome DevTools → Performance tab → throttle to Fast 3G → record page load.
**Target: LCP < 2.5 s.**

---

### QA-07 — Mobile Cold Start + Sentry

**Bundle size analysis:**
```bash
cd c:/Developer/work/ISEYAA/mobile && npm run atlas
```
Then:
```bash
npx expo-atlas .expo/atlas.jsonl   # fetched on-demand via npx; not a mobile/package.json dependency
```
Note the total initial bundle size. **Target: < 2 MB for 3G cold start < 3 s.**

**Cold start (Android emulator):**
```bash
adb shell am force-stop ng.gov.ogun.iseyaa
adb shell am start -n ng.gov.ogun.iseyaa/.MainActivity
```
Time from force-stop to first screen render. **Target: < 3 seconds on simulated 3G.**

**Sentry initialization:**
Launch the app, navigate through main flows, then check: sentry.io → iseyaa-mobile project → Performance → Sessions. Confirm at least 1 session reported.
**Gate: SDK reporting at least 1 session = PASS.** (Full 99.5% crash-free rate is measured in Phase 7 after 48 hours of production traffic.)

> Before the first EAS production build, add `EXPO_PUBLIC_SENTRY_DSN` to your Railway/Infisical secrets (create the Sentry project at sentry.io, org: `iseyaa`, project: `iseyaa-mobile`, copy the DSN).

---

### Phase 6 Resume Signal

Reply with a PASS/FAIL for each criterion:

```
QA-01: PASS  (or: FAIL — P95 was 620ms)
QA-02: PASS  (or: FAIL — connections dropped at 400)
QA-03: PASS  (automated — already confirmed)
QA-04: PASS (0 critical)  (or: FAIL — 2 critical: X, Y)
QA-05: PASS (index scan confirmed)  (or: FAIL — Seq Scan on transactions)
QA-06: PASS  (or: FAIL — still returning image/jpeg)
QA-07: PASS (cold start 2.3s, Sentry session received)  (or: FAIL — cold start 4.1s)
```

If all pass, reply: **`ALL PASS — Phase 6 complete`**

Any failures will generate gap-closure plans before Phase 7 begins.

---

## Summary of All Deferred Human Actions

| Phase | Plan | Action | Blocks |
|---|---|---|---|
| Phase 2 | 02-06 | Railway deployment + infrastructure health check (10 steps) | Phase 3 automated work |
| Phase 3 | 03-08 | Transport E2E: rider requests ride, driver accepts + GPS, trip completion + wallet (8 steps, 2 devices) | Phase 4 automated work |
| Phase 4 | 04-08 | Delivery E2E: sender → rider matching, GPS, OTP, photo, wallet credit (12 steps, 2 devices) | Phase 5 automated work |
| Phase 5 | 05-07 | AI chat streaming + KYC 3-tier + PII hygiene + wallet daily limit (12 steps) | Phase 6 automated work |
| Phase 6 | 06-06 | QA criteria: k6 load, Artillery GPS, ZAP scan, EXPLAIN ANALYZE, WebP, mobile cold start + Sentry (7 criteria) | Phase 7 (Launch) |

**All 5 checkpoints can be done back-to-back in a single session if the backend is running and you have two test devices available.** Estimated time: 2–3 hours if infrastructure is already provisioned.

---

## Quick Commands Reference

```bash
# Start everything locally
npm run dev:backend          # backend on :3001
cd mobile && npx expo start             # mobile QR code

# Run all tests
cd backend && npx jest --passWithNoTests --no-coverage 2>&1 | tail -5

# Open Prisma Studio (DB browser)
cd backend && npx prisma studio

# Check which tests are failing
cd backend && npx jest --verbose --no-coverage 2>&1 | grep -E "FAIL|PASS|✓|✗"

# Verify Neon migration status
cd backend && npx prisma migrate status

# Apply pending migrations to production Neon
cd backend && npx prisma migrate deploy
```

---

## Phase 7: Production Deployment (LAUNCH-01 → LAUNCH-03)

### Railway Environment Variable Checklist

Before go-live, set the following in your Railway service's Variables tab:

| Variable | Action | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Switch to Neon **production** branch URL | Neon console → Branches → Create production branch → copy connection string |
| `REDIS_URL` | Switch to Upstash **production** env | Upstash console → Create environment → copy TLS URL |
| `PAYSTACK_SECRET_KEY` | Change from `sk_test_*` to `sk_live_*` | Paystack dashboard → Settings → API Keys |
| `PAYSTACK_WEBHOOK_SECRET` | Update to live webhook secret | Must match what Paystack sends on your live webhook URL |
| `NODE_ENV` | Set to `production` | Disables Swagger, tightens CORS |
| `ALLOWED_ORIGINS` | Set to `https://iseyaa.ng,https://www.iseyaa.ng` | Comma-separated; no trailing slash |
| `JWT_SECRET` | Rotate to new 64-char hex | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ENCRYPTION_KEY` | **Do NOT rotate** unless migrating ciphertext first | Rotating breaks existing encrypted BVN/NIN data |
| `ANTHROPIC_API_KEY` | Keep same | Already production key |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Keep same | Cloudflare R2 credentials, not regional |

### Verify Production Config

After updating Railway vars:

```bash
# Health check must return 200
curl -s https://iseyaa-api.up.railway.app/api/v1/health

# Swagger must return 404 (not the API docs page)
curl -s -o /dev/null -w "%{http_code}" https://iseyaa-api.up.railway.app/api/docs
# Expected: 404

# CORS must reject unknown origins
curl -s -H "Origin: https://evil.com" -I https://iseyaa-api.up.railway.app/api/v1/health 2>&1 | grep -i "access-control"
# Expected: no access-control-allow-origin header
```

### Cloudflare WAF Setup (LAUNCH-02)

1. Add site `iseyaa.ng` to Cloudflare (free plan is sufficient)
2. Update your domain's nameservers to Cloudflare's (provided in Cloudflare dashboard)
3. Enable: Security → WAF → Managed Rules → "Cloudflare Managed Ruleset" (ON)
4. Enable: Security → DDoS → HTTP DDoS attack protection (ON by default on all plans)
5. SSL/TLS: set to "Full (strict)" mode

### Resume Signal
Reply: **`07-approved`** if all production variables are set and health/Swagger/CORS verification passes.

---

### LAUNCH-04 + LAUNCH-05: App Store Submission Checklist

**Step 0 — DO THIS FIRST: Development build for immediate device testing**

This is the fastest path to install the app on your device without App Store review:

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo (use toyeenfolayan@gmail.com)
eas login

# Initialize EAS project (get your project ID)
cd mobile
eas init
# This prints your project ID — replace PLACEHOLDER_EAS_PROJECT_ID in app.json with it

# Build development APK for Android (fastest — no Apple account needed)
npm run build:dev:android
# Once built, EAS shows a QR code → scan to download and install APK on your Android device

# For iOS development build (requires Apple Developer account)
npm run build:dev:ios
# Once built, install via TestFlight
```

**Prerequisites for App Store / Play Store submission (one-time setup):**

- [ ] Apple Developer account at developer.apple.com ($99/year)
  - Create App in App Store Connect: name "ISEYAA", bundle ID `ng.gov.ogun.iseyaa`
  - Note your Apple Team ID (in Membership section) — update `eas.json` submit.production.ios.appleTeamId
  - Note your App Store Connect App ID — update `eas.json` submit.production.ios.ascAppId
- [ ] Google Play Console account ($25 one-time)
  - Create app with package name `ng.gov.ogun.iseyaa`
  - Create service account: Play Console → Setup → API access → Create service account → Grant "Release manager" role
  - Download JSON key as `mobile/google-service-account.json` (already gitignored)

**Step 1 — Production build:**
```bash
cd mobile
npm run build:ios      # eas build --profile production --platform ios
npm run build:android  # eas build --profile production --platform android
```
Monitor progress at: https://expo.dev/accounts/[your-username]/projects/iseyaa/builds

**Step 2 — Verify sizes before submission:**
- iOS IPA: download from EAS build page → check size < 40MB (LAUNCH-04)
- Android AAB: check size < 30MB (LAUNCH-04)
- If over limit: run `npm run atlas` to identify large modules

**Step 3 — Submit iOS to TestFlight:**
```bash
npm run submit:ios
```
In App Store Connect: TestFlight → Add External Testers → invite 50+ testers (LAUNCH-05)

**Step 4 — Submit Android to Play Store internal track:**
```bash
npm run submit:android
```

**Incrementing versions for future releases:**
- iOS: increment `expo.ios.buildNumber` (e.g., "2", "3")
- Android: increment `expo.android.versionCode` (e.g., 2, 3)
- Both: update `expo.version` for user-visible version (e.g., "1.0.1")

---

### LAUNCH-07: 5-Minute Rollback Procedure

Railway automatically keeps the last 10 deployment images. To rollback:

1. Open Railway dashboard → your service → "Deployments" tab
2. Find the previous successful deployment (green checkmark)
3. Click the three-dot menu (⋮) → "Redeploy"
4. Railway spins up the previous image (typically 2-3 minutes)
5. Verify: `curl https://iseyaa-api.up.railway.app/api/v1/health`

**To test the rollback procedure before soft launch (required for LAUNCH-07):**
1. Make a small intentional break (e.g., add `process.exit(1)` to health endpoint, push)
2. Confirm the deployment fails or health check returns 500
3. Follow steps 1-5 above
4. Time the full cycle — must complete in under 5 minutes
5. Revert: remove the `process.exit(1)` line, push again

**Database caveat:** Railway rollback only reverts the container image — NOT the database schema.
- Before any deployment that includes a migration: create a Neon branch snapshot
- To revert a migration: `npx prisma migrate resolve --rolled-back <migration-name>` on the Neon branch

---

### LAUNCH-06: Grafana + Sentry Monitoring Setup

See `monitoring/grafana-dashboard.json` and `monitoring/sentry-alerts.md` for complete setup.

**Quick Grafana setup:**
1. Grafana Cloud → Dashboards → New → Import → Upload JSON file
2. Select `monitoring/grafana-dashboard.json`
3. Choose your Prometheus data source
4. Dashboard is live — shows RPS, P95 latency, error rate, WebSocket connections, wallet transactions

**Verify monitoring works:**
- Grafana: make an API request, confirm RPS panel updates within 30 seconds
- Sentry: use "Send Test Notification" on each alert rule (see `monitoring/sentry-alerts.md`)

---

## Phase 15 — Meta WhatsApp Business Cloud API Setup + Template Submission

Phase 15 replaces the old Termii-routed WhatsApp OTP path with a direct integration against Meta's WhatsApp Business Cloud API (D-01/D-02). None of this is blocking — until it's complete, every WhatsApp-channel OTP send fails and automatically falls back to SMS (D-04/D-08). This is expected behavior, not a bug.

**Step 1 — Account setup:**

1. Create or confirm a Meta Business Account at business.facebook.com.
2. Create or confirm a WhatsApp Business Account (WABA) linked to that Business Account.
3. In Meta Business Manager → WhatsApp → API Setup, generate a permanent System User access token (not a temporary 24-hour token) with the `whatsapp_business_messaging` permission.
4. Note the Phone Number ID shown on the same API Setup page.
5. Set `META_WHATSAPP_ACCESS_TOKEN` and `META_WHATSAPP_PHONE_NUMBER_ID` in your `.env` (or Infisical/Railway) from steps 3–4.

**Step 2 — Submit the Authentication template:**

Submit the following template verbatim in Meta Business Manager → WhatsApp → Message Templates → Create Template:

| Field | Value |
| --- | --- |
| Name | `iseyaa_otp_verification` |
| Category | `AUTHENTICATION` |
| Language | `en_US` |
| Body | `{{1}} is your Iṣẹ́yáá verification code. For your security, do not share this code.` |
| Footer | `This code expires in 5 minutes.` |
| Buttons | One-tap copy-code button enabled (`otp_type: copy_code`) |

Note: Meta's Authentication template composer presents "Add security recommendation" and "Add expiration warning" as toggle switches rather than freeform text fields. If Meta's UI supplies its own preset phrasing for these toggles, enable both toggles rather than retyping the body/footer text above verbatim — the toggles satisfy the same requirement.

Once approved, set `META_WHATSAPP_TEMPLATE_NAME=iseyaa_otp_verification` and `META_WHATSAPP_TEMPLATE_LANG=en_US` in your `.env`.

**Step 3 — Confirm fallback behavior (expected, not a bug):**

Until the template is APPROVED (Meta review typically takes minutes to a few hours) and all three `META_WHATSAPP_*` secrets are set, every WhatsApp-channel OTP send will fail and automatically fall back to SMS delivery. This is the intended D-04/D-08 fallback chain, not an error condition — no code changes are needed to "fix" this while the template is pending.

### Resume Signal

Reply: **`15-meta-approved`** once the `iseyaa_otp_verification` template shows status APPROVED in Meta Business Manager and all three `META_WHATSAPP_*` secrets are live.

This signal is informational only — this phase's automated plans do not block on it (D-03).

---

## Phase 16 -- Connection Pooling: Neon Console + Grafana Alert Confirmation — COMPLETE

Phase 16 documents Neon's built-in `-pooler` connection string pattern (POOL-01) — an explicit `connection_limit`/`pool_timeout` on both the monolith's and notifications-service's `DATABASE_URL`, replacing Prisma's silent default pool size of 10, with zero new infrastructure (D-01: Neon's managed pooler, not a self-hosted PgBouncer container).

This section covered three manual verification steps, all completed by the operator per Plan 16-04's checkpoint tasks. Full detail (Neon plan/CU reading, k6 combined-topology run result, Grafana alert threshold, production Railway change) was recorded in the phase 16 verification notes; the `.planning/phases/16-connection-pooling-infrastructure/` directory has since been removed and is no longer present in this repository.

### Completed record

1. **Neon Console plan/CU confirmation** (`16-neon-confirmed`) — the operator confirmed the live Neon project's actual `max_connections` ceiling is at or above the conservative 104-connection baseline assumed in `.env.example`'s comments (16-RESEARCH.md Assumptions Log A1/A2). No changes needed to `connection_limit=20`/`5` or the 83-connection Grafana alert threshold — confirmed as-is.
2. **Combined-topology k6 run + Grafana gauge/alert confirmation** (`16-load-confirmed`) — the operator ran the combined-topology k6 scenario (monolith HTTP + notifications-service gRPC, 50 VUs / 60s), confirmed `pg_stat_activity` stayed under the confirmed ceiling, confirmed the Grafana Cloud `postgres_open_connections` gauge showed live moving values during the run, and saved a Grafana alert rule firing at 83 connections (80% of 104).
3. **Production Railway `DATABASE_URL` change** (`16-approved`) — the operator updated the monolith service's `DATABASE_URL` on Railway to the pooled `-pooler` format with `connection_limit=20&pool_timeout=10` (no `pgbouncer=true`), left `DIRECT_URL` unchanged, saved the variable, Railway redeployed, and confirmed the change took effect.

### Resume Signal

Received: **`16-approved`** — all three verification steps confirmed by the operator. Phase 16 (POOL-01, POOL-02) is complete. See `16-VERIFICATION.md` for the full recorded detail.
