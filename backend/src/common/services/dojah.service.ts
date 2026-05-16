import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface NinVerificationResult {
  verified: boolean;
  name: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
}

@Injectable()
export class DojahService {
  private readonly logger = new Logger(DojahService.name);
  private readonly apiKey: string | undefined;
  private readonly appId: string | undefined;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('DOJAH_API_KEY');
    this.appId = this.config.get<string>('DOJAH_APP_ID');

    if (!this.apiKey || !this.appId) {
      this.logger.warn(
        '[DOJAH STUB] NIN verification stub mode active — set DOJAH_API_KEY + DOJAH_APP_ID to enable live NIN verification',
      );
    }
  }

  async verifyNin(nin: string): Promise<NinVerificationResult> {
    if (!this.apiKey || !this.appId) {
      this.logger.warn('[DOJAH STUB] NIN verification stub mode (no DOJAH_API_KEY) — returning verified:true');
      return { verified: true, name: 'Stub User' };
    }

    try {
      const response = await axios.get('https://api.dojah.io/api/v1/kyc/nin', {
        params: { nin },
        headers: {
          AppId: this.appId,
          Authorization: this.apiKey,
        },
      });

      const entity = response.data?.entity ?? {};
      const firstName: string = entity.first_name ?? '';
      const lastName: string = entity.last_name ?? '';
      const name = `${firstName} ${lastName}`.trim() || 'Unknown';

      return {
        verified: true,
        name,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        dob: entity.date_of_birth ?? undefined,
      };
    } catch (err: any) {
      // Never log the NIN value — only log the error response
      this.logger.error('Dojah NIN failed', err?.response?.data ?? err.message);
      throw new BadRequestException('NIN verification failed');
    }
  }
}
