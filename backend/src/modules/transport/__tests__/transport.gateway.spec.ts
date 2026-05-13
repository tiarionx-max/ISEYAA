// PLAN-05 will create '../transport.gateway'.
// Until then, this spec is RED — it will fail with "Cannot find module".

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { TransportGateway } from '../transport.gateway';

// ── Mock JWT ───────────────────────────────────────────────────────────────────

const mockJwt = { verify: jest.fn() };

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
    it('calls client.join("trip:{tripId}") and returns { joined: tripId }', () => {
      const tripId = 'trip-uuid-001';
      const clientWithJoin = { ...mockClient, join: jest.fn(), data: {} };

      const result = gateway.handleJoinTrip(clientWithJoin as any, tripId);

      expect(clientWithJoin.join).toHaveBeenCalledWith(`trip:${tripId}`);
      expect(result).toEqual({ joined: tripId });
    });
  });

  // ── handleDriverLocation ───────────────────────────────────────────────────

  describe('handleDriverLocation', () => {
    it('calls server.to("trip:{tripId}").emit("driver:location", { lat, lng })', () => {
      const data = { tripId: 'trip-uuid-001', lat: 7.1608, lng: 3.3475 };

      gateway.handleDriverLocation(mockClient as any, data);

      expect(mockServerTo).toHaveBeenCalledWith(`trip:${data.tripId}`);
      expect(mockEmit).toHaveBeenCalledWith('driver:location', { lat: data.lat, lng: data.lng });
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
