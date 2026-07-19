import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TourNotificationsService } from '../tour-notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsClientService } from '../../notifications-client/notifications-client.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { ItineraryPdfService } from '../../../common/services/itinerary-pdf.service';

/**
 * 09-07 — TourNotificationsService spec.
 *
 * Nine scenarios covering:
 *   • @OnEvent immediate PDF + email (happy + idempotent).
 *   • T-24h cron window boundaries + idempotency + flag set after send.
 *   • T-2h cron window boundaries (push only — no email).
 *   • T+1h post-tour rating cron — uses (tourDate + durationHours).
 *   • PlatformConfig override of the T-24h offset.
 *   • Push-failure path: flag remains unset (retry on next tick).
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const BOOKING_ID = 'BKG-TOUR-1';
const BUYER_USER_ID = 'USR-BUYER';
const ITINERARY_ID = 'ITN-1';
const PACKAGE_NAME = 'Heritage Walk';
const REFERENCE = 'ISY-TOUR-ABC123456789';
const PDF_URL = 'https://cdn.iseyaa.test/itineraries/BKG-TOUR-1.pdf';

interface MockPrisma {
  tourBooking: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  itinerary: { update: jest.Mock };
  platformConfig: { findUnique: jest.Mock };
}

let mockPrisma: MockPrisma;
let mockNotifications: { sendPush: jest.Mock };
let mockSendgrid: { sendEmail: jest.Mock };
let mockPdf: { generateAndUpload: jest.Mock; renderPdf: jest.Mock };
let mockConfig: { get: jest.Mock };

async function makeService(): Promise<TourNotificationsService> {
  mockPrisma = {
    tourBooking: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    itinerary: { update: jest.fn().mockResolvedValue({}) },
    platformConfig: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  mockNotifications = {
    sendPush: jest.fn().mockResolvedValue({ sent: true }),
  };
  mockSendgrid = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  mockPdf = {
    generateAndUpload: jest.fn().mockResolvedValue(PDF_URL),
    renderPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  };
  mockConfig = { get: jest.fn() };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      TourNotificationsService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: NotificationsClientService, useValue: mockNotifications },
      { provide: SendgridService, useValue: mockSendgrid },
      { provide: ItineraryPdfService, useValue: mockPdf },
      { provide: ConfigService, useValue: mockConfig },
    ],
  }).compile();

  return moduleRef.get(TourNotificationsService);
}

interface BookingShape {
  metadata?: any;
  itinerary?: any;
  itineraryId?: string | null;
  tourDate?: Date;
  passengerCount?: number;
  totalAmount?: number;
  email?: string | null;
}

function buildFullBooking(o: BookingShape = {}): any {
  return {
    id: BOOKING_ID,
    reference: REFERENCE,
    buyerUserId: BUYER_USER_ID,
    tourDate: o.tourDate ?? new Date(Date.now() + 24 * 3_600_000),
    passengerCount: o.passengerCount ?? 2,
    totalAmount: o.totalAmount ?? 10_000,
    metadata: o.metadata ?? {},
    itineraryId: o.itineraryId === undefined ? ITINERARY_ID : o.itineraryId,
    itinerary:
      o.itinerary === undefined
        ? { id: ITINERARY_ID, items: [{ hour: 0, title: 'Welcome', location: 'Gate' }] }
        : o.itinerary,
    buyer: {
      id: BUYER_USER_ID,
      email: o.email === undefined ? 'buyer@example.com' : o.email,
      firstName: 'Ada',
      lastName: 'Okeke',
    },
    tourPackage: {
      id: 'TPK-1',
      name: PACKAGE_NAME,
      coverImageUrl: null,
      durationHours: 4,
      tourGuide: { user: { firstName: 'Bola', lastName: 'Adeyemi' } },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('TourNotificationsService', () => {
  // 1. Happy-path @OnEvent — PDF generated, email sent, flag set.
  it('1. onBookingConfirmed: generates PDF, persists pdfUrl, emails buyer, sets pdfSent flag', async () => {
    const svc = await makeService();
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(buildFullBooking());

    await svc.onBookingConfirmed({ bookingId: BOOKING_ID, reference: REFERENCE });

    expect(mockPdf.generateAndUpload).toHaveBeenCalledTimes(1);
    expect(mockPrisma.itinerary.update).toHaveBeenCalledWith({
      where: { id: ITINERARY_ID },
      data: { pdfUrl: PDF_URL },
    });
    expect(mockSendgrid.sendEmail).toHaveBeenCalledTimes(1);
    const [, subject] = mockSendgrid.sendEmail.mock.calls[0];
    expect(subject).toContain(PACKAGE_NAME);

    const flagUpdate = mockPrisma.tourBooking.update.mock.calls.find(
      ([arg]) => arg.data.metadata?.pdfSent === true,
    );
    expect(flagUpdate).toBeDefined();
    expect(flagUpdate![0].data.metadata.pdfUrl).toBe(PDF_URL);
  });

  // 2. Idempotency — flag already set, no PDF/email.
  it('2. onBookingConfirmed: skips entirely when metadata.pdfSent === true', async () => {
    const svc = await makeService();
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildFullBooking({ metadata: { pdfSent: true } }),
    );

    await svc.onBookingConfirmed({ bookingId: BOOKING_ID, reference: REFERENCE });

    expect(mockPdf.generateAndUpload).not.toHaveBeenCalled();
    expect(mockSendgrid.sendEmail).not.toHaveBeenCalled();
    expect(mockPrisma.tourBooking.update).not.toHaveBeenCalled();
  });

  // 3. pushTMinus24h — booking ~24h away, no flag → push + email + flag set.
  it('3. pushTMinus24h: in-window booking triggers sendPush + sendEmail + flag set', async () => {
    const svc = await makeService();
    const booking = {
      id: BOOKING_ID,
      buyerUserId: BUYER_USER_ID,
      tourDate: new Date(Date.now() + 24 * 3_600_000),
      metadata: {},
    };
    mockPrisma.tourBooking.findMany.mockResolvedValueOnce([booking]);
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildFullBooking({
        tourDate: booking.tourDate,
        metadata: { pdfUrl: PDF_URL },
      }),
    );

    await svc.pushTMinus24h();

    expect(mockNotifications.sendPush).toHaveBeenCalledTimes(1);
    const [userId, title] = mockNotifications.sendPush.mock.calls[0];
    expect(userId).toBe(BUYER_USER_ID);
    expect(title).toBe('Your tour is tomorrow');
    expect(mockSendgrid.sendEmail).toHaveBeenCalledTimes(1);

    const flagUpdate = mockPrisma.tourBooking.update.mock.calls.find(
      ([arg]) => arg.data.metadata?.notifiedTMinus24h === true,
    );
    expect(flagUpdate).toBeDefined();
  });

  // 4. pushTMinus24h idempotency — flag already true, no push/email.
  it('4. pushTMinus24h: skips bookings with notifiedTMinus24h === true', async () => {
    const svc = await makeService();
    mockPrisma.tourBooking.findMany.mockResolvedValueOnce([
      {
        id: BOOKING_ID,
        buyerUserId: BUYER_USER_ID,
        tourDate: new Date(Date.now() + 24 * 3_600_000),
        metadata: { notifiedTMinus24h: true },
      },
    ]);

    await svc.pushTMinus24h();

    expect(mockNotifications.sendPush).not.toHaveBeenCalled();
    expect(mockSendgrid.sendEmail).not.toHaveBeenCalled();
    expect(mockPrisma.tourBooking.update).not.toHaveBeenCalled();
  });

  // 5. pushTMinus24h window boundaries — findMany query reflects ±1h.
  it('5. pushTMinus24h: findMany query window centres on offsetHours ±1h', async () => {
    const svc = await makeService();
    mockPrisma.tourBooking.findMany.mockResolvedValueOnce([]);
    const beforeNow = Date.now();

    await svc.pushTMinus24h();

    expect(mockPrisma.tourBooking.findMany).toHaveBeenCalledTimes(1);
    const where = mockPrisma.tourBooking.findMany.mock.calls[0][0].where;
    const lo = (where.tourDate.gte as Date).getTime();
    const hi = (where.tourDate.lte as Date).getTime();

    // Window: now + 23h .. now + 25h (default offset 24).
    expect(lo).toBeGreaterThanOrEqual(beforeNow + 23 * 3_600_000 - 5_000);
    expect(lo).toBeLessThanOrEqual(beforeNow + 23 * 3_600_000 + 5_000);
    expect(hi).toBeGreaterThanOrEqual(beforeNow + 25 * 3_600_000 - 5_000);
    expect(hi).toBeLessThanOrEqual(beforeNow + 25 * 3_600_000 + 5_000);
    expect(where.status).toBe('CONFIRMED');
    expect(where.deletedAt).toBeNull();
  });

  // 6. pushTMinus2h — push only (no email), window is ±15min.
  it('6. pushTMinus2h: in-window booking sends push only — no email', async () => {
    const svc = await makeService();
    const booking = {
      id: BOOKING_ID,
      buyerUserId: BUYER_USER_ID,
      tourDate: new Date(Date.now() + 2 * 3_600_000),
      metadata: {},
    };
    mockPrisma.tourBooking.findMany.mockResolvedValueOnce([booking]);
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildFullBooking({ tourDate: booking.tourDate }),
    );

    await svc.pushTMinus2h();

    expect(mockNotifications.sendPush).toHaveBeenCalledTimes(1);
    const [, title, body] = mockNotifications.sendPush.mock.calls[0];
    expect(title).toBe('Your guide is on the way');
    expect(body).toContain('Gate'); // first itinerary location
    expect(mockSendgrid.sendEmail).not.toHaveBeenCalled();

    // Confirm window in findMany query is ±15min (not ±1h).
    const where = mockPrisma.tourBooking.findMany.mock.calls[0][0].where;
    const lo = (where.tourDate.gte as Date).getTime();
    const hi = (where.tourDate.lte as Date).getTime();
    expect(hi - lo).toBe(30 * 60_000);
  });

  // 7. pushPostTourRating — uses tourDate + durationHours; 60min after end → fire.
  it('7. pushPostTourRating: booking ended ~60min ago fires "Rate your tour"', async () => {
    const svc = await makeService();
    // tourDate so that tourDate + 4h durationHours = now - 60min
    const tourDate = new Date(Date.now() - 5 * 3_600_000);
    mockPrisma.tourBooking.findMany.mockResolvedValueOnce([
      {
        id: BOOKING_ID,
        buyerUserId: BUYER_USER_ID,
        tourDate,
        metadata: {},
        tourPackage: { durationHours: 4, name: PACKAGE_NAME },
      },
    ]);

    await svc.pushPostTourRating();

    expect(mockNotifications.sendPush).toHaveBeenCalledTimes(1);
    const [userId, title, body] = mockNotifications.sendPush.mock.calls[0];
    expect(userId).toBe(BUYER_USER_ID);
    expect(title).toBe('Rate your tour');
    expect(body).toContain(PACKAGE_NAME);

    const flagUpdate = mockPrisma.tourBooking.update.mock.calls.find(
      ([arg]) => arg.data.metadata?.notifiedPostTour === true,
    );
    expect(flagUpdate).toBeDefined();
  });

  // 7b. Out-of-window post-tour bookings are skipped (e.g. tour ended 30min ago).
  it('7b. pushPostTourRating: tour ended only 30min ago is outside [45,75]min window — skipped', async () => {
    const svc = await makeService();
    const tourDate = new Date(Date.now() - 4.5 * 3_600_000); // ended 30min ago for 4h tour
    mockPrisma.tourBooking.findMany.mockResolvedValueOnce([
      {
        id: BOOKING_ID,
        buyerUserId: BUYER_USER_ID,
        tourDate,
        metadata: {},
        tourPackage: { durationHours: 4, name: PACKAGE_NAME },
      },
    ]);

    await svc.pushPostTourRating();

    expect(mockNotifications.sendPush).not.toHaveBeenCalled();
  });

  // 8. PlatformConfig override — T-24h offset reads as 12h instead of default 24.
  it('8. pushTMinus24h: PlatformConfig "tour.notify_t_minus_24h_hours"=12 centres window on 12h', async () => {
    const svc = await makeService();
    mockPrisma.platformConfig.findUnique.mockResolvedValueOnce({ value: 12 });
    mockPrisma.tourBooking.findMany.mockResolvedValueOnce([]);
    const beforeNow = Date.now();

    await svc.pushTMinus24h();

    const where = mockPrisma.tourBooking.findMany.mock.calls[0][0].where;
    const lo = (where.tourDate.gte as Date).getTime();
    const hi = (where.tourDate.lte as Date).getTime();
    // Window: now + 11h .. now + 13h (offset 12).
    expect(lo).toBeGreaterThanOrEqual(beforeNow + 11 * 3_600_000 - 5_000);
    expect(hi).toBeLessThanOrEqual(beforeNow + 13 * 3_600_000 + 5_000);

    // And confirm the platformConfig lookup used the correct key.
    expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledWith({
      where: { key: 'tour.notify_t_minus_24h_hours' },
    });
  });

  // 9. Push failure → flag is NOT set so the next cron tick retries.
  it('9. pushTMinus24h: when sendPush throws, notifiedTMinus24h flag is NOT set', async () => {
    const svc = await makeService();
    const booking = {
      id: BOOKING_ID,
      buyerUserId: BUYER_USER_ID,
      tourDate: new Date(Date.now() + 24 * 3_600_000),
      metadata: {},
    };
    mockPrisma.tourBooking.findMany.mockResolvedValueOnce([booking]);
    mockPrisma.tourBooking.findUnique.mockResolvedValueOnce(
      buildFullBooking({ tourDate: booking.tourDate }),
    );
    mockNotifications.sendPush.mockRejectedValueOnce(new Error('FCM exploded'));

    await svc.pushTMinus24h();

    // Flag-set update never happened (so retry will fire next tick).
    const flagUpdates = mockPrisma.tourBooking.update.mock.calls.filter(
      ([arg]) => arg.data.metadata?.notifiedTMinus24h === true,
    );
    expect(flagUpdates).toHaveLength(0);
  });
});
