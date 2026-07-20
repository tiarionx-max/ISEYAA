/**
 * 09-12 — E2E Happy Path: Tour Booking (11 steps)
 *
 * Walks the complete booking lifecycle end-to-end using a real NestJS application
 * instance and real Prisma against a test PostgreSQL database.
 *
 * Skip condition:
 *   - DATABASE_URL is not set, OR
 *   - DATABASE_URL points to localhost:54321 (CI placeholder / no DB available)
 *
 * The 11 steps mirror the sequence proven by the TOUR-10 plan:
 *   Step 1  — Guide registers as TOUR_GUIDE role (become-guide)
 *   Step 2  — Guide upserts profile (bio, languages, yearsExperience)
 *   Step 3  — Admin approves the guide (PENDING → APPROVED)
 *   Step 4  — Guide creates a DRAFT tour package
 *   Step 5  — Guide submits the package for review (DRAFT → PENDING)
 *   Step 6  — Admin approves the package (PENDING → APPROVED)
 *   Step 7  — Tourist creates a solo tour booking (→ PENDING + Paystack ref)
 *   Step 8  — Paystack webhook fires `charge.success` for the booking
 *   Step 9  — Booking transitions to CONFIRMED (settlement ran)
 *   Step 10 — Wallet ledger contains vendor + platform CREDIT rows summing to charge
 *   Step 11 — Wallet invariant (TOUR-10): sum of credits == chargeAmountNgn
 *
 * NOTE: E2E tests with a real DB should be run by the operator in the deployed
 * Railway environment with DATABASE_URL pointing to a dedicated test schema.
 */

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as http from 'node:http';
import {
  bootstrapE2EApp,
  resetTourTables,
  seedBaselineUsers,
  mintJwt,
  signPaystackWebhook,
  BaselineUsers,
} from './setup-e2e-tours';
import { PrismaService } from '../src/prisma/prisma.service';

// ── Skip gate ─────────────────────────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL ?? '';
const skipE2E =
  !dbUrl ||
  dbUrl.includes('localhost:54321') ||
  dbUrl.includes('placeholder') ||
  dbUrl === '';

const describeE2E = skipE2E ? describe.skip : describe;

// ── Minimal HTTP client ───────────────────────────────────────────────────────

/**
 * Lightweight HTTP client that talks to the NestJS test server via Node's
 * built-in `http` module. Avoids a `supertest` dependency.
 */
function makeHttpClient(server: http.Server) {
  function baseUrl(): string {
    const addr = server.address();
    if (addr && typeof addr === 'object') {
      return `http://127.0.0.1:${addr.port}`;
    }
    return 'http://127.0.0.1:3001';
  }

  async function doRequest(
    method: string,
    path: string,
    body?: object,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; body: any }> {
    const rawBody = body ? JSON.stringify(body) : undefined;
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl());
      const req = http.request(
        {
          hostname: url.hostname,
          port: Number(url.port),
          path: url.pathname + url.search,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(rawBody
              ? { 'Content-Length': Buffer.byteLength(rawBody).toString() }
              : {}),
            ...headers,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString()));
          res.on('end', () => {
            let parsed: any = data;
            try { parsed = JSON.parse(data); } catch (_) { /* leave as string */ }
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
        },
      );
      req.on('error', reject);
      if (rawBody) req.write(rawBody);
      req.end();
    });
  }

  return {
    get:   (path: string, hdrs?: Record<string, string>) =>
      doRequest('GET', path, undefined, hdrs),
    post:  (path: string, body?: object, hdrs?: Record<string, string>) =>
      doRequest('POST', path, body, hdrs),
    patch: (path: string, body?: object, hdrs?: Record<string, string>) =>
      doRequest('PATCH', path, body, hdrs),
  };
}

/** Authorization bearer header for a JWT token. */
function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ── E2E Suite ─────────────────────────────────────────────────────────────────

describeE2E('Tour Booking E2E Happy Path (11 steps)', () => {
  let app:          INestApplication;
  let prisma:       PrismaService;
  let jwtService:   JwtService;
  let users:        BaselineUsers;
  let server:       http.Server;
  let http:         ReturnType<typeof makeHttpClient>;

  // Tokens minted once after bootstrap
  let guideToken:   string;
  let adminToken:   string;
  let touristToken: string;

  // State accumulated across steps
  let guideRecordId: string;
  let packageId:     string;
  let bookingId:     string;
  let lgaId:         string;
  let attractionId:  string;
  let paystackRef:   string;

  // Paystack webhook secret from env (or test fallback)
  const PAYSTACK_SECRET =
    process.env.PAYSTACK_WEBHOOK_SECRET ?? 'test-webhook-secret';

  // ── Lifecycle ────────────────────────────────────────────────────────────

  beforeAll(async () => {
    ({ app, prisma, jwtService } = await bootstrapE2EApp());
    server = app.getHttpServer() as http.Server;
    http = makeHttpClient(server);

    await resetTourTables(prisma);
    users = await seedBaselineUsers(prisma);

    guideToken   = mintJwt(jwtService, users.guideId,   'TOUR_GUIDE');
    adminToken   = mintJwt(jwtService, users.adminId,   'LGA_ADMIN');
    touristToken = mintJwt(jwtService, users.touristId, 'CITIZEN');

    // CreateTourPackageDto requires a real lgaId + >=1 attractionId — pull the
    // first available rows from the already-seeded reference data (20 Ogun
    // State LGAs + attractions) rather than hardcoding IDs that don't exist
    // in every environment.
    const lga = await prisma.lGA.findFirst({ select: { id: true } });
    const attraction = await prisma.attraction.findFirst({ select: { id: true } });
    if (!lga || !attraction) {
      throw new Error(
        'E2E fixture data missing: expected at least one LGA and one Attraction row to be seeded before running this suite.',
      );
    }
    lgaId = lga.id;
    attractionId = attraction.id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  // ── Step 1: Guide calls become-guide ─────────────────────────────────────

  it('Step 1 — become-guide: creates TourGuide row in PENDING', async () => {
    const res = await http.post(
      '/api/v1/users/me/become-guide',
      {},
      auth(guideToken),
    );
    // Controller sets @HttpCode(HttpStatus.OK); becomeGuide() is an idempotent
    // upsert so it always returns 200, never 201/409 (fixed from a stale test
    // assumption during the 260713-daq app.listen bootstrap fix).
    expect(res.status).toBe(200);

    // Fetch own guide profile to capture the guide record id
    const meRes = await http.get('/api/v1/tour-guides/me', auth(guideToken));
    expect(meRes.status).toBe(200);
    guideRecordId = meRes.body.id;
    expect(guideRecordId).toBeTruthy();
  });

  // ── Step 2: Guide upserts profile ────────────────────────────────────────

  it('Step 2 — upsert profile: bio + languages + yearsExperience persisted', async () => {
    const res = await http.post(
      '/api/v1/tour-guides',
      {
        bio: 'E2E guide — specialist in Abeokuta heritage walks',
        languagesSpoken: ['English', 'Yoruba'],
        yearsExperience: 3,
      },
      auth(guideToken),
    );
    expect(res.status).toBe(201);
    expect(res.body.bio).toContain('Abeokuta');
  });

  // ── Step 3: Admin approves the guide ─────────────────────────────────────

  it('Step 3 — admin approves guide: PENDING → APPROVED', async () => {
    const res = await http.post(
      `/api/v1/admin/tour-guides/${guideRecordId}/approve`,
      { decision: 'APPROVED' },
      auth(adminToken),
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
  });

  // ── Step 4: Guide creates a DRAFT package ────────────────────────────────

  it('Step 4 — guide creates DRAFT tour package', async () => {
    const res = await http.post(
      '/api/v1/tour-packages',
      {
        name: 'E2E Heritage Walk',
        description: 'Automated E2E test package — Olumo Rock tour',
        lgaId,
        tourGuideId: guideRecordId,
        attractionIds: [attractionId],
        category: 'CULTURAL',
        price: 5000,
        maxGroupSize: 20,
        durationHours: 4,
        itineraryTemplate: [
          {
            hour: 0,
            title: 'Meeting point',
            description: 'Gather at Olumo Rock base',
            location: 'Olumo Rock',
          },
          {
            hour: 2,
            title: 'Summit climb',
            description: 'Guided climb to the top',
            location: 'Olumo Rock summit',
          },
          {
            hour: 4,
            title: 'Museum visit',
            description: 'Abeokuta Museum tour',
            location: 'Abeokuta Museum',
          },
        ],
        settlementSplit: [
          { vendorType: 'GUIDE', vendorId: guideRecordId, percentage: 80 },
        ],
      },
      auth(guideToken),
    );
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    packageId = res.body.id;
    expect(packageId).toBeTruthy();
  });

  // ── Step 5: Guide submits for review ─────────────────────────────────────

  it('Step 5 — guide submits package: DRAFT → PENDING', async () => {
    const res = await http.post(
      `/api/v1/tour-packages/${packageId}/submit`,
      {},
      auth(guideToken),
    );
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
  });

  // ── Step 6: Admin approves the package ───────────────────────────────────

  it('Step 6 — admin approves package: PENDING → APPROVED', async () => {
    const res = await http.post(
      `/api/v1/admin/tour-packages/${packageId}/decide`,
      { decision: 'APPROVED' },
      auth(adminToken),
    );
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED');
  });

  // ── Step 7: Tourist creates a solo booking ────────────────────────────────

  it('Step 7 — tourist creates solo booking: status=PENDING + Paystack ref', async () => {
    // Pick a date 14 days from now (avoids guide availability edge cases)
    const tourDate = new Date();
    tourDate.setUTCDate(tourDate.getUTCDate() + 14);
    const tourDateIso = tourDate.toISOString().slice(0, 10);

    const res = await http.post(
      '/api/v1/tour-bookings',
      {
        tourPackageId: packageId,
        tourDate: tourDateIso,
        passengerCount: 1,
        email: 'e2e.tourist@example.com',
      },
      auth(touristToken),
    );
    expect(res.status).toBe(201);
    expect(res.body.booking).toBeDefined();
    expect(res.body.booking.status).toBe('PENDING');

    bookingId   = res.body.booking.id;
    // Controller returns `{ booking, payment }` — `payment.reference` (from Paystack
    // init) is the authoritative reference; `booking.reference` (the minted ISY-TOUR-
    // value, set at creation) is the fallback. `booking.paymentReference` is NOT
    // populated on this response object — it's written by a separate `update()` call
    // AFTER the `booking` object referenced here was already constructed from the
    // initial `create()` — so it always reads back null/undefined at this point.
    paystackRef = res.body.payment?.reference ?? res.body.booking.reference ?? '';
    expect(bookingId).toBeTruthy();
    expect(paystackRef).toMatch(/^ISY-TOUR-/);
  });

  // ── Step 8: Paystack webhook fires charge.success ─────────────────────────

  it('Step 8 — Paystack webhook: charge.success dispatched', async () => {
    const webhookBody = {
      event: 'charge.success',
      data: {
        reference: paystackRef,
        amount: 500_000, // ₦5,000 in kobo
        status: 'success',
        metadata: {
          type: 'tour_booking',
          bookingId,
          module: 'tour',
        },
      },
    };

    const sig = signPaystackWebhook(webhookBody, PAYSTACK_SECRET);

    const res = await http.post('/api/v1/webhooks/paystack', webhookBody, {
      'x-paystack-signature': sig,
    });

    // Webhooks always return 200 regardless of processing outcome
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    // WebhooksService.handlePaystack() fires eventEmitter.emit('payment.tour_booking', ...)
    // WITHOUT awaiting it (fire-and-forget by design — webhook handlers must not block
    // on downstream settlement). TourSettlementService.handleTourBookingPayment() then
    // runs several awaited Prisma round-trips before the booking flips to CONFIRMED, so
    // the HTTP response here can (and does) return before that settlement completes.
    // Poll briefly for the async settlement to land before the next steps assert on it.
    const deadline = Date.now() + 5_000;
    let settled = false;
    while (Date.now() < deadline) {
      const b = await prisma.tourBooking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      if (b && b.status !== 'PENDING') {
        settled = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(settled).toBe(true);
  });

  // ── Step 9: Booking transitions to CONFIRMED ──────────────────────────────

  it('Step 9 — booking is CONFIRMED after settlement', async () => {
    const booking = await prisma.tourBooking.findUnique({
      where: { id: bookingId },
      select: { status: true, paymentReference: true },
    });
    expect(booking).toBeDefined();
    expect(booking!.status).toBe('CONFIRMED');
    expect(booking!.paymentReference).toBe(paystackRef);
  });

  // ── Step 10: Wallet ledger has CREDIT rows ────────────────────────────────

  it('Step 10 — wallet ledger contains vendor + platform CREDIT rows', async () => {
    const txns = await prisma.transaction.findMany({
      where: { reference: { startsWith: `${paystackRef}-` } },
      select: { reference: true, type: true, amount: true, metadata: true },
    });

    expect(txns.length).toBeGreaterThanOrEqual(2); // at least 1 vendor + PLAT

    for (const t of txns) {
      expect(t.type).toBe('CREDIT');
    }

    const vendorRows = txns.filter((t) => t.reference.includes('-V-'));
    const platRow    = txns.find((t) => t.reference.endsWith('-PLAT'));

    expect(vendorRows.length).toBeGreaterThanOrEqual(1);
    expect(platRow).toBeDefined();

    // Every row carries the module metadata tag (audit requirement). The value is
    // 'tour_booking' — the literal string TourSettlementService passes as
    // `SettlementInput.module` (tour-settlement.service.ts) — not 'tour'.
    for (const t of txns) {
      expect((t.metadata as any)?.module).toBe('tour_booking');
    }
  });

  // ── Step 11: TOUR-10 wallet invariant ────────────────────────────────────

  it('Step 11 — TOUR-10 invariant: sum of all CREDIT rows == chargeAmount (₦5,000)', async () => {
    const txns = await prisma.transaction.findMany({
      where: {
        reference: { startsWith: `${paystackRef}-` },
        type: 'CREDIT',
      },
      select: { amount: true },
    });

    const totalCredited = txns.reduce(
      (sum, t) => sum + Number(t.amount),
      0,
    );

    // Webhook sent 500,000 kobo = ₦5,000 NGN
    const expectedNgn = 5_000;

    // Allow ₦0.02 rounding drift (matches service-layer guard)
    expect(Math.abs(totalCredited - expectedNgn)).toBeLessThanOrEqual(0.02);
  });
});
