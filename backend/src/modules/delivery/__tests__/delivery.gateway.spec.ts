// Plan 04-04 will create '../delivery.gateway'.
// Until then, this spec is RED — it will fail with "Cannot find module".

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DeliveryGateway } from '../delivery.gateway';
import { PrismaService } from '../../../prisma/prisma.service';

// ── Mock JWT ───────────────────────────────────────────────────────────────────

const mockJwt = { verify: jest.fn() };

// ── Mock Prisma ────────────────────────────────────────────────────────────────

const mockPrisma = {
  deliveryOrder: { findFirst: jest.fn() },
  deliveryRider: { findFirst: jest.fn() },
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

describe('DeliveryGateway', () => {
  let gateway: DeliveryGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset mocks after clearAllMocks
    mockServerTo.mockReturnValue({ emit: mockEmit });
    mockClient.data = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryGateway,
        { provide: JwtService, useValue: mockJwt },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    gateway = module.get<DeliveryGateway>(DeliveryGateway);

    // Inject mock server directly — @WebSocketServer() is set after HTTP server attaches
    (gateway as any).server = { to: mockServerTo };
  });

  // ── handleJoinDelivery ─────────────────────────────────────────────────────

  describe('handleJoinDelivery', () => {
    it('joins the room and returns { joined: deliveryId } when the socket is the delivery sender', async () => {
      const deliveryId = 'order-uuid-001';
      const userId = 'sender-uuid-001';
      const client = { ...mockClient, join: jest.fn(), data: { userId } };
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue({ id: deliveryId, senderId: userId, riderId: null });

      const result = await gateway.handleJoinDelivery(client as any, deliveryId);

      expect(client.join).toHaveBeenCalledWith(`delivery:${deliveryId}`);
      expect(result).toEqual({ joined: deliveryId });
    });

    it('joins the room and returns { joined: deliveryId } when the socket is the assigned rider', async () => {
      const deliveryId = 'order-uuid-002';
      const userId = 'rider-user-uuid-001';
      const client = { ...mockClient, join: jest.fn(), data: { userId } };
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue({ id: deliveryId, senderId: 'someone-else', riderId: 'rider-001' });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue({ id: 'rider-001', userId, deletedAt: null });

      const result = await gateway.handleJoinDelivery(client as any, deliveryId);

      expect(client.join).toHaveBeenCalledWith(`delivery:${deliveryId}`);
      expect(result).toEqual({ joined: deliveryId });
    });

    it('returns { error: "forbidden" } and does not join when the socket is neither the sender nor the assigned rider', async () => {
      const deliveryId = 'order-uuid-003';
      const client = { ...mockClient, join: jest.fn(), data: { userId: 'stranger-uuid' } };
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue({ id: deliveryId, senderId: 'sender-uuid-001', riderId: 'rider-001' });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(null);

      const result = await gateway.handleJoinDelivery(client as any, deliveryId);

      expect(client.join).not.toHaveBeenCalled();
      expect(result).toEqual({ error: 'forbidden' });
    });
  });

  // ── handleRiderLocation ────────────────────────────────────────────────────

  describe('handleRiderLocation', () => {
    it('calls server.to("delivery:{deliveryId}").emit("rider:location", { lat, lng }) when the socket is the assigned rider — NOT server.emit() globally', async () => {
      const data = { deliveryId: 'order-uuid-001', lat: 7.1608, lng: 3.3475 };
      const userId = 'rider-user-uuid-001';
      const client = { ...mockClient, data: { userId } };
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue({ id: data.deliveryId, riderId: 'rider-001' });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue({ id: 'rider-001', userId, deletedAt: null });

      await gateway.handleRiderLocation(client as any, data);

      expect(mockServerTo).toHaveBeenCalledWith(`delivery:${data.deliveryId}`);
      expect(mockEmit).toHaveBeenCalledWith('rider:location', { lat: data.lat, lng: data.lng });
    });

    it('does not emit when the socket is not the delivery\'s assigned rider', async () => {
      const data = { deliveryId: 'order-uuid-002', lat: 7.1608, lng: 3.3475 };
      const client = { ...mockClient, data: { userId: 'attacker-uuid' } };
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue({ id: data.deliveryId, riderId: 'rider-001' });
      mockPrisma.deliveryRider.findFirst.mockResolvedValue(null);

      await gateway.handleRiderLocation(client as any, data);

      expect(mockServerTo).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('does not emit when the delivery has no assigned rider', async () => {
      const data = { deliveryId: 'order-uuid-003', lat: 7.1608, lng: 3.3475 };
      const client = { ...mockClient, data: { userId: 'someone-uuid' } };
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue({ id: data.deliveryId, riderId: null });

      await gateway.handleRiderLocation(client as any, data);

      expect(mockServerTo).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });
});
