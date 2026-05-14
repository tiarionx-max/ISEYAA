import { Module } from '@nestjs/common';
import {
  VendorsController,
  ProductsController,
  OrdersController,
  AdminVendorsController,
} from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

@Module({
  controllers: [VendorsController, ProductsController, OrdersController, AdminVendorsController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
