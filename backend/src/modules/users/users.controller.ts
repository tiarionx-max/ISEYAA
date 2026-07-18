import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { S3Service } from '../../common/services/s3.service';
import { ImageService } from '../../common/services/image.service';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from './users.service';
import { KycService } from './kyc.service';
import { VerifyBvnDto } from './dto/verify-bvn.dto';
import { VerifyNinDto } from './dto/verify-nin.dto';
import { ChangeOtpChannelDto } from './dto/change-otp-channel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { IsEnum } from 'class-validator';

class SwitchRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly kycService: KycService,
    private readonly s3: S3Service,
    private readonly imageService: ImageService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: { userId: string }) {
    return this.usersService.getMe(user.userId);
  }

  @Get('me/bookmarks')
  @ApiOperation({ summary: 'Get saved attractions (offline-cacheable)' })
  getBookmarks(@CurrentUser() user: { userId: string }) {
    return this.usersService.getBookmarks(user.userId);
  }

  @Patch('me/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch active role' })
  switchRole(@CurrentUser() user: { userId: string }, @Body() dto: SwitchRoleDto) {
    return this.usersService.switchRole(user.userId, dto.role);
  }

  @Patch('me/otp-channel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change OTP delivery channel preference' })
  changeOtpChannel(@CurrentUser() user: { userId: string }, @Body() dto: ChangeOtpChannelDto) {
    return this.usersService.updateOtpChannel(user.userId, dto.channel);
  }

  @Post('me/become-host')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Promote current user to HOST and add HOST to registeredRoles' })
  becomeHost(@CurrentUser() user: { userId: string }) {
    return this.usersService.becomeHost(user.userId);
  }

  @Post('me/become-guide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Promote current user to TOUR_GUIDE and create an empty TourGuide profile' })
  becomeGuide(@CurrentUser() user: { userId: string }) {
    return this.usersService.becomeGuide(user.userId);
  }

  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload avatar (jpg/png/webp ≤5 MB, resized to 512×512 webp, stored on S3)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async uploadAvatar(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.imageService.validateImage(file);
    const { buffer, contentType } = await this.imageService.resizeAvatar(file.buffer);
    const key = `avatars/${user.userId}/${uuidv4()}.webp`;
    const avatarUrl = await this.s3.upload(key, buffer, contentType);
    await this.usersService.update(user.userId, { avatarUrl });
    return { avatarUrl };
  }

  @Delete('me/data')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'NDPA right-to-erasure: anonymize personal data' })
  eraseData(@CurrentUser() user: { userId: string }) {
    return this.usersService.eraseData(user.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(
    @CurrentUser() user: { userId: string },
    @Body() body: { firstName?: string; lastName?: string; avatarUrl?: string; lgaId?: string },
  ) {
    return this.usersService.update(user.userId, body);
  }

  // ── KYC endpoints (must appear before /:id to avoid capture) ──────────────

  @Post('kyc/bvn')
  @ApiOperation({ summary: 'Verify BVN (tier 1) — raises wallet daily limit to ₦200,000' })
  verifyBvn(@CurrentUser() user: { userId: string }, @Body() dto: VerifyBvnDto) {
    return this.kycService.verifyBvn(user.userId, dto.bvn);
  }

  @Post('kyc/nin')
  @ApiOperation({ summary: 'Verify NIN (tier 2) — raises wallet daily limit to ₦1,000,000' })
  verifyNin(@CurrentUser() user: { userId: string }, @Body() dto: VerifyNinDto) {
    return this.kycService.verifyNin(user.userId, dto.nin);
  }

  @Post('kyc/smile/complete')
  @ApiOperation({ summary: 'Mark Smile Identity liveness complete (tier 3) — raises limit to ₦5,000,000' })
  completeLiveness(@CurrentUser() user: { userId: string }) {
    return this.kycService.completeLiveness(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
