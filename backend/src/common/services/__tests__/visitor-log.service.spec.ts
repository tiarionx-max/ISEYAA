import { Test, TestingModule } from '@nestjs/testing';
import { VisitorLogService } from '../visitor-log.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserRole } from '../../enums/user-role.enum';
import {
  VISITOR_PURPOSE_VALUES,
  DEFAULT_VISITOR_PURPOSE,
} from '../../constants/visitor-purpose.constants';

/**
 * 14-02 Task 1 — VisitorLogService (D-08's sole write path into VisitorLog)
 * + the purpose-of-visit taxonomy constant (D-05/D-06).
 */

describe('VISITOR_PURPOSE_VALUES / DEFAULT_VISITOR_PURPOSE', () => {
  it('has exactly 7 entries matching D-05 verbatim', () => {
    expect(VISITOR_PURPOSE_VALUES).toEqual([
      'Tourism/Leisure',
      'Business',
      'Religious/Pilgrimage',
      'Family/Personal',
      'Event Attendance',
      'Education',
      'Other',
    ]);
    expect(VISITOR_PURPOSE_VALUES).toHaveLength(7);
  });

  it('maps each source type to its D-06 default', () => {
    expect(DEFAULT_VISITOR_PURPOSE).toEqual({
      EVENT: 'Event Attendance',
      STAY: 'Tourism/Leisure',
      TOUR: 'Tourism/Leisure',
    });
  });
});

describe('VisitorLogService', () => {
  let service: VisitorLogService;
  let mockPrisma: { visitorLog: { create: jest.Mock } };

  beforeEach(async () => {
    mockPrisma = {
      visitorLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        VisitorLogService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = moduleRef.get(VisitorLogService);
  });

  it('record() calls prisma.visitorLog.create exactly once with the D-07 shape', async () => {
    const visitedAt = new Date('2026-07-18T10:00:00Z');

    await service.record({
      lgaId: 'lga-1',
      purpose: 'Event Attendance',
      sourceType: 'EVENT',
      sourceId: 'ticket-1',
      visitedAt,
      userRole: UserRole.TOURIST,
    });

    expect(mockPrisma.visitorLog.create).toHaveBeenCalledTimes(1);
    const call = mockPrisma.visitorLog.create.mock.calls[0][0];
    expect(call.data).toEqual({
      lgaId: 'lga-1',
      purpose: 'Event Attendance',
      sourceType: 'EVENT',
      sourceId: 'ticket-1',
      visitedAt,
      userRole: UserRole.TOURIST,
    });
    expect(Object.keys(call.data).sort()).toEqual(
      ['lgaId', 'purpose', 'sourceType', 'sourceId', 'visitedAt', 'userRole'].sort(),
    );
  });

  it('record() accepts a null lgaId', async () => {
    await service.record({
      lgaId: null,
      purpose: 'Other',
      sourceType: 'TOUR',
      sourceId: 'tour-booking-1',
      visitedAt: new Date(),
      userRole: UserRole.CITIZEN,
    });

    expect(mockPrisma.visitorLog.create).toHaveBeenCalledTimes(1);
    const call = mockPrisma.visitorLog.create.mock.calls[0][0];
    expect(call.data.lgaId).toBeNull();
  });

  it('record() accepts an unlisted purpose string without client-side validation', async () => {
    await service.record({
      lgaId: 'lga-2',
      purpose: 'Some Future Category',
      sourceType: 'STAY',
      sourceId: 'booking-1',
      visitedAt: new Date(),
      userRole: UserRole.HOST,
    });

    expect(mockPrisma.visitorLog.create).toHaveBeenCalledTimes(1);
  });
});
