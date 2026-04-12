import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { uploadToCloudinary } from '../middleware/upload';
import { getIO } from '../utils/socket';
import { Prisma } from '@prisma/client';

export const createProblemReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { logId, category, severity, description } = req.body;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  const log = await prisma.maintenanceLog.findUnique({
    where: { id: logId },
    include: { asset: true, technician: { select: { fullName: true } } },
  });

  if (!log) throw new AppError('Maintenance log not found', 404);
  if (log.technicianId !== req.user!.userId && req.user!.role !== 'ADMIN') {
    throw new AppError('You can only submit reports for your own maintenance logs', 403);
  }

  const existing = await prisma.problemReport.findUnique({ where: { logId } });
  if (existing) throw new AppError('A problem report already exists for this log', 409);

  let videoUrl: string | undefined;
  if (files?.video?.[0]) {
    videoUrl = await uploadToCloudinary(files.video[0].buffer, 'problem-videos', 'video');
  }

  let audioUrl: string | undefined;
  if (files?.audio?.[0]) {
    audioUrl = await uploadToCloudinary(files.audio[0].buffer, 'problem-audio', 'video');
  }

  const extraPhotoUrls: string[] = [];
  if (files?.extraPhotos) {
    for (const file of files.extraPhotos) {
      const url = await uploadToCloudinary(file.buffer, 'problem-photos', 'image');
      extraPhotoUrls.push(url);
    }
  }

  const newStatus = severity === 'CRITICAL' || severity === 'HIGH' ? 'OUT_OF_SERVICE' : 'NEEDS_MAINTENANCE';

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.problemReport.create({
      data: {
        logId,
        assetId: log.assetId,
        category,
        severity,
        description,
        videoUrl,
        audioUrl,
        extraPhotos: { create: extraPhotoUrls.map((url) => ({ url })) },
      },
      include: { extraPhotos: true },
    });

    await tx.asset.update({ where: { id: log.assetId }, data: { status: newStatus } });

    return created;
  });

  getIO().to(`site:${log.asset.siteId}`).emit('activity', {
    type: 'PROBLEM_REPORTED',
    assetId: log.asset.id,
    assetName: log.asset.name,
    technicianName: log.technician.fullName,
    siteId: log.asset.siteId,
    timestamp: new Date(),
    details: `Problem reported: ${category} - ${severity}`,
  });

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
      total, page: Number(page), limit: Number(limit),
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
