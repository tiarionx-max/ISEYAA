/**
 * 09-12 — E2E setup helper for Tour Packages & Tour Guides regression specs.
 *
 * Bootstraps a full NestJS test application (all real modules), resets
 * tour-related tables between test suites, and seeds the five baseline users
 * whose roles drive the E2E scenarios:
 *
 *   tourist  — the booking buyer
 *   guide    — APPROVED TourGuide (KYC tier 2)
 *   host     — property owner linked to a HOST slot in a package
 *   admin    — LGA_ADMIN who approves guides and packages
 *   govt     — special user whose wallet is the ATTRACTION government wallet
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export async function bootstrapE2EApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  jwtService: JwtService;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  // rawBody: true is required — mirrors src/main.ts's NestFactory.create() option.
  // Without it, req.rawBody is undefined and WebhooksService.handlePaystack()'s HMAC
  // check (which validates against the raw request bytes, not a JSON.stringify()
  // reconstruction) always 400s with "Missing raw body" (C-11 guard).
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.setGlobalPrefix('api/v1');
  await app.init();
  await app.listen(0);

  const prisma = moduleRef.get(PrismaService);
  const jwtService = moduleRef.get(JwtService);

  return { app, prisma, jwtService };
}

// ── Table reset ───────────────────────────────────────────────────────────────

/**
 * Truncates all tour-related tables and removes tour transaction ledger rows.
 * Disables FK triggers temporarily so child tables can be cleared first.
 */
export async function resetTourTables(prisma: PrismaService): Promise<void> {
  await prisma.$executeRaw`SET session_replication_role = replica`;
  await prisma.$executeRaw`TRUNCATE TABLE
    admin_review_flags,
    reviews,
    itineraries,
    tour_bookings,
    tour_packages,
    tour_guides
    RESTART IDENTITY CASCADE`;
  // Remove tour-module ledger rows without touching other wallet transactions.
  await prisma.$executeRaw`DELETE FROM transactions WHERE metadata->>'module' = 'tour'`;
  await prisma.$executeRaw`SET session_replication_role = DEFAULT`;
}

// ── Baseline user seed ────────────────────────────────────────────────────────

export interface BaselineUsers {
  touristId: string;
  guideId: string;
  hostId: string;
  adminId: string;
  govtId: string;
}

/**
 * Upserts five deterministic test users and their wallets.
 * Uses fixed UUIDs so repeated calls are safe (idempotent).
 */
export async function seedBaselineUsers(
  prisma: PrismaService,
): Promise<BaselineUsers> {
  // Fixed UUIDs — test-only, never collide with prod data.
  const TOURIST_ID  = 'e2e00001-0000-0000-0000-000000000001';
  const GUIDE_UID   = 'e2e00001-0000-0000-0000-000000000002';
  const HOST_ID     = 'e2e00001-0000-0000-0000-000000000003';
  const ADMIN_ID    = 'e2e00001-0000-0000-0000-000000000004';
  const GOVT_ID     = 'e2e00001-0000-0000-0000-000000000005';

  const users = [
    {
      id: TOURIST_ID,
      firstName: 'E2E',
      lastName: 'Tourist',
      phone: '+234800E2ETOUR1',
      email: 'e2e.tourist@test.iseyaa',
      role: 'CITIZEN',
    },
    {
      id: GUIDE_UID,
      firstName: 'E2E',
      lastName: 'Guide',
      phone: '+234800E2EGUIDE',
      email: 'e2e.guide@test.iseyaa',
      role: 'CITIZEN',
    },
    {
      id: HOST_ID,
      firstName: 'E2E',
      lastName: 'Host',
      phone: '+234800E2EHOST1',
      email: 'e2e.host@test.iseyaa',
      role: 'CITIZEN',
    },
    {
      id: ADMIN_ID,
      firstName: 'E2E',
      lastName: 'Admin',
      phone: '+234800E2EADMIN',
      email: 'e2e.admin@test.iseyaa',
      role: 'LGA_ADMIN',
    },
    {
      id: GOVT_ID,
      firstName: 'E2E',
      lastName: 'Govt',
      phone: '+234800E2EGOVT1',
      email: 'e2e.govt@test.iseyaa',
      role: 'CITIZEN',
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        email: u.email,
        role: u.role as any,
        ndpaConsent: true,
        passwordHash: '$2b$12$placeholder.hash.for.e2e.tests.only',
      },
      update: {},
    });
    await prisma.wallet.upsert({
      where: { userId: u.id },
      create: { userId: u.id, balance: 500_000 }, // ₦500,000 seeded balance
      update: {},
    });
  }

  return {
    touristId: TOURIST_ID,
    guideId: GUIDE_UID,
    hostId: HOST_ID,
    adminId: ADMIN_ID,
    govtId: GOVT_ID,
  };
}

// ── Reference data seed (LGA + Attraction) ──────────────────────────────────────

/**
 * Upserts the minimal reference data the tour-booking flow needs: one LGA and
 * one Attraction within it. CreateTourPackageDto requires a real lgaId and
 * >=1 attractionId, and the suite reads the first available rows. The full
 * 20-LGA/attraction reference set is seeded by the demo seed script, which CI
 * does not run — so seed a deterministic minimum here. Idempotent via fixed
 * unique slugs, and additive: in environments that already have the real
 * reference data, findFirst() still returns a real row.
 */
export async function seedTourReferenceData(
  prisma: PrismaService,
): Promise<{ lgaId: string; attractionId: string }> {
  const lga = await prisma.lGA.upsert({
    where: { slug: 'e2e-abeokuta-south' },
    create: {
      name: 'E2E Abeokuta South',
      slug: 'e2e-abeokuta-south',
      stateCode: 'OG',
    },
    update: {},
    select: { id: true },
  });

  const attraction = await prisma.attraction.upsert({
    where: { slug: 'e2e-olumo-rock' },
    create: {
      lgaId: lga.id,
      name: 'E2E Olumo Rock',
      slug: 'e2e-olumo-rock',
      category: 'HISTORICAL' as any,
    },
    update: {},
    select: { id: true },
  });

  return { lgaId: lga.id, attractionId: attraction.id };
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

/**
 * Mints a signed JWT access token for a test user — mirrors AuthService's real
 * token payload shape (`{ sub, role, jti }`, see `auth.service.ts` `generateTokens()`)
 * so it validates correctly against `JwtStrategy.validate()`, which reads `payload.sub`
 * (not `payload.userId`) into `req.user.userId`.
 */
export function mintJwt(
  jwtService: JwtService,
  userId: string,
  role: string,
): string {
  return jwtService.sign({ sub: userId, role, jti: randomUUID() });
}

// ── Webhook helpers ───────────────────────────────────────────────────────────

/** Returns the HMAC-SHA512 hex digest Paystack appends to webhook POST bodies. */
export function signPaystackWebhook(body: object, secret: string): string {
  return createHmac('sha512', secret)
    .update(JSON.stringify(body))
    .digest('hex');
}
