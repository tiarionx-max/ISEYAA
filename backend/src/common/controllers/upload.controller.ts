import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { CreatePresignedUploadDto } from '../dto/create-presigned-upload.dto';
import { PresignedUploadResult, UploadService } from '../services/upload.service';

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadController {
  constructor(private uploads: UploadService) {}

  /**
   * POST /api/v1/uploads/presigned
   *
   * Issues a short-lived (15-min) presigned PUT URL the client uses to upload directly to
   * S3/R2. The two-step flow downstream consumers must use:
   *   1. POST here with `{ keyPrefix, contentType, maxBytes? }` → receive `{ uploadUrl, publicUrl, ... }`
   *   2. PUT the file bytes to `uploadUrl` with `Content-Type: <same contentType>`
   *   3. POST the resulting `publicUrl` back to the resource-create endpoint
   *      (e.g. `PATCH /tour-guides` with `certifications: [publicUrl]`).
   */
  @Post('presigned')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate a short-lived presigned PUT URL for direct-to-S3 upload' })
  async createPresignedUploadUrl(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreatePresignedUploadDto,
  ): Promise<PresignedUploadResult> {
    return this.uploads.createPresignedUploadUrl({ ...dto, userId: user.userId });
  }
}
