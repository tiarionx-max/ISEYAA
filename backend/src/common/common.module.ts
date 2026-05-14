import { Global, Module } from '@nestjs/common';
import { PaystackService } from './services/paystack.service';
import { S3Service } from './services/s3.service';
import { SendgridService } from './services/sendgrid.service';
import { QrService } from './services/qr.service';
import { ImageService } from './services/image.service';

@Global()
@Module({
  providers: [PaystackService, S3Service, SendgridService, QrService, ImageService],
  exports: [PaystackService, S3Service, SendgridService, QrService, ImageService],
})
export class CommonModule {}
