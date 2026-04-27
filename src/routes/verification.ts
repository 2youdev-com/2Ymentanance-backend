// src/routes/verification.ts
//
// POST /api/verification/face-liveness-actions
//   → Returns 3 random liveness actions for the current session
//
// POST /api/verification/technician
//   → Verifies technician identity from selfie video frames
//   Body: { logId, frames: string[], requestedActions: string[] }
//
// POST /api/verification/asset
//   → Verifies asset from asset video frames
//   Body: { logId, assetId, frames: string[] }
//      OR { logId, assetId, videoUrl: string }   (Cloudinary URL)

import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { FaceVerificationService } from '../services/verification/FaceVerificationService';
import { AssetVerificationService } from '../services/verification/AssetVerificationService';
import { extractFramesFromUrl } from '../lib/videoFrameExtractor';
import { authenticate } from '../middleware/auth'; // existing middleware
import { getIO } from '../utils/socket';

const router = Router();
const faceService = FaceVerificationService.getInstance();
const assetService = AssetVerificationService.getInstance();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verification/face-liveness-actions
// Returns 3 random liveness prompts that the mobile app must display
// ─────────────────────────────────────────────────────────────────────────────
router.get('/face-liveness-actions', authenticate, (_req: Request, res: Response) => {
  const actions = faceService.getRandomActions();
  res.json({ success: true, data: { actions } });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verification/technician
// ─────────────────────────────────────────────────────────────────────────────
router.post('/technician', authenticate, async (req: Request, res: Response) => {
  try {
    const { logId, frames, requestedActions, selfieVideoUrl } = req.body as {
      logId: string;
      frames?: string[];
      requestedActions: string[];
      selfieVideoUrl?: string;
    };

    if (!logId) {
      return res.status(400).json({ success: false, message: 'logId is required' });
    }

    // Load maintenance log + technician profile
    const log = await prisma.maintenanceLog.findUnique({
      where: { id: logId },
      include: { technician: { select: { id: true, photoUrl: true, fullName: true } } },
    });

    if (!log) {
      return res.status(404).json({ success: false, message: 'Maintenance log not found' });
    }

    // Resolve frames
    let resolvedFrames: string[] = frames ?? [];
    if (resolvedFrames.length === 0 && selfieVideoUrl) {
      resolvedFrames = await extractFramesFromUrl(selfieVideoUrl, 8);
    }

    if (resolvedFrames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No frames provided. Send `frames` array or `selfieVideoUrl`.',
      });
    }

    if (!log.technician.photoUrl) {
      // No profile photo → cannot verify
      const result = {
        livenessPassed: false,
        faceMatched: false,
        similarity: 0,
        status: 'NOT_CONFIGURED' as const,
      };

      await prisma.maintenanceLog.update({
        where: { id: logId },
        data: { technicianVerification: result as any },
      });

      return res.json({ success: true, data: { technicianVerification: result } });
    }

    // Run verification
    const result = await faceService.verify({
      frames: resolvedFrames,
      profilePhotoUrl: log.technician.photoUrl,
      requestedActions: requestedActions as any[],
    });

    // Store result in MaintenanceLog (strip rawDetail for DB)
    const storedResult = {
      livenessPassed: result.livenessPassed,
      faceMatched: result.faceMatched,
      similarity: result.similarity,
      status: result.status,
    };

    await prisma.maintenanceLog.update({
      where: { id: logId },
      data: { technicianVerification: storedResult as any },
    });

    if (storedResult.status === 'FAILED') {
      try {
        const io = getIO();
        if (io && log.assetId) {
          const asset = await prisma.asset.findUnique({ where: { id: log.assetId } });
          if (asset) {
            io.to(`site:${asset.siteId}`).emit('activity', {
              type: 'VERIFICATION_FAILED',
              assetId: asset.id,
              assetName: asset.name,
              technicianName: log.technician.fullName,
              siteId: asset.siteId,
              timestamp: new Date(),
              details: `Technician face verification failed.`,
            });
          }
        }
      } catch (err) {
        console.error('Socket emit error', err);
      }
    }

    res.json({
      success: true,
      data: { technicianVerification: storedResult },
    });
  } catch (err) {
    console.error('[verification/technician]', err);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verification/asset
// ─────────────────────────────────────────────────────────────────────────────
router.post('/asset', authenticate, async (req: Request, res: Response) => {
  try {
    const { logId, assetId, frames, assetVideoUrl } = req.body as {
      logId: string;
      assetId: string;
      frames?: string[];
      assetVideoUrl?: string;
    };

    if (!logId || !assetId) {
      return res.status(400).json({ success: false, message: 'logId and assetId are required' });
    }

    // Load asset from DB
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found' });
    }

    // Resolve frames
    let resolvedFrames: string[] = frames ?? [];
    if (resolvedFrames.length === 0 && assetVideoUrl) {
      resolvedFrames = await extractFramesFromUrl(assetVideoUrl, 8);
    }

    if (resolvedFrames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No frames provided. Send `frames` array or `assetVideoUrl`.',
      });
    }

    // Run verification
    const result = await assetService.verify({
      frames: resolvedFrames,
      expectedAssetId: assetId,
      expectedData: {
        qrUuid: asset.qrUuid,
        serialNumber: asset.serialNumber,
        assetNumber: asset.assetNumber,
        assetType: asset.type,
        model: asset.model,
        photoUrl: asset.photoUrl,
      },
    });

    // Store result in MaintenanceLog
    const storedResult = {
      qrMatch: result.qrMatch,
      serialNumberMatch: result.serialNumberMatch,
      assetNumberMatch: result.assetNumberMatch,
      assetTypeMatch: result.assetTypeMatch,
      visualMatch: result.visualMatch,
      confidence: result.confidence,
      status: result.status,
    };

    await prisma.maintenanceLog.update({
      where: { id: logId },
      data: { assetVerification: storedResult as any },
    });

    if (storedResult.status === 'FAILED') {
      try {
        const io = getIO();
        if (io) {
          const technicianLog = await prisma.maintenanceLog.findUnique({
            where: { id: logId },
            include: { technician: true },
          });
          io.to(`site:${asset.siteId}`).emit('activity', {
            type: 'VERIFICATION_FAILED',
            assetId: asset.id,
            assetName: asset.name,
            technicianName: technicianLog?.technician.fullName ?? 'Unknown',
            siteId: asset.siteId,
            timestamp: new Date(),
            details: `Asset video verification failed.`,
          });
        }
      } catch (err) {
        console.error('Socket emit error', err);
      }
    }

    res.json({
      success: true,
      data: { assetVerification: storedResult },
    });
  } catch (err) {
    console.error('[verification/asset]', err);
    res.status(500).json({ success: false, message: 'Asset verification failed' });
  }
});

export default router;