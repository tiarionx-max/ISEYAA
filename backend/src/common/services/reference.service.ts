import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

/**
 * The 7 known ISY reference prefixes per CLAUDE.md naming convention.
 * Each prefix maps to a domain:
 *   FUND — wallet top-up
 *   TKT  — event ticket purchase
 *   STY  — stay booking
 *   ORD  — marketplace order
 *   ESC  — escrow release (8-char tail, use `generateEscrow`)
 *   SBO  — studio booking
 *   TOUR — tour package booking (Phase 9)
 */
export type ReferencePrefix = 'FUND' | 'TKT' | 'STY' | 'ORD' | 'ESC' | 'SBO' | 'TOUR';

@Injectable()
export class ReferenceService {
  /**
   * Standard 12-char reference: `ISY-${prefix}-${12-char uppercase hex}`.
   * Use this for all prefixes EXCEPT ESC (which uses 8-char — see `generateEscrow`).
   */
  generate(prefix: ReferencePrefix): string {
    const tail = uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
    return `ISY-${prefix}-${tail}`;
  }

  /**
   * Escrow uses 8-char per CLAUDE.md naming convention (`ISY-ESC-<8char>`).
   */
  generateEscrow(): string {
    const tail = uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
    return `ISY-ESC-${tail}`;
  }
}
