import { Global, Module } from '@nestjs/common';
import { SettlementController } from './controllers/settlement.controller';
import { UploadController } from './controllers/upload.controller';
import { CsvExportService } from './services/csv-export.service';
import { DbMetricsService } from './services/db-metrics.service';
import { DojahService } from './services/dojah.service';
import { EncryptionService } from './services/encryption.service';
import { ImageService } from './services/image.service';
import { ItineraryPdfService } from './services/itinerary-pdf.service';
import { MinistryPdfService } from './services/ministry-pdf.service';
import { PaystackService } from './services/paystack.service';
import { QrService } from './services/qr.service';
import { ReferenceService } from './services/reference.service';
import { RefundService } from './services/refund.service';
import { S3Service } from './services/s3.service';
import { SendgridService } from './services/sendgrid.service';
import { SettlementService } from './services/settlement.service';
import { UploadService } from './services/upload.service';
import { VectorService } from './services/vector.service';
import { VisitorLogService } from './services/visitor-log.service';

@Global()
@Module({
  controllers: [SettlementController, UploadController],
  providers: [
    CsvExportService,
    DbMetricsService,
    DojahService,
    EncryptionService,
    ImageService,
    ItineraryPdfService,
    MinistryPdfService,
    PaystackService,
    QrService,
    ReferenceService,
    RefundService,
    S3Service,
    SendgridService,
    SettlementService,
    UploadService,
    VectorService,
    VisitorLogService,
  ],
  exports: [
    CsvExportService,
    DbMetricsService,
    DojahService,
    EncryptionService,
    ImageService,
    ItineraryPdfService,
    MinistryPdfService,
    PaystackService,
    QrService,
    ReferenceService,
    RefundService,
    S3Service,
    SendgridService,
    SettlementService,
    UploadService,
    VectorService,
    VisitorLogService,
  ],
})
export class CommonModule {}
