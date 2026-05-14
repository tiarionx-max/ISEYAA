import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadContentDto {
  @ApiPropertyOptional({ example: 'My Track' }) @IsString() @IsOptional() title?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
}
