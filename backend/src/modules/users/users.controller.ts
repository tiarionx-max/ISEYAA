import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
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
  constructor(private readonly usersService: UsersService) {}

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

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
