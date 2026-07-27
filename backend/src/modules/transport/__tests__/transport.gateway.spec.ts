// PLAN-05 will create '../transport.gateway'.
// Until then, this spec is RED — it will fail with "Cannot find module".

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { TransportGateway } from '../transport.gateway';
import { PrismaService } from '../../../prisma/prisma.service';

// ── Mock JWT ───────────────────────────────────────────────────────────────────

const mockJwt = { verify: jest.fn() };

// ── Mock Prisma ────────────────────────────────────────────────────────────────

const mockPrisma = {
  trip: { findFirst: jest.fn() },
  driver: { findFirst: jest.fn() },
};

// ── Mock Socket and Server ────────────────────────────────────────────────────

const mockEmit = jest.fn();
const mockServerTo = jest.fn().mockReturnValue({ emit: mockEmit });

const mockClient = {
  handshake: { auth: { token: 'valid.jwt.token' } },
  disconnect: jest.fn(),
  join: jest.fn(),
  data: {} as any,
  id: 'sock-001',
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('TransportGateway', () => {
  let gateway: TransportGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset mocks after clearAllMocks
    mockServerTo.mockReturnValue({ emit: mockEmit });
    mockClient.data = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransportGateway,
        { provide: JwtService, useValue: mockJwt },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    gateway = module.get<TransportGateway>(TransportGateway);

    // Inject mock server directly — @WebSocketServer() is set after HTTP server attaches
    (gateway as any).server = { to: mockServerTo };
  });

  // ── handleConnection ───────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('disconnects client when handshake auth token is missing', () => {
      const clientWithoutToken = {
        ...mockClient,
        handshake: { auth: {} },
        disconnect: jest.fn(),
        data: {},
      };

      gateway.handleConnection(clientWithoutToken as any);

      expect(clientWithoutToken.disconnect).toHaveBeenCalled();
    });

    it('disconnects client when JwtService.verify throws (invalid/expired token)', () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const clientInvalidToken = {
        ...mockClient,
        handshake: { auth: { token: 'bad.token.here' } },
        disconnect: jest.fn(),
        data: {},
      };

      gateway.handleConnection(clientInvalidToken as any);

      expect(clientInvalidToken.disconnect).toHaveBeenCalled();
    });

    it('sets client.data.userId and client.data.role from a valid JWT payload', () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-uuid-001', role: 'DRIVER' });

      const clientValidToken = {
        ...mockClient,
        handshake: { auth: { token: 'valid.jwt.token' } },
        disconnect: jest.fn(),
        data: {} as any,
      };

      gateway.handleConnection(clientValidToken as any);

      expect(clientValidToken.disconnect).not.toHaveBeenCalled();
      expect(clientValidToken.data.userId).toBe('user-uuid-001');
      expect(clientValidToken.data.role).toBe('DRIVER');
    });
  });

  // ── handleJoinTrip ─────────────────────────────────────────────────────────

  describe('handleJoinTrip', () => {
    it('calls client.join("trip:{tripId}") and returns { joined: tripId } when the socket is the trip rider', async () => {
      const tripId = 'trip-uuid-001';
      const userId = 'rider-uuid-001';
      const clientWithJoin = { ...mockClient, join: jest.fn(), data: { userId } };
      mockPrisma.trip.findFirst.mockResolvedValue({ id: tripId, riderId: userId, driverId: null });

      const result = await gateway.handleJoinTrip(clientWithJoin as any, tripId);

      expect(clientWithJoin.join).toHaveBeenCalledWith(`trip:${tripId}`);
      expect(result).toEqual({ joined: tripId });
    });

    it('calls client.join("trip:{tripId}") and returns { joined: tripId } when the socket is the assigned driver', async () => {
      const tripId = 'trip-uuid-002';
      const userId = 'driver-user-uuid-001';
      const clientWithJoin = { ...mockClient, join: jest.fn(), data: { userId } };
      mockPrisma.trip.findFirst.mockResolvedValue({ id: tripId, riderId: 'someone-else', driverId: 'driver-001' });
      mockPrisma.driver.findFirst.mockResolvedValue({ id: 'driver-001', userId, deletedAt: null });

      const result = await gateway.handleJoinTrip(clientWithJoin as any, tripId);

      expect(clientWithJoin.join).toHaveBeenCalledWith(`trip:${tripId}`);
      expect(result).toEqual({ joined: tripId });
    });

    it('returns { error: "forbidden" } and does not join when the socket is neither the rider nor the assigned driver', async () => {
      const tripId = 'trip-uuid-003';
      const clientWithJoin = { ...mockClient, join: jest.fn(), data: { userId: 'stranger-uuid' } };
      mockPrisma.trip.findFirst.mockResolvedValue({ id: tripId, riderId: 'rider-uuid-001', driverId: 'driver-001' });
      mockPrisma.driver.findFirst.mockResolvedValue(null);

      const result = await gateway.handleJoinTrip(clientWithJoin as any, tripId);

      expect(clientWithJoin.join).not.toHaveBeenCalled();
      expect(result).toEqual({ error: 'forbidden' });
    });

    it('returns { error: "forbidden" } when the trip does not exist', async () => {
      const clientWithJoin = { ...mockClient, join: jest.fn(), data: { userId: 'rider-uuid-001' } };
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      const result = await gateway.handleJoinTrip(clientWithJoin as any, 'nonexistent-trip');

      expect(clientWithJoin.join).not.toHaveBeenCalled();
      expect(result).toEqual({ error: 'forbidden' });
    });
  });

  // ── handleDriverLocation ───────────────────────────────────────────────────

  describe('handleDriverLocation', () => {
    it('calls server.to("trip:{tripId}").emit("driver:location", { lat, lng }) when the socket is the assigned driver', async () => {
      const data = { tripId: 'trip-uuid-001', lat: 7.1608, lng: 3.3475 };
      const userId = 'driver-user-uuid-001';
      const client = { ...mockClient, data: { userId } };
      mockPrisma.trip.findFirst.mockResolvedValue({ id: data.tripId, driverId: 'driver-001' });
      mockPrisma.driver.findFirst.mockResolvedValue({ id: 'driver-001', userId, deletedAt: null });

      await gateway.handleDriverLocation(client as any, data);

      expect(mockServerTo).toHaveBeenCalledWith(`trip:${data.tripId}`);
      expect(mockEmit).toHaveBeenCalledWith('driver:location', { lat: data.lat, lng: data.lng });
    });

    it('does not emit when the socket is not the trip\'s assigned driver', async () => {
      const data = { tripId: 'trip-uuid-002', lat: 7.1608, lng: 3.3475 };
      const client = { ...mockClient, data: { userId: 'attacker-uuid' } };
      mockPrisma.trip.findFirst.mockResolvedValue({ id: data.tripId, driverId: 'driver-001' });
      mockPrisma.driver.findFirst.mockResolvedValue(null);

      await gateway.handleDriverLocation(client as any, data);

      expect(mockServerTo).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('does not emit when the trip has no assigned driver', async () => {
      const data = { tripId: 'trip-uuid-003', lat: 7.1608, lng: 3.3475 };
      const client = { ...mockClient, data: { userId: 'someone-uuid' } };
      mockPrisma.trip.findFirst.mockResolvedValue({ id: data.tripId, driverId: null });

      await gateway.handleDriverLocation(client as any, data);

      expect(mockServerTo).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  // ── handleDisconnect ───────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('does not throw and logs the client.id', () => {
      const clientToDisconnect = { ...mockClient, id: 'sock-disconnect-001' };

      expect(() => gateway.handleDisconnect(clientToDisconnect as any)).not.toThrow();
    });
  });
});
