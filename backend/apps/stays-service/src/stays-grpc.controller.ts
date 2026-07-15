import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { stays } from '@iseyaa/proto';

@Controller()
export class StaysGrpcController {
  constructor(private readonly prisma: PrismaService) {}

  @GrpcMethod('StaysService', 'GetProperty')
  async getProperty(data: stays.GetPropertyRequest): Promise<stays.GetPropertyResponse> {
    const property = await this.prisma.property.findUnique({
      where: { id: data.propertyId },
      select: { id: true, name: true, pricePerNight: true, lgaId: true },
    });
    if (!property) return { id: '', name: '', pricePerNight: 0, lgaId: '' };
    return {
      id: property.id,
      name: property.name,
      pricePerNight: Number(property.pricePerNight ?? 0),
      lgaId: property.lgaId ?? '',
    };
  }

  @GrpcMethod('StaysService', 'CheckAvailability')
  async checkAvailability(data: stays.AvailabilityRequest): Promise<stays.AvailabilityResponse> {
    const conflict = await this.prisma.booking.findFirst({
      where: {
        propertyId: data.propertyId,
        status: { in: ['CONFIRMED', 'PENDING'] },
        deletedAt: null,
        OR: [
          { checkIn: { lte: new Date(data.checkOut) }, checkOut: { gte: new Date(data.checkIn) } },
        ],
      },
    });
    return { available: !conflict };
  }

  @GrpcMethod('StaysService', 'CreateBooking')
  async createBooking(data: stays.CreateBookingRequest): Promise<stays.CreateBookingResponse> {
    const booking = await this.prisma.booking.findFirst({
      where: { propertyId: data.propertyId, userId: data.userId, status: 'PENDING' },
    });
    if (booking) return { success: true, bookingId: booking.id };
    return { success: false, bookingId: '' };
  }
}
