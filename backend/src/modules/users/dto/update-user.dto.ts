import { IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Security note: this MUST remain a class-validator DTO (not an inline TS object
 * literal type). NestJS's global ValidationPipe (whitelist: true,
 * forbidNonWhitelisted: true) only strips/rejects unknown properties when the
 * @Body() parameter's metatype is a decorated class — an inline object type
 * compiles to `Object` design metadata, which ValidationPipe explicitly skips
 * (see toValidate() in @nestjs/common), letting any JSON body field pass through
 * untouched. Using a plain object type here previously allowed a client to PATCH
 * /users/me with arbitrary fields (e.g. { role: 'SUPER_ADMIN' }, { status: 'ACTIVE' },
 * { ndpaConsent: true }) which were passed as-is into prisma.user.update({ data }) —
 * a mass-assignment privilege-escalation vulnerability.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsUUID()
  lgaId?: string;
}
