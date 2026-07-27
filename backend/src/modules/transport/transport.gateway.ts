import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ── TransportGateway ─────────────────────────────────────────────────────────
// WebSocket gateway for live GPS updates and trip-room messaging.
// Shares port 3001 with the REST API — NO explicit port arg (Pitfall 1).
// JWT is verified on every connection; unauthenticated clients are disconnected.

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  // No port arg — attaches to the same HTTP server as the REST API (port 3001)
})
@Injectable()
export class TransportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TransportGateway.name);

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  // ── isAuthorizedForTrip ──────────────────────────────────────────────────
  // A socket may only be associated with a trip room if it is the rider on
  // that trip, or the driver assigned to that trip (matches the REST-layer
  // `trip.driverId !== driver.id` checks in transport.service.ts).

  private async isAuthorizedForTrip(userId: string, tripId: string): Promise<boolean> {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId } });
    if (!trip) return false;
    if (trip.riderId === userId) return true;
    if (!trip.driverId) return false;
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
    });
    return !!driver && trip.driverId === driver.id;
  }

  // ── handleConnection ───────────────────────────────────────────────────────

  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token;
    if (!token) {
      this.logger.warn(`Connection rejected — no token (${client.id})`);
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      this.logger.log(`Client connected: ${client.id} userId=${payload.sub} role=${payload.role}`);
    } catch {
      this.logger.warn(`Connection rejected — invalid token (${client.id})`);
      client.disconnect();
    }
  }

  // ── handleDisconnect ───────────────────────────────────────────────────────

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ── join:trip ──────────────────────────────────────────────────────────────
  // Rider and driver both join the trip room so the gateway can relay
  // driver:location events without broadcasting to all sockets.

  @SubscribeMessage('join:trip')
  async handleJoinTrip(
    @ConnectedSocket() client: Socket,
    @MessageBody() tripId: string,
  ): Promise<{ joined: string } | { error: string }> {
    const userId = client.data.userId;
    if (!userId || !(await this.isAuthorizedForTrip(userId, tripId))) {
      this.logger.warn(`Socket ${client.id} (userId=${userId}) denied join to trip:${tripId} — not rider or assigned driver`);
      return { error: 'forbidden' };
    }
    client.join(`trip:${tripId}`);
    this.logger.log(`Socket ${client.id} joined room trip:${tripId}`);
    return { joined: tripId };
  }

  // ── driver:location ────────────────────────────────────────────────────────
  // Relay driver GPS coordinates to all sockets in the specific trip room.
  // NEVER uses this.server.emit() — that would broadcast to every connected
  // socket, leaking the driver's position to all riders (T-03-20).

  @SubscribeMessage('driver:location')
  async handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string; lat: number; lng: number },
  ): Promise<void> {
    const userId = client.data.userId;
    const trip = await this.prisma.trip.findFirst({ where: { id: data.tripId } });
    if (!trip || !trip.driverId) return;
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!driver || trip.driverId !== driver.id) {
      this.logger.warn(`Socket ${client.id} (userId=${userId}) denied driver:location emit for trip:${data.tripId} — not assigned driver`);
      return;
    }
    this.server.to(`trip:${data.tripId}`).emit('driver:location', {
      lat: data.lat,
      lng: data.lng,
    });
  }

  // ── join:driver ────────────────────────────────────────────────────────────
  // Driver socket joins its personal room driver:{driverId} so requestRide()
  // can target a specific driver via server.to('driver:'+nearestDriverId).emit.

  @SubscribeMessage('join:driver')
  handleJoinDriver(
    @ConnectedSocket() client: Socket,
  ): { joined: string } | { error: string } {
    if (client.data.role !== 'DRIVER') {
      return { error: 'forbidden' };
    }
    client.join(`driver:${client.data.userId}`);
    this.logger.log(`Driver socket ${client.id} joined room driver:${client.data.userId}`);
    return { joined: `driver:${client.data.userId}` };
  }
}
