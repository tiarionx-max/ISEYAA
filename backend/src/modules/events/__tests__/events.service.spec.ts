import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { EventsService } from '../events.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { S3Service } from '../../../common/services/s3.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { QrService } from '../../../common/services/qr.service';
import { ImageService } from '../../../common/services/image.service';
import { KafkaService } from '../../../kafka/kafka.service';
import { SettlementService } from '../../../common/services/settlement.service';
import { VisitorLogService } from '../../../common/services/visitor-log.service';

const mockKafka = { emit: jest.fn().mockResolvedValue(undefined), consume: jest.fn().mockResolvedValue(undefined) };

const ORG_ID = 'org-uuid-001';
const EVENT_ID = 'event-uuid-001';
const TICKET_TYPE_ID = 'tt-uuid-001';
const USER_ID = 'user-uuid-001';
const TICKET_ID = 'ticket-uuid-001';
const QR_HASH = 'ISY-ABCDEF123456';
const PAYSTACK_REF = 'ISY-TKT-ABCDEF123456';

const mockEvent = {
  id: EVENT_ID,
  organizerId: ORG_ID,
  lgaId: 'lga-001',
  title: 'Ogun Festival',
  slug: 'ogun-festival-abc',
  venue: 'Abeokuta Centre',
  startDate: new Date('2026-08-15'),
  endDate: new Date('2026-08-15'),
  status: 'PUBLISHED',
  isFeatured: false,
  imageUrls: [],
  deletedAt: null,
};

const mockTicketType = {
  id: TICKET_TYPE_ID,
  eventId: EVENT_ID,
  name: 'General',
  price: 2000,
  quantity: 100,
  sold: 50,
  deletedAt: null,
  event: { status: 'PUBLISHED', title: 'Ogun Festival' },
};

const mockTicket = {
  id: TICKET_ID,
  ticketTypeId: TICKET_TYPE_ID,
  userId: USER_ID,
  qrCode: QR_HASH,
  paystackRef: PAYSTACK_REF,
  status: 'PENDING',
  usedAt: null,
  createdAt: new Date('2026-05-11T10:00:00Z'),
  metadata: {},
  ticketType: {
    id: TICKET_TYPE_ID,
    name: 'General',
    price: 2000,
    event: {
      title: 'Ogun Festival',
      startDate: new Date('2026-08-15'),
      venue: 'Abeokuta Centre',
      organizerId: ORG_ID,
      lgaId: 'lga-001',
    },
  },
  user: { email: 'buyer@example.com', firstName: 'Ade', role: 'TOURIST' },
};

const mockPrisma = {
  event: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  ticketType: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  ticket: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  platformConfig: {
    findUnique: jest.fn(),
  },
  wallet: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockPaystack = { initiatePayment: jest.fn() };
const mockS3 = { upload: jest.fn() };
const mockSendgrid = { sendTicketConfirmation: jest.fn(), sendEmail: jest.fn() };
const mockQr = { generatePng: jest.fn() };
const mockImage = { validateEventImage: jest.fn(), resizeEventCover: jest.fn() };
const mockSettlement = {
  settle: jest.fn().mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] }),
  resolveMinistryWallet: jest.fn().mockResolvedValue({ id: 'WAL-MINISTRY' }),
  resolveSplit: jest.fn().mockResolvedValue({ earnerPct: 0.85, ministryPct: 0.05, platformPct: 0.1 }),
};
const mockVisitorLog = { record: jest.fn().mockResolvedValue(undefined) };

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset mockSettlement's implementations after clearAllMocks (clearAllMocks does
    // not remove a custom .mockImplementation set by an earlier test — mirrors
    // transport.service.spec.ts's beforeEach reset).
    mockSettlement.settle.mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] });
    mockSettlement.resolveMinistryWallet.mockResolvedValue({ id: 'WAL-MINISTRY' });
    mockSettlement.resolveSplit.mockResolvedValue({ earnerPct: 0.85, ministryPct: 0.05, platformPct: 0.1 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaystackService, useValue: mockPaystack },
        { provide: S3Service, useValue: mockS3 },
        { provide: SendgridService, useValue: mockSendgrid },
        { provide: QrService, useValue: mockQr },
        { provide: ImageService, useValue: mockImage },
        { provide: KafkaService, useValue: mockKafka },
        { provide: SettlementService, useValue: mockSettlement },
        { provide: VisitorLogService, useValue: mockVisitorLog },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates event with a generated slug', async () => {
      mockPrisma.event.create.mockResolvedValue({ ...mockEvent, id: 'new-id' });
      const dto = {
        title: 'Ogun Festival',
        lgaId: 'lga-001',
        venue: 'Abeokuta Centre',
        startDate: '2026-08-15T09:00:00Z',
        endDate: '2026-08-15T21:00:00Z',
      };

      const result = await service.create(ORG_ID, dto as any);

      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizerId: ORG_ID,
            title: 'Ogun Festival',
            status: 'DRAFT',
            slug: expect.stringMatching(/^ogun-festival-/),
          }),
        }),
      );
      expect(result.id).toBe('new-id');
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('queries published events with given filters', async () => {
      mockPrisma.event.findMany.mockResolvedValue([mockEvent]);

      const result = await service.findAll({ lgaId: 'lga-001', featured: true, page: 1, limit: 10 });

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED', lgaId: 'lga-001', isFeatured: true }),
          skip: 0,
          take: 10,
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ── findById ────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns event when found', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      const result = await service.findById(EVENT_ID);
      expect(result.id).toBe(EVENT_ID);
    });

    it('throws NotFoundException when event not found', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);
      await expect(service.findById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);
      await expect(service.update('bad-id', ORG_ID, { title: 'New' } as any)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when caller is not the organizer', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      await expect(service.update(EVENT_ID, 'other-user', { title: 'New' } as any)).rejects.toThrow(ForbiddenException);
    });

    it('updates event when caller is the organizer', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.event.update.mockResolvedValue({ ...mockEvent, title: 'Updated' });

      const result = await service.update(EVENT_ID, ORG_ID, { title: 'Updated' } as any);
      expect(result.title).toBe('Updated');
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('throws ForbiddenException when caller is not the organizer', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      await expect(service.remove(EVENT_ID, 'other-user')).rejects.toThrow(ForbiddenException);
    });

    it('soft deletes event and returns { deleted: true }', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.event.update.mockResolvedValue({});

      const result = await service.remove(EVENT_ID, ORG_ID);
      expect(mockPrisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
      expect(result).toEqual({ deleted: true });
    });
  });

  // ── uploadImage ─────────────────────────────────────────────────────────────

  describe('uploadImage', () => {
    const mockFile = { buffer: Buffer.from('img'), mimetype: 'image/jpeg', size: 1024 } as any;

    it('stores .webp key and passes image/webp content type to s3', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      mockImage.resizeEventCover.mockResolvedValue({ buffer: Buffer.from('webp'), contentType: 'image/webp' });
      mockS3.upload.mockResolvedValue('https://cdn.example.com/events/event-001/img.webp');

      const result = await service.uploadImage(EVENT_ID, ORG_ID, mockFile);

      expect(mockImage.resizeEventCover).toHaveBeenCalledWith(mockFile.buffer);
      expect(mockS3.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^events\/.*\.webp$/),
        expect.any(Buffer),
        'image/webp',
      );
      expect(result.url).toContain('.webp');
    });

    it('throws NotFoundException when event not found', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);
      await expect(service.uploadImage('bad', ORG_ID, mockFile)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when caller is not the organizer', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      await expect(service.uploadImage(EVENT_ID, 'wrong-org', mockFile)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── purchaseTicket ───────────────────────────────────────────────────────────

  describe('purchaseTicket', () => {
    const dto = { ticketTypeId: TICKET_TYPE_ID, email: 'buyer@example.com' };

    it('throws NotFoundException when ticket type not found', async () => {
      mockPrisma.ticketType.findFirst.mockResolvedValue(null);
      await expect(service.purchaseTicket(USER_ID, EVENT_ID, dto as any)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when event not published', async () => {
      mockPrisma.ticketType.findFirst.mockResolvedValue({
        ...mockTicketType,
        event: { status: 'DRAFT', title: 'X' },
      });
      await expect(service.purchaseTicket(USER_ID, EVENT_ID, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when sold out', async () => {
      mockPrisma.ticketType.findFirst.mockResolvedValue({
        ...mockTicketType,
        sold: 100,
        quantity: 100,
      });
      await expect(service.purchaseTicket(USER_ID, EVENT_ID, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('creates PENDING ticket and initiates Paystack payment', async () => {
      mockPrisma.ticketType.findFirst.mockResolvedValue(mockTicketType);
      mockPrisma.ticket.create.mockResolvedValue(mockTicket);
      mockPaystack.initiatePayment.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/abc',
        accessCode: 'abc',
        reference: PAYSTACK_REF,
      });

      const result = await service.purchaseTicket(USER_ID, EVENT_ID, dto as any);

      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', userId: USER_ID }),
        }),
      );
      expect(mockPaystack.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'buyer@example.com',
          amountKobo: 200000,
          metadata: expect.objectContaining({ type: 'ticket_purchase' }),
        }),
      );
      expect(result.ticket).toBeDefined();
      expect(result.payment.authorizationUrl).toBe('https://paystack.com/pay/abc');
    });
  });

  // ── handleTicketPayment ──────────────────────────────────────────────────────

  describe('handleTicketPayment', () => {
    beforeEach(() => {
      mockQr.generatePng.mockResolvedValue(Buffer.from('png'));
      mockS3.upload.mockResolvedValue('https://cdn.iseyaa.gov.ng/qr-codes/ticket-001.png');
      mockPrisma.wallet.findUnique.mockImplementation(({ where }: any) => {
        if (where.userId === ORG_ID) return Promise.resolve({ id: 'WAL-ORG' });
        if (where.userId === USER_ID) return Promise.resolve({ id: 'WAL-BUYER' });
        return Promise.resolve(null);
      });
    });

    it('returns early when ticket not found', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);
      await service.handleTicketPayment({ reference: 'UNKNOWN' });
      expect(mockQr.generatePng).not.toHaveBeenCalled();
      expect(mockSettlement.settle).not.toHaveBeenCalled();
    });

    it('returns early when ticket already ISSUED', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({ ...mockTicket, status: 'ISSUED' });
      await service.handleTicketPayment({ reference: PAYSTACK_REF });
      expect(mockQr.generatePng).not.toHaveBeenCalled();
      expect(mockSettlement.settle).not.toHaveBeenCalled();
    });

    it('splits organiser/Ministry amounts using resolveSplit percentages and sends email', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockSettlement.resolveSplit.mockResolvedValueOnce({ earnerPct: 0.85, ministryPct: 0.05, platformPct: 0.1 });
      mockSendgrid.sendTicketConfirmation.mockResolvedValue(undefined);

      await service.handleTicketPayment({ reference: PAYSTACK_REF });

      expect(mockSettlement.resolveSplit).toHaveBeenCalledWith('events', mockTicketType.price);
      expect(mockQr.generatePng).toHaveBeenCalledWith(QR_HASH);
      expect(mockS3.upload).toHaveBeenCalledWith(
        `qr-codes/${TICKET_ID}.png`,
        expect.any(Buffer),
        'image/png',
      );
      expect(mockSettlement.settle).toHaveBeenCalledTimes(1);
      const settleArgs = mockSettlement.settle.mock.calls[0][0];
      expect(settleArgs.recipients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tag: 'ORGANISER', amountNgn: mockTicketType.price * (1 - 0.1 - 0.05) }),
          expect.objectContaining({ tag: 'MINISTRY', amountNgn: mockTicketType.price * 0.05 }),
        ]),
      );
      expect(mockSendgrid.sendTicketConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'buyer@example.com', qrCode: QR_HASH }),
      );
    });

    // SETTLE-11c regression coverage — 18-02-PLAN.md Task 3: resolveSplit's 0-1
    // fractions are used directly with NO unit conversion (unlike Transport/Delivery,
    // which multiply by 100 — D-03).
    it('computes organiserAmountNgn=850 via resolveSplit for ticketPrice=1000 with no unit conversion (fraction-shaped, D-03)', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        ...mockTicket,
        ticketType: { ...mockTicket.ticketType, price: 1000 },
      });
      mockSettlement.resolveSplit.mockResolvedValueOnce({ earnerPct: 0.85, ministryPct: 0.05, platformPct: 0.1 });

      await service.handleTicketPayment({ reference: PAYSTACK_REF });

      expect(mockSettlement.resolveSplit).toHaveBeenCalledWith('events', 1000);
      expect(mockSettlement.settle).toHaveBeenCalledTimes(1);
      const settleArgs = mockSettlement.settle.mock.calls[0][0];
      expect(settleArgs.recipients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tag: 'ORGANISER', amountNgn: 850 }),
          expect.objectContaining({ tag: 'MINISTRY', amountNgn: 50 }),
        ]),
      );
    });

    it('no longer reads events.platform_fee_pct/events.govt_levy_pct from PlatformConfig', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);

      await service.handleTicketPayment({ reference: PAYSTACK_REF });

      const calledKeys = mockPrisma.platformConfig.findUnique.mock.calls.map((c: any) => c[0].where.key);
      expect(calledKeys).not.toContain('events.platform_fee_pct');
      expect(calledKeys).not.toContain('events.govt_levy_pct');
      expect(mockSettlement.resolveSplit).toHaveBeenCalledWith('events', mockTicketType.price);
    });

    it('does not call settlementService.settle on a non-PENDING ticket', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({ ...mockTicket, status: 'ISSUED' });

      await service.handleTicketPayment({ reference: PAYSTACK_REF });

      expect(mockSettlement.settle).not.toHaveBeenCalled();
    });

    it('marks the ticket ISSUED and increments TicketType.sold inside the onSettled callback', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.platformConfig.findUnique.mockResolvedValue(null);

      await service.handleTicketPayment({ reference: PAYSTACK_REF });

      const settleArgs = mockSettlement.settle.mock.calls[0][0];
      const mockTx = {
        ticket: { update: jest.fn().mockResolvedValue({}) },
        ticketType: { update: jest.fn().mockResolvedValue({}) },
      };
      await settleArgs.onSettled(mockTx);

      expect(mockTx.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TICKET_ID },
          data: expect.objectContaining({ status: 'ISSUED' }),
        }),
      );
      expect(mockTx.ticketType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TICKET_TYPE_ID },
          data: expect.objectContaining({ sold: { increment: 1 } }),
        }),
      );
    });

    it('does not send email when user has no email', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        ...mockTicket,
        user: { email: null, firstName: 'Ade' },
      });
      mockPrisma.platformConfig.findUnique.mockResolvedValue(null);

      await service.handleTicketPayment({ reference: PAYSTACK_REF });

      expect(mockSendgrid.sendTicketConfirmation).not.toHaveBeenCalled();
    });

    it('WR-04: does not re-send confirmation email when settle() reports a REPLAYED duplicate delivery', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.platformConfig.findUnique.mockResolvedValue(null);
      mockSettlement.settle.mockResolvedValueOnce({
        status: 'REPLAYED',
        platformAmountNgn: 0,
        recipientCredits: [],
      });

      await service.handleTicketPayment({ reference: PAYSTACK_REF });

      expect(mockSettlement.settle).toHaveBeenCalledTimes(1);
      expect(mockSendgrid.sendTicketConfirmation).not.toHaveBeenCalled();
    });
  });

  // ── checkin ──────────────────────────────────────────────────────────────────

  describe('checkin', () => {
    const issuedTicket = {
      ...mockTicket,
      status: 'ISSUED',
      ticketType: {
        ...mockTicket.ticketType,
        event: { organizerId: ORG_ID, lgaId: 'lga-001' },
      },
    };

    it('returns NOT_FOUND when ticket does not exist', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);
      const result = await service.checkin('UNKNOWN', ORG_ID);
      expect(result).toEqual({ result: 'NOT_FOUND' });
    });

    it('throws ForbiddenException when caller is not event organizer', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(issuedTicket);
      await expect(service.checkin(QR_HASH, 'wrong-org')).rejects.toThrow(ForbiddenException);
    });

    it('returns ALREADY_USED for a used ticket', async () => {
      const usedAt = new Date();
      mockPrisma.ticket.findUnique.mockResolvedValue({
        ...issuedTicket,
        status: 'USED',
        usedAt,
      });

      const result = await service.checkin(QR_HASH, ORG_ID);
      expect(result).toEqual({ result: 'ALREADY_USED', usedAt });
    });

    it('returns NOT_FOUND when ticket is still PENDING', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        ...issuedTicket,
        status: 'PENDING',
      });

      const result = await service.checkin(QR_HASH, ORG_ID);
      expect(result).toEqual({ result: 'NOT_FOUND' });
    });

    it('marks ticket USED and returns VALID', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(issuedTicket);
      mockPrisma.ticket.update.mockResolvedValue({ ...issuedTicket, status: 'USED' });

      const result = await service.checkin(QR_HASH, ORG_ID);

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TICKET_ID },
          data: expect.objectContaining({ status: 'USED', usedAt: expect.any(Date) }),
        }),
      );
      expect(result).toEqual({ result: 'VALID' });
    });

    it('D-01/MIN-02: writes a VisitorLog row exactly once on a successful check-in', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(issuedTicket);
      mockPrisma.ticket.update.mockResolvedValue({ ...issuedTicket, status: 'USED' });

      await service.checkin(QR_HASH, ORG_ID);

      expect(mockVisitorLog.record).toHaveBeenCalledTimes(1);
      expect(mockVisitorLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'EVENT',
          sourceId: TICKET_ID,
          lgaId: 'lga-001',
        }),
      );
    });

    it('still resolves VALID when VisitorLogService.record() rejects', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(issuedTicket);
      mockPrisma.ticket.update.mockResolvedValue({ ...issuedTicket, status: 'USED' });
      mockVisitorLog.record.mockRejectedValueOnce(new Error('db down'));

      const result = await service.checkin(QR_HASH, ORG_ID);

      expect(result).toEqual({ result: 'VALID' });
    });

    it('does not write a VisitorLog row on NOT_FOUND/ALREADY_USED/forbidden paths', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);
      await service.checkin('UNKNOWN', ORG_ID);
      expect(mockVisitorLog.record).not.toHaveBeenCalled();
    });
  });

  // ── getAnalytics ──────────────────────────────────────────────────────────────

  describe('getAnalytics', () => {
    const eventWithTickets = {
      ...mockEvent,
      ticketTypes: [
        {
          id: TICKET_TYPE_ID,
          price: 2000,
          deletedAt: null,
          tickets: [
            { id: 't1', status: 'ISSUED', createdAt: new Date('2026-05-11T09:00:00Z') },
            { id: 't2', status: 'USED', createdAt: new Date('2026-05-11T10:00:00Z') },
            { id: 't3', status: 'ISSUED', createdAt: new Date('2026-05-11T10:30:00Z') },
          ],
        },
      ],
    };

    it('throws NotFoundException when event not found', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);
      await expect(service.getAnalytics(EVENT_ID, ORG_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when caller is not organizer', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
      await expect(service.getAnalytics(EVENT_ID, 'other')).rejects.toThrow(ForbiddenException);
    });

    it('returns correct analytics metrics', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(eventWithTickets);

      const result = await service.getAnalytics(EVENT_ID, ORG_ID);

      expect(result.tickets_sold).toBe(3);
      expect(result.revenue).toBe(6000); // 3 * 2000
      expect(result.check_in_rate).toBeCloseTo(1 / 3);
      expect(result.hourly_sales_chart.length).toBeGreaterThan(0);
      // Two tickets in the 10:xx hour
      const hour10 = result.hourly_sales_chart.find((h) => h.hour.includes('T10'));
      expect(hour10?.count).toBe(2);
    });
  });
});
