import { Controller, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post(':qr_hash/checkin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANISER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check in attendee by QR hash → VALID | ALREADY_USED | NOT_FOUND' })
  checkin(@Param('qr_hash') qrHash: string, @CurrentUser() user: any) {
    return this.eventsService.checkin(qrHash, user.userId);
  }
}
