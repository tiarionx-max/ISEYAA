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

  constructor(private jwtService: JwtService) {}

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
  handleJoinTrip(
    @ConnectedSocket() client: Socket,
    @MessageBody() tripId: string,
  ): { joined: string } {
    client.join(`trip:${tripId}`);
    this.logger.log(`Socket ${client.id} joined room trip:${tripId}`);
    return { joined: tripId };
  }

  // ── driver:location ────────────────────────────────────────────────────────
  // Relay driver GPS coordinates to all sockets in the specific trip room.
  // NEVER uses this.server.emit() — that would broadcast to every connected
  // socket, leaking the driver's position to all riders (T-03-20).

  @SubscribeMessage('driver:location')
  handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string; lat: number; lng: number },
  ): void {
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
