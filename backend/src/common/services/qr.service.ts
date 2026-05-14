import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrService {
  async generatePng(data: string): Promise<Buffer> {
    return QRCode.toBuffer(data, { type: 'png', width: 400, margin: 2 });
  }
}
