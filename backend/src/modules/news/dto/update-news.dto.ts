import { PartialType } from '@nestjs/swagger';
import { CreateNewsDto } from './create-news.dto';

/** All fields optional — PATCH semantics (only supplied fields are updated). */
export class UpdateNewsDto extends PartialType(CreateNewsDto) {}
