import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { MarketplaceService } from './marketplace.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to become a vendor — creates a PENDING application for admin approval; does not itself require the VENDOR role, since that role is only granted once an admin approves' })
  create(@CurrentUser() user: any, @Body() dto: CreateVendorDto) {
    return this.marketplaceService.createVendor(user.userId, dto);
  }
}

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get()
  @ApiOperation({ summary: 'List active products' })
  findAll(
    @Query('vendorId') vendorId?: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('featured') featured?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit?: number,
  ) {
    return this.marketplaceService.findProducts({
      vendorId, q, category,
      featured: featured === 'true',
      page, limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  findOne(@Param('id') id: string) {
    return this.marketplaceService.findProductById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product (approved VENDOR only)' })
  create(@CurrentUser() user: any, @Body() dto: CreateProductDto) {
    return this.marketplaceService.createProduct(user.userId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product (own vendor only)' })
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateProductDto) {
    return this.marketplaceService.updateProduct(id, user.userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product (own vendor only)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.marketplaceService.removeProduct(id, user.userId);
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload product image (jpg/png/webp <=5 MB, resized to 1200x1200)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadImage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.marketplaceService.uploadImage(id, user.userId, file);
  }
}

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the current user’s orders with items and product data' })
  findMyOrders(@CurrentUser() user: any) {
    return this.marketplaceService.findMyOrders(user.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Place an order — fee split from platform_config, initiates Paystack' })
  create(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    return this.marketplaceService.createOrder(user.userId, dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update order status (vendor — PROCESSING→SHIPPED→DELIVERED)' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('status') status: string,
  ) {
    return this.marketplaceService.updateOrderStatus(id, status, user.userId);
  }
}

@ApiTags('admin')
@Controller('admin/vendors')
export class AdminVendorsController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LGA_ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve vendor (LGA_ADMIN or SUPER_ADMIN)' })
  approve(@Param('id') id: string) {
    return this.marketplaceService.approveVendor(id);
  }
}
