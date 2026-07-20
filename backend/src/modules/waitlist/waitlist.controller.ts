import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { WaitlistClientService } from '../waitlist-client/waitlist-client.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';

@ApiTags('waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistClientService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a waitlist (marketplace, etc.)' })
  join(@Body() dto: JoinWaitlistDto) {
    return this.waitlist.join(dto);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.STATE_ADMIN)
  @ApiOperation({ summary: 'Get waitlist counts per source (admin)' })
  stats() {
    return this.waitlist.stats();
  }
}
