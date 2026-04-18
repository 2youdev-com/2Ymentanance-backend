import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { AssetStatus, Prisma } from '@prisma/client';

export const getAssets = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { siteId, type, status, search, page = '1', limit = '20' } = req.query;

  const where: Prisma.AssetWhereInput = {};

  if (req.user!.role !== 'ADMIN') {
    if (siteId) {
      if (!req.user!.siteIds.includes(siteId as string)) {
        throw new AppError('You are not authorized to access assets for this site', 403);
      }
      where.siteId = siteId as string;
    } else {
      where.siteId = { in: req.user!.siteIds };
    }
  } else if (siteId) {
    where.siteId = siteId as string;
  }

  if (type) where.type = type as Prisma.EnumAssetTypeFilter;
  if (status) where.status = status as AssetStatus;

  if (search) {
    where.OR = [
      { name: { contains: search as string, mode: 'insensitive' } },
      { serialNumber: { contains: search as string, mode: 'insensitive' } },
      { assetNumber: { contains: search as string, mode: 'insensitive' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        site: { select: { id: true, name: true } },
        creator: { select: { id: true, fullName: true } },
        _count: { select: { maintenanceLogs: true } },
      },
    }),
    prisma.asset.count({ where }),
  ]);

  res.json({
    success: true,
    data: assets,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

export const getAssetByQr = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;

  const asset = await prisma.asset.findUnique({
    where: { qrUuid: uuid },
    include: {
      site: { select: { id: true, name: true } },
      creator: { select: { id: true, fullName: true } },
    },
  });

  if (!asset) {
    res.status(404).json({ success: false, error: 'ASSET_NOT_FOUND', registered: false });
    return;
  }

  if (req.user!.role !== 'ADMIN' && !req.user!.siteIds.includes(asset.siteId)) {
    throw new AppError('You are not authorized to access this asset', 403);
  }

  res.json({ success: true, data: { ...asset, registered: true } });
});

export const getAssetById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      site: true,
      creator: { select: { id: true, fullName: true } },
      maintenanceLogs: {
        orderBy: { startedAt: 'desc' },
        include: {
          technician: { select: { id: true, fullName: true } },
          checklistItems: true,
          machinePhotos: true,
          problemReport: { include: { extraPhotos: true } },
        },
      },
    },
  });

  if (!asset) throw new AppError('Asset not found', 404);

  if (req.user!.role !== 'ADMIN' && !req.user!.siteIds.includes(asset.siteId)) {
    throw new AppError('You are not authorized to access this asset', 403);
  }

  res.json({ success: true, data: asset });
});

export const createAsset = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const {
    qrUuid, type, name, model, serialNumber, assetNumber,
    building, floor, zone, status, remarks,
    lastPreventiveDate, lastCorrectiveDate, siteId,
  } = req.body;

  if (req.user!.role !== 'ADMIN' && !req.user!.siteIds.includes(siteId)) {
    throw new AppError('You are not authorized to register assets at this site', 403);
  }

  // Photo is uploaded directly to Cloudinary by the client; we receive the URL
  const photoUrl: string | undefined = req.body.photoUrl ?? undefined;

  const asset = await prisma.asset.create({
    data: {
      qrUuid,
      type,
      name,
      model,
      serialNumber,
      assetNumber,
      building,
      floor,
      zone,
      status: (status as AssetStatus) || 'OPERATIONAL',
      photoUrl,
      remarks,
      lastPreventiveDate: lastPreventiveDate ? new Date(lastPreventiveDate) : null,
      lastCorrectiveDate: lastCorrectiveDate ? new Date(lastCorrectiveDate) : null,
      siteId,
      createdBy: req.user!.userId,
    },
    include: { site: { select: { id: true, name: true } } },
  });

  res.status(201).json({ success: true, data: asset });
});

export const updateAsset = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) throw new AppError('Asset not found', 404);

  if (req.user!.role !== 'ADMIN' && !req.user!.siteIds.includes(asset.siteId)) {
    throw new AppError('You are not authorized to update this asset', 403);
  }

  // Photo is uploaded directly to Cloudinary by the client; we receive the URL
  const photoUrl = req.body.photoUrl ?? asset.photoUrl;

  const { siteId: _siteId, qrUuid: _qrUuid, createdBy: _createdBy, ...updateFields } = req.body;

  const updated = await prisma.asset.update({
    where: { id },
    data: {
      ...updateFields,
      photoUrl,
      lastPreventiveDate:
        updateFields.lastPreventiveDate === ''
          ? null
          : updateFields.lastPreventiveDate
            ? new Date(updateFields.lastPreventiveDate)
            : undefined,
      lastCorrectiveDate:
        updateFields.lastCorrectiveDate === ''
          ? null
          : updateFields.lastCorrectiveDate
            ? new Date(updateFields.lastCorrectiveDate)
            : undefined,
    },
  });

  res.json({ success: true, data: updated });
});

export const getDashboardStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { siteId } = req.query;

  let siteFilter: Prisma.AssetWhereInput = {};

  if (req.user!.role !== 'ADMIN') {
    if (siteId) {
      if (!req.user!.siteIds.includes(siteId as string)) {
        throw new AppError('You are not authorized to access dashboard stats for this site', 403);
      }
      siteFilter = { siteId: siteId as string };
    } else {
      siteFilter = { siteId: { in: req.user!.siteIds } };
    }
  } else if (siteId) {
    siteFilter = { siteId: siteId as string };
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const [totalAssets, needsMaintenance, completedThisWeek, openReports] = await Promise.all([
    prisma.asset.count({ where: siteFilter }),
    prisma.asset.count({ where: { ...siteFilter, status: 'NEEDS_MAINTENANCE' } }),
    prisma.maintenanceLog.count({
      where: { asset: siteFilter, completedAt: { gte: weekStart }, status: 'COMPLETED' },
    }),
    prisma.problemReport.count({
      where: { resolved: false, log: { asset: siteFilter } },
    }),
  ]);

  res.json({
    success: true,
    data: { totalAssets, needsMaintenance, completedThisWeek, openReports },
  });
});

export const deleteAsset = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (req.user!.role !== 'ADMIN') {
    throw new AppError('Only admins can delete assets', 403);
  }

  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!asset) {
    throw new AppError('Asset not found', 404);
  }

  try {
    await prisma.asset.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Asset deleted successfully' });
  } catch (error: any) {
    console.error('Delete asset error:', error);
    throw new AppError(error?.message || 'Failed to delete asset', 500);
  }
});