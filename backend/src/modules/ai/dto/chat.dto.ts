import { IsArray, IsString, IsOptional, ValidateNested, IsEnum, MaxLength, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class MessageDto {
  @IsEnum(['user', 'assistant'], { message: "role must be 'user' or 'assistant'" })
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class ChatDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  messages!: MessageDto[];

  @IsString()
  @IsOptional()
  conversationId?: string;
}
