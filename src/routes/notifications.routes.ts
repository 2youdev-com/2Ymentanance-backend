import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { prisma } from '../config/database';
import { getIO } from '../utils/socket';
import { uploadToCloudinary } from '../middleware/upload';
import { upload } from '../middleware/upload';
import { Prisma } from '@prisma/client';

const router = Router();
router.use(authenticate);

// POST /api/notifications/quick-report
// Submit a quick problem report WITHOUT a maintenance log
// Solves the gap: technician sees a problem while passing by (no active maintenance)
router.post(
  '/quick-report',
  upload.fields([
    { name: 'photos', maxCount: 5 },
    { name: 'video',  maxCount: 1 },
    { name: 'audio',  maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const { assetId, category, severity, description } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!assetId || !category || !severity || !description) {
        res.status(400).json({ success: false, error: 'assetId, category, severity, description required' });
        return;
      }

      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
        include: { site: true },
      });
      if (!asset) {
        res.status(404).json({ success: false, error: 'Asset not found' });
        return;
      }

      // Auto-create a corrective maintenance log as container
      const autoLog = await prisma.maintenanceLog.create({
        data: {
          assetId,
          technicianId: req.user!.userId,
          type: 'CORRECTIVE',
          status: 'IN_PROGRESS',
        },
      });

      // Upload media
      let videoUrl: string | undefined;
      let audioUrl: string | undefined;
      const extraPhotoUrls: string[] = [];

      if (files?.video?.[0]) {
        videoUrl = await uploadToCloudinary(files.video[0].buffer, 'problem-videos', 'video');
      }
      if (files?.audio?.[0]) {
        audioUrl = await uploadToCloudinary(files.audio[0].buffer, 'problem-audio', 'video');
      }
      if (files?.photos) {
        for (const file of files.photos) {
          const url = await uploadToCloudinary(file.buffer, 'problem-photos', 'image');
          extraPhotoUrls.push(url);
        }
      }

      const newStatus =
        severity === 'CRITICAL' || severity === 'HIGH' ? 'OUT_OF_SERVICE' : 'NEEDS_MAINTENANCE';

      const report = await prisma.$transaction(async (tx) => {
        const created = await tx.problemReport.create({
          data: {
            logId: autoLog.id,
            assetId,
            category,
            severity,
            description,
            videoUrl,
            audioUrl,
            extraPhotos: {
              create: extraPhotoUrls.map((url) => ({ url })),
            },
          },
          include: { extraPhotos: true },
        });

        await tx.asset.update({
          where: { id: assetId },
          data: { status: newStatus },
        });

        return created;
      });

      getIO().to(`site:${asset.siteId}`).emit('activity', {
        type: 'PROBLEM_REPORTED',
        assetId: asset.id,
        assetName: asset.name,
        technicianName: req.user!.username,
        siteId: asset.siteId,
        timestamp: new Date(),
        details: `Quick report: ${category} - ${severity}`,
      });

      res.status(201).json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
