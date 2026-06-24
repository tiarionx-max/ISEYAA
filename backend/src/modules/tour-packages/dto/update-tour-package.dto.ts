import { PartialType } from '@nestjs/swagger';
import { CreateTourPackageDto } from './create-tour-package.dto';

/**
 * Partial — all fields optional. Service rejects edits to APPROVED packages
 * (clone-to-edit deferred; see 09-04 plan §Edit lifecycle).
 */
export class UpdateTourPackageDto extends PartialType(CreateTourPackageDto) {}
