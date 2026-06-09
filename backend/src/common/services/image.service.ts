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

  async resizeEventCover(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
    const optimized = await sharp(buffer)
      .resize(1200, 630, { fit: 'cover', position: 'centre' })
      .webp({ quality: 85 })
      .toBuffer();
    return { buffer: optimized, contentType: 'image/webp' };
  }

  /** Square 512×512 webp — for user avatars + vendor logos. */
  async resizeAvatar(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
    const optimized = await sharp(buffer)
      .resize(512, 512, { fit: 'cover', position: 'centre' })
      .webp({ quality: 88 })
      .toBuffer();
    return { buffer: optimized, contentType: 'image/webp' };
  }

  /** Square 1200×1200 webp — for product / listing images. */
  async resizeProduct(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
    const optimized = await sharp(buffer)
      .resize(1200, 1200, { fit: 'cover', position: 'centre' })
      .webp({ quality: 86 })
      .toBuffer();
    return { buffer: optimized, contentType: 'image/webp' };
  }

  validateImage(file: Express.Multer.File): void {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only jpg, png, or webp images are allowed');
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('Image must be under 5 MB');
    }
  }
}
