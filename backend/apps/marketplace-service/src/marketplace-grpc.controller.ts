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
    const product = await this.prisma.product.findUnique({ where: { id: data.productId } });
    if (!product || (product.stock ?? 0) < data.quantity) {
      return { success: false, reservedQuantity: 0 };
    }
    await this.prisma.product.update({
      where: { id: data.productId },
      data: { stock: { decrement: data.quantity } },
    });
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
