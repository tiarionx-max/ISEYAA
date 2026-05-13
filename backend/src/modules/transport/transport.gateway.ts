// STUB — replaced by Plan 05 with the full WebSocket implementation.
// Methods are implemented minimally here to keep the gateway spec compilable;
// Plan 05 will overwrite this file with the real @WebSocketGateway class.

import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class TransportGateway {
  server: any;

  private readonly logger = new Logger(TransportGateway.name);

  constructor(private jwtService: JwtService) {}

  handleConnection(client: any): void {
    const token = client.handshake?.auth?.token;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.data.role = payload.role;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: any): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  handleJoinTrip(client: any, tripId: string): { joined: string } {
    client.join(`trip:${tripId}`);
    return { joined: tripId };
  }

  handleDriverLocation(client: any, data: { tripId: string; lat: number; lng: number }): void {
    this.server.to(`trip:${data.tripId}`).emit('driver:location', { lat: data.lat, lng: data.lng });
  }
}
