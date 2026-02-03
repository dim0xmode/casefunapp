import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { AppError } from '../middleware/errorHandler.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_DIMENSION = 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const ensureUploadDir = () => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
};

export const saveImage = async (file: Express.Multer.File, prefix: string) => {
  if (!file) {
    throw new AppError('Image file is required', 400);
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new AppError('Unsupported image type', 400);
  }

  const metadata = await sharp(file.buffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new AppError('Invalid image file', 400);
  }

  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.webp`;
  const outputPath = path.join(UPLOAD_DIR, filename);

  ensureUploadDir();

  await sharp(file.buffer)
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 90 })
    .toFile(outputPath);

  return `/uploads/${filename}`;
};
