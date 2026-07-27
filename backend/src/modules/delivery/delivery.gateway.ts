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

// ── DeliveryGateway ───────────────────────────────────────────────────────────
// WebSocket gateway for live GPS updates and delivery-room messaging.
// Shares port 3001 with the REST API — NO explicit port arg.
// JWT is verified on every connection; unauthenticated clients are disconnected.

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  // No port arg — attaches to the same HTTP server as the REST API (port 3001)
})
@Injectable()
export class DeliveryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DeliveryGateway.name);

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  // ── isAuthorizedForDelivery ──────────────────────────────────────────────
  // A socket may only be associated with a delivery room if it is the sender
  // on that delivery, or the rider assigned to it (matches the REST-layer
  // `order.riderId !== rider.id` checks in delivery.service.ts).

  private async isAuthorizedForDelivery(userId: string, deliveryId: string): Promise<boolean> {
    const order = await this.prisma.deliveryOrder.findFirst({ where: { id: deliveryId } });
    if (!order) return false;
    if (order.senderId === userId) return true;
    if (!order.riderId) return false;
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId, deletedAt: null },
    });
    return !!rider && order.riderId === rider.id;
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

  // ── join:delivery ──────────────────────────────────────────────────────────
  // Sender and rider both join the delivery room so the gateway can relay
  // rider:location events without broadcasting to all sockets.

  @SubscribeMessage('join:delivery')
  async handleJoinDelivery(
    @ConnectedSocket() client: Socket,
    @MessageBody() deliveryId: string,
  ): Promise<{ joined: string } | { error: string }> {
    const userId = client.data.userId;
    if (!userId || !(await this.isAuthorizedForDelivery(userId, deliveryId))) {
      this.logger.warn(`Socket ${client.id} (userId=${userId}) denied join to delivery:${deliveryId} — not sender or assigned rider`);
      return { error: 'forbidden' };
    }
    client.join(`delivery:${deliveryId}`);
    this.logger.log(`Socket ${client.id} joined room delivery:${deliveryId}`);
    return { joined: deliveryId };
  }

  // ── rider:location ─────────────────────────────────────────────────────────
  // Relay rider GPS coordinates to all sockets in the specific delivery room.
  // NEVER uses this.server.emit() — that would broadcast to every connected
  // socket, leaking the rider's position to all senders (T-04-XX).

  @SubscribeMessage('rider:location')
  async handleRiderLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deliveryId: string; lat: number; lng: number },
  ): Promise<void> {
    const userId = client.data.userId;
    const order = await this.prisma.deliveryOrder.findFirst({ where: { id: data.deliveryId } });
    if (!order || !order.riderId) return;
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!rider || order.riderId !== rider.id) {
      this.logger.warn(`Socket ${client.id} (userId=${userId}) denied rider:location emit for delivery:${data.deliveryId} — not assigned rider`);
      return;
    }
    this.server.to(`delivery:${data.deliveryId}`).emit('rider:location', {
      lat: data.lat,
      lng: data.lng,
    });
  }

  // ── join:rider ─────────────────────────────────────────────────────────────
  // Rider socket joins its personal room rider:{riderId} so requestDelivery()
  // can target a specific rider via server.to('rider:'+nearestRiderId).emit.

  @SubscribeMessage('join:rider')
  handleJoinRider(
    @ConnectedSocket() client: Socket,
  ): { joined: string } | { error: string } {
    if (client.data.role !== 'DRIVER') {
      return { error: 'forbidden' };
    }
    client.join(`rider:${client.data.userId}`);
    this.logger.log(`Rider socket ${client.id} joined room rider:${client.data.userId}`);
    return { joined: `rider:${client.data.userId}` };
  }
}
