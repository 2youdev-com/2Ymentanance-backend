// src/middleware/upload.ts
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();

// انواع الملفات المسموح بيها
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'application/zip',              // ZIP رسمي
  'application/x-zip-compressed', // ZIP من WinRAR أو بعض الانظمة
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Excel حديث
  'application/vnd.ms-excel',    // Excel قديم
];

const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.error(`[2Ymentanance Error] File type ${file.mimetype} not allowed`);
    cb(new Error(`File type ${file.mimetype} not allowed`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
});

export const uploadToCloudinary = async (
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `loc/${folder}`,
          resource_type: resourceType,
          sign_url: true,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result!.secure_url);
        }
      )
      .end(buffer);
  });
};