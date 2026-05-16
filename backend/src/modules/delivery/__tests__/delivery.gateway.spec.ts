// Plan 04-04 will create '../delivery.gateway'.
// Until then, this spec is RED — it will fail with "Cannot find module".

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DeliveryGateway } from '../delivery.gateway';

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
      ],
    }).compile();

    gateway = module.get<DeliveryGateway>(DeliveryGateway);

    // Inject mock server directly — @WebSocketServer() is set after HTTP server attaches
    (gateway as any).server = { to: mockServerTo };
  });

  // ── handleRiderLocation ────────────────────────────────────────────────────

  describe('handleRiderLocation', () => {
    it('calls server.to("delivery:{deliveryId}").emit("rider:location", { lat, lng }) — NOT server.emit() globally', () => {
      const data = { deliveryId: 'order-uuid-001', lat: 7.1608, lng: 3.3475 };

      gateway.handleRiderLocation(mockClient as any, data);

      expect(mockServerTo).toHaveBeenCalledWith(`delivery:${data.deliveryId}`);
      expect(mockEmit).toHaveBeenCalledWith('rider:location', { lat: data.lat, lng: data.lng });
    });
  });
});
