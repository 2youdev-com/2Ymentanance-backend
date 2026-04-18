/**
 * POST /api/upload/sign
 *
 * Returns a short-lived Cloudinary signed-upload signature so the mobile
 * client can upload media directly to Cloudinary without routing the binary
 * through the Vercel serverless function (which has a 4.5 MB body limit).
 *
 * The client:
 *   1. Calls this endpoint to get { timestamp, signature, cloud_name, api_key, folder }
 *   2. POSTs the file directly to https://api.cloudinary.com/v1_1/<cloud>/video/upload
 *      (or /image/upload) with those fields appended.
 *   3. Receives { secure_url } from Cloudinary.
 *   4. Sends that URL as videoUrl / audioUrl / extraPhotoUrls in the JSON body
 *      to POST /api/reports.
 */

import { Router, Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { env } from '../config/env';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key:    env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

const router = Router();
router.use(authenticate);

router.post(
  '/sign',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { folder = 'loc/problem-uploads', resource_type = 'video' } = req.body as {
      folder?: string;
      resource_type?: 'image' | 'video' | 'raw';
    };

    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign: Record<string, string | number> = { folder, timestamp };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      env.CLOUDINARY_API_SECRET,
    );

    res.json({
      success: true,
      data: {
        timestamp,
        signature,
        api_key:    env.CLOUDINARY_CLOUD_NAME ? env.CLOUDINARY_API_KEY : '',
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        folder,
        resource_type,
      },
    });
  }),
);

export default router;
