import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { KycService } from './kyc.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, KycService],
  exports: [UsersService, KycService],
})
export class UsersModule {}
