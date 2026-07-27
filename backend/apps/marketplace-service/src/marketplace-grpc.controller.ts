import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { marketplace } from '@iseyaa/proto';

@Controller()
export class MarketplaceGrpcController {
  constructor(private readonly prisma: PrismaService) {}

  @GrpcMethod('MarketplaceService', 'GetProduct')
  async getProduct(data: marketplace.GetProductRequest): Promise<marketplace.GetProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: data.productId },
      select: { id: true, name: true, price: true, stock: true },
    });
    if (!product) return { id: '', name: '', price: 0, stock: 0 };
    return {
      id: product.id,
      name: product.name,
      price: Number(product.price ?? 0),
      stock: product.stock ?? 0,
    };
  }

  @GrpcMethod('MarketplaceService', 'ReserveStock')
  async reserveStock(data: marketplace.ReserveStockRequest): Promise<marketplace.ReserveStockResponse> {
    // Atomic conditional decrement: the stock >= quantity floor check and the
    // decrement happen in a single UPDATE ... WHERE statement, so concurrent
    // reservations for the same product serialize on the row lock instead of
    // both reading the same stale stock value and overselling below zero.
    // Also excludes deactivated/soft-deleted products, matching
    // marketplace.service.ts's createOrder filter.
    const result = await this.prisma.product.updateMany({
      where: {
        id: data.productId,
        deletedAt: null,
        isActive: true,
        stock: { gte: data.quantity },
      },
      data: { stock: { decrement: data.quantity } },
    });

    if (result.count === 0) {
      return { success: false, reservedQuantity: 0 };
    }
    return { success: true, reservedQuantity: data.quantity };
  }

  @GrpcMethod('MarketplaceService', 'ConfirmOrder')
  async confirmOrder(data: marketplace.ConfirmOrderRequest): Promise<marketplace.ConfirmOrderResponse> {
    const order = await this.prisma.order.findUnique({ where: { id: data.orderId } });
    if (!order) return { success: false };
    await this.prisma.order.update({
      where: { id: data.orderId },
      data: { status: 'PROCESSING', paystackRef: data.reference },
    });
    return { success: true };
  }
}
