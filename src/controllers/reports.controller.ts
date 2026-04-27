import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { getIO } from '../utils/socket';
import { Prisma } from '@prisma/client';

export const createProblemReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { logId, category, severity, description, videoUrl, audioUrl, extraPhotoUrls = [] } = req.body;

  const log = await prisma.maintenanceLog.findUnique({
    where: { id: logId },
    include: { asset: true, technician: { select: { fullName: true } } },
  });

  if (!log) throw new AppError('Maintenance log not found', 404);
  if (log.technicianId !== req.user!.userId && req.user!.role !== 'ADMIN') {
    throw new AppError('You can only submit reports for your own maintenance logs', 403);
  }

  const existing = await prisma.problemReport.findUnique({
    where: { logId },
    include: { extraPhotos: true },
  });
  if (existing) {
    // If it already exists, consider it a success to allow the flow to continue (idempotency)
    res.status(200).json({ success: true, data: existing });
    return;
  }

  // Normalise extraPhotoUrls — Zod already coerces it but guard at runtime too
  const photoUrls: string[] = Array.isArray(extraPhotoUrls)
    ? extraPhotoUrls
    : extraPhotoUrls
    ? [extraPhotoUrls]
    : [];

  const newStatus =
    severity === 'CRITICAL' || severity === 'HIGH'
      ? 'OUT_OF_SERVICE'
      : 'NEEDS_MAINTENANCE';

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.problemReport.create({
      data: {
        logId,
        assetId: log.assetId,
        category,
        severity,
        description,
        videoUrl: videoUrl ?? null,
        audioUrl: audioUrl ?? null,
        extraPhotos: { create: photoUrls.map((url: string) => ({ url })) },
      },
      include: { extraPhotos: true },
    });

    await tx.asset.update({
      where: { id: log.assetId },
      data: { status: newStatus },
    });

    return created;
  });

  try {
    const io = getIO();
    if (io) {
      io.to(`site:${log.asset.siteId}`).emit('activity', {
        type: 'PROBLEM_REPORTED',
        assetId: log.asset.id,
        assetName: log.asset.name,
        technicianName: log.technician.fullName,
        siteId: log.asset.siteId,
        timestamp: new Date(),
        details: `Problem reported: ${category} - ${severity}`,
      });
    }
  } catch (error: any) {
    console.warn('Socket.io not available:', error?.message || error);
  }

  res.status(201).json({ success: true, data: report });
});

export const getProblemReports = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { siteId, resolved, severity, page = '1', limit = '20' } = req.query;

  const siteFilter: Prisma.MaintenanceLogWhereInput = siteId
    ? { asset: { siteId: siteId as string } }
    : req.user!.role !== 'ADMIN'
    ? { asset: { siteId: { in: req.user!.siteIds } } }
    : {};

  const where: Prisma.ProblemReportWhereInput = { log: siteFilter };
  if (resolved !== undefined) where.resolved = resolved === 'true';
  if (severity) where.severity = severity as Prisma.EnumSeverityFilter;

  const skip = (Number(page) - 1) * Number(limit);

  const [reports, total] = await Promise.all([
    prisma.problemReport.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { submittedAt: 'desc' },
      include: {
        log: {
          include: {
            asset: { select: { id: true, name: true, type: true, site: { select: { name: true } } } },
            technician: { select: { id: true, fullName: true } },
          },
        },
        extraPhotos: true,
      },
    }),
    prisma.problemReport.count({ where }),
  ]);

  res.json({
    success: true,
    data: reports,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

export const getProblemReportById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const report = await prisma.problemReport.findUnique({
    where: { id },
    include: {
      log: {
        include: {
          asset: { include: { site: true } },
          technician: { select: { id: true, fullName: true } },
          checklistItems: true,
          machinePhotos: true,
        },
      },
      extraPhotos: true,
    },
  });

  if (!report) throw new AppError('Problem report not found', 404);

  res.json({ success: true, data: report });
});

export const resolveReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const report = await prisma.problemReport.findUnique({ where: { id } });
  if (!report) throw new AppError('Problem report not found', 404);
  if (report.resolved) throw new AppError('Report is already resolved', 400);

  await prisma.$transaction(async (tx) => {
    await tx.problemReport.update({ where: { id }, data: { resolved: true } });
    await tx.asset.update({ where: { id: report.assetId }, data: { status: 'OPERATIONAL' } });
  });

  res.json({ success: true, message: 'Report resolved' });
});
