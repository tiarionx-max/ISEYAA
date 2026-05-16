import { Global, Module } from '@nestjs/common';
import { DojahService } from './services/dojah.service';
import { EncryptionService } from './services/encryption.service';
import { ImageService } from './services/image.service';
import { PaystackService } from './services/paystack.service';
import { QrService } from './services/qr.service';
import { S3Service } from './services/s3.service';
import { SendgridService } from './services/sendgrid.service';
import { VectorService } from './services/vector.service';

@Global()
@Module({
  providers: [
    DojahService,
    EncryptionService,
    ImageService,
    PaystackService,
    QrService,
    S3Service,
    SendgridService,
    VectorService,
  ],
  exports: [
    DojahService,
    EncryptionService,
    ImageService,
    PaystackService,
    QrService,
    S3Service,
    SendgridService,
    VectorService,
  ],
})
export class CommonModule {}
