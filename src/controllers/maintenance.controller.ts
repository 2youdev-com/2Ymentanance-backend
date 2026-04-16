import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { uploadToCloudinary } from '../middleware/upload';
import { getIO } from '../utils/socket';
import { Prisma } from '@prisma/client';

function emitActivitySafely(siteId: string, payload: Record<string, unknown>) {
  try {
    const io = getIO();
    if (!io) return;
    io.to(`site:${siteId}`).emit('activity', payload);
  } catch (error: any) {
    console.warn('Socket.io not available:', error?.message || error);
  }
}

export const startMaintenance = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { assetId, type } = req.body;

  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new AppError('Asset not found', 404);

  if (req.user!.role !== 'ADMIN' && !req.user!.siteIds.includes(asset.siteId)) {
    throw new AppError('You are not authorized to access this asset', 403);
  }

  const log = await prisma.maintenanceLog.create({
    data: { assetId, technicianId: req.user!.userId, type, status: 'IN_PROGRESS' },
    include: {
      asset: { select: { id: true, name: true, siteId: true } },
      technician: { select: { id: true, fullName: true } },
    },
  });

  emitActivitySafely(asset.siteId, {
    type: 'MAINTENANCE_STARTED',
    assetId: asset.id,
    assetName: asset.name,
    technicianName: log.technician.fullName,
    siteId: asset.siteId,
    timestamp: new Date(),
    details: `Started ${type.toLowerCase()} maintenance`,
  });

  res.status(201).json({ success: true, data: log });
});

export const submitChecklist = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { logId } = req.params;
  const { items } = req.body;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  const log = await prisma.maintenanceLog.findUnique({ where: { id: logId } });
  if (!log) throw new AppError('Maintenance log not found', 404);
  if (log.technicianId !== req.user!.userId && req.user!.role !== 'ADMIN') {
    throw new AppError('You can only submit your own checklists', 403);
  }

  const machinePhotoUrls: string[] = [];
  if (files?.machinePhotos) {
    for (const file of files.machinePhotos) {
      const url = await uploadToCloudinary(file.buffer, 'machine-photos', 'image');
      machinePhotoUrls.push(url);
    }
  }

  let personPhotoUrl: string | undefined;
  if (files?.personPhoto?.[0]) {
    personPhotoUrl = await uploadToCloudinary(files.personPhoto[0].buffer, 'person-photos', 'image');
  }

  const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

  await prisma.$transaction(async (tx) => {
    await tx.checklistItem.deleteMany({ where: { logId } });
    await tx.machinePhoto.deleteMany({ where: { logId } });

    await tx.checklistItem.createMany({
      data: parsedItems.map((item: { itemCode: string; description: string; result: string; notes?: string }) => ({
        logId,
        itemCode: item.itemCode,
        description: item.description,
        result: item.result,
        notes: item.notes,
      })),
    });

    if (machinePhotoUrls.length > 0) {
      await tx.machinePhoto.createMany({
        data: machinePhotoUrls.map((url) => ({ logId, url })),
      });
    }

    await tx.maintenanceLog.update({
      where: { id: logId },
      data: { personPhoto: personPhotoUrl },
    });
  });

  res.json({ success: true, message: 'Checklist submitted successfully' });
});

export const completeMaintenance = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { logId } = req.params;

  const log = await prisma.maintenanceLog.findUnique({
    where: { id: logId },
    include: {
      asset: true,
      technician: { select: { fullName: true } },
      checklistItems: true,
    },
  });

  if (!log) throw new AppError('Maintenance log not found', 404);
  if (log.technicianId !== req.user!.userId && req.user!.role !== 'ADMIN') {
    throw new AppError('You can only complete your own maintenance logs', 403);
  }
  if (log.status === 'COMPLETED') throw new AppError('Maintenance already completed', 400);

  const hasFailedItems = log.checklistItems.some((item) => item.result === 'FAIL');

  const assetUpdateData: Prisma.AssetUpdateInput = log.type === 'PREVENTIVE'
    ? { lastPreventiveDate: new Date() }
    : { lastCorrectiveDate: new Date() };

  if (hasFailedItems) assetUpdateData.status = 'NEEDS_MAINTENANCE';

  await prisma.$transaction(async (tx) => {
    await tx.maintenanceLog.update({
      where: { id: logId },
      data: { completedAt: new Date(), status: 'COMPLETED' },
    });
    await tx.asset.update({ where: { id: log.assetId }, data: assetUpdateData });
  });

  emitActivitySafely(log.asset.siteId, {
    type: 'MAINTENANCE_COMPLETED',
    assetId: log.asset.id,
    assetName: log.asset.name,
    technicianName: log.technician.fullName,
    siteId: log.asset.siteId,
    timestamp: new Date(),
    details: `Completed ${log.type.toLowerCase()} maintenance`,
  });

  res.json({ success: true, message: 'Maintenance completed' });
});

export const getMaintenanceLogs = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { siteId, assetId, type, technicianId, dateFrom, dateTo, page = '1', limit = '20' } = req.query;

  const where: Prisma.MaintenanceLogWhereInput = {};

  if (assetId) where.assetId = assetId as string;
  if (type) where.type = type as Prisma.EnumMaintenanceTypeFilter;
  if (technicianId) where.technicianId = technicianId as string;
  if (dateFrom || dateTo) {
    where.startedAt = {};
    if (dateFrom) (where.startedAt as Prisma.DateTimeFilter).gte = new Date(dateFrom as string);
    if (dateTo) (where.startedAt as Prisma.DateTimeFilter).lte = new Date(dateTo as string);
  }

  const siteFilter: Prisma.AssetWhereInput = siteId
    ? { siteId: siteId as string }
    : req.user!.role !== 'ADMIN'
    ? { siteId: { in: req.user!.siteIds } }
    : {};

  where.asset = siteFilter;

  const skip = (Number(page) - 1) * Number(limit);

  const [logs, total] = await Promise.all([
    prisma.maintenanceLog.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { startedAt: 'desc' },
      include: {
        asset: { select: { id: true, name: true, type: true, site: { select: { name: true } } } },
        technician: { select: { id: true, fullName: true } },
        problemReport: { select: { id: true, severity: true, category: true, resolved: true } },
        _count: { select: { checklistItems: true, machinePhotos: true } },
      },
    }),
    prisma.maintenanceLog.count({ where }),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: {
      total, page: Number(page), limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

export const getMaintenanceLogById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const log = await prisma.maintenanceLog.findUnique({
    where: { id },
    include: {
      asset: { include: { site: true } },
      technician: { select: { id: true, fullName: true, photoUrl: true } },
      checklistItems: true,
      machinePhotos: true,
      problemReport: { include: { extraPhotos: true } },
    },
  });

  if (!log) throw new AppError('Maintenance log not found', 404);

  res.json({ success: true, data: log });
});