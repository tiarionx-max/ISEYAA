import { Injectable, BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

@Injectable()
export class ImageService {
  validateEventImage(file: Express.Multer.File): void {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only jpg, png, or webp images are allowed');
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('Image must be under 5 MB');
    }
  }

  async resizeEventCover(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize(1200, 630, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85 })
      .toBuffer();
  }
}
