import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  OnModuleInit,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { KafkaService } from '../../kafka/kafka.service';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackService } from '../../common/services/paystack.service';
import { SendgridService } from '../../common/services/sendgrid.service';
import { SettlementService } from '../../common/services/settlement.service';
import { ImageService } from '../../common/services/image.service';
import { S3Service } from '../../common/services/s3.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateOrderDto } from './dto/create-order.dto';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

@Injectable()
export class MarketplaceService implements OnModuleInit {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private sendgrid: SendgridService,
    private kafka: KafkaService,
    private settlementService: SettlementService,
    private imageService: ImageService,
    private s3: S3Service,
  ) {}

  async onModuleInit() {
    await this.kafka.consume(
      'payment.order_payment',
      'marketplace-service-prod',
      (msg) => this.handleOrderPayment(msg as { reference: string }),
    );
  }

  // ── Vendors ────────────────────────────────────────────────────────────────

  async createVendor(userId: string, dto: CreateVendorDto) {
    const existing = await this.prisma.vendor.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Vendor profile already exists');

    const slug = `${slugify(dto.businessName)}-${uuidv4().slice(0, 8)}`;
    return this.prisma.vendor.create({
      data: {
        userId,
        lgaId: dto.lgaId,
        businessName: dto.businessName,
        slug,
        description: dto.description,
        status: 'PENDING',
      },
    });
  }

  async findMyVendor(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('No vendor profile found');
    return vendor;
  }

  async approveVendor(id: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id, deletedAt: null } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.status === 'ACTIVE') throw new ConflictException('Vendor already active');

    // Approval is the actual gate on vendor capabilities (e.g. POST /products
    // requires the VENDOR role) — grant it here, mirroring UsersService.becomeHost.
    // Without this, an approved vendor's own role never changes and they remain
    // unable to create products despite their application being accepted.
    const user = await this.prisma.user.findUnique({
      where: { id: vendor.userId },
      select: { registeredRoles: true },
    });
    if (user) {
      await this.prisma.user.update({
        where: { id: vendor.userId },
        data: {
          registeredRoles: user.registeredRoles.includes('VENDOR' as any)
            ? user.registeredRoles
            : { set: [...user.registeredRoles, 'VENDOR' as any] },
          role: 'VENDOR' as any,
        },
      });
    }

    return this.prisma.vendor.update({ where: { id }, data: { status: 'ACTIVE' } });
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async createProduct(userId: string, dto: CreateProductDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    if (vendor.status !== 'ACTIVE') throw new ForbiddenException('Vendor account is not yet approved');

    const slug = `${slugify(dto.name)}-${uuidv4().slice(0, 8)}`;
    return this.prisma.product.create({
      data: {
        vendorId: vendor.id,
        name: dto.name,
        slug,
        description: dto.description,
        price: dto.price,
        stock: dto.stock,
        category: dto.category,
        compareAtPrice: dto.compareAtPrice,
        ...(dto.imageUrls && { imageUrls: dto.imageUrls }),
      },
    });
  }

  findProducts(filters: { vendorId?: string; q?: string; category?: string; featured?: boolean; page?: number; limit?: number }) {
    const { vendorId, q, category, featured, page = 1, limit = 24 } = filters;
    return this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(vendorId && { vendorId }),
        ...(q && { name: { contains: q, mode: 'insensitive' } }),
        ...(category && { category }),
        ...(featured && { isFeatured: true }),
      },
      include: { vendor: { select: { businessName: true, slug: true, lga: { select: { name: true } } } } },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findMyProducts(vendorId: string) {
    return this.prisma.product.findMany({
      where: { vendorId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findProductById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { vendor: { select: { businessName: true, slug: true, lga: { select: { name: true } } } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProduct(id: string, userId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found');

    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor || product.vendorId !== vendor.id) throw new ForbiddenException('Not your product');

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.stock !== undefined && { stock: dto.stock }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.compareAtPrice !== undefined && { compareAtPrice: dto.compareAtPrice }),
        ...(dto.imageUrls !== undefined && { imageUrls: dto.imageUrls }),
      },
    });
  }

  async uploadImage(id: string, userId: string, file: Express.Multer.File) {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found');

    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor || product.vendorId !== vendor.id) throw new ForbiddenException('Not your product');

    this.imageService.validateImage(file);
    const { buffer: resized, contentType } = await this.imageService.resizeProduct(file.buffer);
    const key = `products/${id}/${uuidv4()}.webp`;
    const url = await this.s3.upload(key, resized, contentType);

    await this.prisma.product.update({
      where: { id },
      data: { imageUrls: { push: url } },
    });

    return { url };
  }

  async removeProduct(id: string, userId: string) {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found');

    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor || product.vendorId !== vendor.id) throw new ForbiddenException('Not your product');

    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    return { deleted: true };
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async findMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId, deletedAt: null },
      include: {
        orderItems: { include: { product: { include: { vendor: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findVendorOrders(vendorId: string) {
    return this.prisma.order.findMany({
      where: { vendorId, deletedAt: null },
      include: { orderItems: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    if (!dto.items?.length) throw new BadRequestException('Order must have at least one item');

    // Validate and enrich items
    const products = await Promise.all(
      dto.items.map((i) =>
        this.prisma.product.findFirst({
          where: { id: i.productId, deletedAt: null, isActive: true },
          include: { vendor: true },
        }),
      ),
    );

    for (let i = 0; i < products.length; i++) {
      if (!products[i]) throw new NotFoundException(`Product ${dto.items[i].productId} not found`);
    }

    // Aggregate requested quantity per productId before checking stock — a DTO
    // with duplicate productId line items must not be checked against the same
    // stale stock figure independently per line, or the combined quantity can
    // exceed real stock while each individual check passes.
    const requestedQtyByProductId = new Map<string, number>();
    for (const item of dto.items) {
      requestedQtyByProductId.set(item.productId, (requestedQtyByProductId.get(item.productId) ?? 0) + item.quantity);
    }
    for (const product of products) {
      const requestedQty = requestedQtyByProductId.get(product.id) ?? 0;
      if (product.stock < requestedQty) {
        throw new BadRequestException(`Insufficient stock for product: ${product.name}`);
      }
    }

    // All items must belong to same vendor
    const vendorIds = [...new Set(products.map((p) => p.vendorId))];
    if (vendorIds.length > 1) throw new BadRequestException('All products must be from the same vendor');

    const vendor = products[0].vendor;
    if (vendor.status !== 'ACTIVE') throw new BadRequestException('Vendor is not active');

    // D-02: the per-vendor `Vendor.govtLevyPct` override is NOT absorbed into the
    // centralized resolver — it continues to be read directly from the Vendor row;
    // only the module-level platform fee routes through resolveSplit().
    const govtLevyPct = Number(vendor.govtLevyPct);

    const orderItems = dto.items.map((item, idx) => {
      const unitPrice = Number(products[idx].price);
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
      };
    });

    const total = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
    // Centralized split resolution (SETTLE-11b) — module-level platform fee only.
    const { platformPct } = await this.settlementService.resolveSplit('marketplace', total);
    const platformFeePct = platformPct ?? 0;
    const platformFee = +(total * platformFeePct).toFixed(2);
    const govtLevy = +(total * govtLevyPct).toFixed(2);
    const vendorPayout = +(total - platformFee - govtLevy).toFixed(2);
    const paystackRef = `ISY-ORD-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    const order = await this.prisma.order.create({
      data: {
        userId,
        vendorId: vendor.id,
        totalAmount: total,
        platformFee,
        govtLevy,
        vendorPayout,
        paystackRef,
        status: 'PENDING',
        metadata: {
          vendorName: vendor.businessName,
          ...(dto.deliveryAddress && { deliveryAddress: dto.deliveryAddress as any }),
        },
        orderItems: { create: orderItems },
      },
      include: { orderItems: { include: { product: { select: { name: true } } } } },
    });

    let payment;
    try {
      payment = await this.paystack.initiatePayment({
        email: dto.email,
        amountKobo: total * 100,
        reference: paystackRef,
        metadata: {
          type: 'order_payment',
          orderId: order.id,
          userId,
          vendorId: vendor.id,
        },
      });
    } catch (err) {
      // Paystack failed (missing key, network, etc.) — roll back the order
      // (and its line items, since OrderItem has no cascade) so the PENDING
      // row doesn't linger and so stock decrement triggers don't fire later.
      await this.prisma
        .$transaction([
          this.prisma.orderItem.deleteMany({ where: { orderId: order.id } }),
          this.prisma.order.delete({ where: { id: order.id } }),
        ])
        .catch(() => {});
      this.logger.error(`Paystack init failed for order ${order.id}, rolled back`, err);
      throw new ServiceUnavailableException('Payment gateway is currently unavailable. Please try again shortly.');
    }

    return { order, payment };
  }

  @OnEvent('payment.order_payment')
  async handleOrderPayment(payload: { reference: string }) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { paystackRef: payload.reference },
        include: {
          user: { select: { email: true, firstName: true } },
          orderItems: { include: { product: { select: { name: true } } } },
          vendor: { select: { userId: true } },
        },
      });

      if (!order || order.status !== 'PENDING') return;

      // Vendor wallet resolved via the Order→Vendor relation (optional; null for vendorless orders).
      const vendorWallet = order.vendor
        ? await this.prisma.wallet.findUnique({ where: { userId: order.vendor.userId } })
        : null;
      const ministryWallet = await this.settlementService.resolveMinistryWallet();
      const buyerWallet = await this.prisma.wallet.findUnique({ where: { userId: order.userId } });

      const settlementResult = await this.settlementService.settle({
        module: 'marketplace',
        reference: payload.reference,
        gateway: 'PAYSTACK',
        amountKobo: Math.round(Number(order.totalAmount) * 100), // WR-03: avoid IEEE-754 float drift crossing into SettlementService
        recipients: [
          {
            tag: 'VENDOR',
            refSuffix: 'VENDOR',
            walletId: vendorWallet?.id ?? null,
            amountNgn: Number(order.vendorPayout),
            metadata: { vendorId: order.vendorId, orderId: order.id },
          },
          {
            tag: 'MINISTRY',
            refSuffix: 'MINISTRY',
            walletId: ministryWallet?.id ?? null,
            amountNgn: Number(order.govtLevy),
            metadata: { orderId: order.id },
          },
        ],
        buyerWalletId: buyerWallet?.id,
        description: 'Marketplace order commission',
        platformMetadata: { orderId: order.id },
        onSettled: async (tx) => {
          await tx.order.update({ where: { id: order.id }, data: { status: 'PROCESSING' } });
          for (const item of order.orderItems) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } },
            });
          }
        },
        onFailure: async (err) => {
          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              status: 'CANCELLED',
              metadata: { ...((order.metadata as any) ?? {}), settlementError: err.message },
            },
          });
        },
      });

      // Only notify on a genuine first-time settlement — a REPLAYED result means a
      // duplicate webhook delivery already settled this order, and re-notifying here
      // would send the buyer/vendor duplicate order-update messages (WR-04).
      if (settlementResult.status === 'SETTLED') {
        await this.notifyOrderUpdate(order.id, 'PROCESSING');
      }
    } catch (err) {
      this.logger.error(`handleOrderPayment failed for ref ${payload.reference}`, err.message);
    }
  }

  async updateOrderStatus(orderId: string, status: string, actorId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Vendors can move: PROCESSING → SHIPPED; anyone authorized can move to DELIVERED
    const vendor = await this.prisma.vendor.findUnique({ where: { userId: actorId } });
    const isOrderVendor = vendor && order.vendorId === vendor.id;
    const allowedTransitions: Record<string, string[]> = {
      PROCESSING: ['SHIPPED'],
      SHIPPED: ['DELIVERED'],
    };

    if (!isOrderVendor) throw new ForbiddenException('Not authorized to update this order');
    if (!allowedTransitions[order.status]?.includes(status)) {
      throw new BadRequestException(`Cannot transition order from ${order.status} to ${status}`);
    }

    await this.prisma.order.update({ where: { id: orderId }, data: { status: status as any } });
    await this.notifyOrderUpdate(orderId, status);

    return { orderId, status };
  }

  private async notifyOrderUpdate(orderId: string, status: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { email: true, firstName: true } },
        orderItems: { include: { product: { select: { name: true } } } },
      },
    });
    if (!order) return;

    const itemSummary = order.orderItems.map((i) => `${i.product.name} × ${i.quantity}`).join(', ');
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a472a;">Order Update</h2>
        <p>Hello ${order.user.firstName},</p>
        <p>Your order status has changed to <strong>${status}</strong>.</p>
        <p><strong>Items:</strong> ${itemSummary}</p>
        <p><strong>Total:</strong> ₦${Number(order.totalAmount).toLocaleString()}</p>
        <p style="color:#666;font-size:12px;margin-top:24px;">Powered by Iṣẹ́yáá — Ogun State Digital Platform</p>
      </div>
    `;

    if (order.user.email) {
      await this.sendgrid.sendEmail(order.user.email, `Order ${status} — Iṣẹ́yáá`, html);
    }

    if (order.vendorId) {
      const vendorUser = await this.prisma.vendor.findUnique({
        where: { id: order.vendorId },
        include: { lga: false },
      });
      if (vendorUser) {
        const vendorOwner = await this.prisma.user.findUnique({
          where: { id: vendorUser.userId },
          select: { email: true, firstName: true },
        });
        if (vendorOwner?.email) {
          const vendorHtml = html.replace(`Hello ${order.user.firstName}`, `Hello ${vendorOwner.firstName}`);
          await this.sendgrid.sendEmail(vendorOwner.email, `Order ${status} — Iṣẹ́yáá`, vendorHtml);
        }
      }
    }
  }
}
