import { IsString, IsNotEmpty, IsOptional, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVendorDto {
  @ApiProperty() @IsUUID() lgaId: string;

  @ApiProperty({ example: 'Abeokuta Crafts Co.' })
  @IsString() @IsNotEmpty() @MinLength(2) businessName: string;

  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
}
