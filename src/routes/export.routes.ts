import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN'));

// GET /api/export/maintenance?siteId=&from=&to=
// Returns CSV of all maintenance logs — for audit/compliance (BO-B-04)
router.get('/maintenance', async (req: Request, res: Response, next) => {
  try {
    const { siteId, from, to } = req.query;

    const where: Prisma.MaintenanceLogWhereInput = {
      ...(siteId && { asset: { siteId: siteId as string } }),
      ...(from || to
        ? {
            startedAt: {
              ...(from && { gte: new Date(from as string) }),
              ...(to   && { lte: new Date(to   as string) }),
            },
          }
        : {}),
    };

    const logs = await prisma.maintenanceLog.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: {
        asset: {
          include: { site: { select: { name: true } } },
        },
        technician: { select: { fullName: true, username: true } },
        checklistItems: true,
        problemReport: { select: { category: true, severity: true, resolved: true } },
      },
    });

    const rows = [
      [
        'Log ID', 'Asset Number', 'Asset Name', 'Asset Type',
        'Site', 'Building', 'Floor', 'Zone',
        'Maintenance Type', 'Status',
        'Technician', 'Started At', 'Completed At',
        'Checklist Items', 'Pass', 'Fail', 'NA',
        'Problem Category', 'Problem Severity', 'Problem Resolved',
      ].join(','),
      ...logs.map((log) => {
        const pass = log.checklistItems.filter((i) => i.result === 'PASS').length;
        const fail = log.checklistItems.filter((i) => i.result === 'FAIL').length;
        const na   = log.checklistItems.filter((i) => i.result === 'NA').length;
        return [
          log.id,
          log.asset.assetNumber,
          `"${log.asset.name}"`,
          log.asset.type,
          log.asset.site.name,
          log.asset.building || '',
          log.asset.floor    || '',
          log.asset.zone     || '',
          log.type,
          log.status,
          log.technician.fullName,
          log.startedAt.toISOString(),
          log.completedAt?.toISOString() || '',
          log.checklistItems.length,
          pass, fail, na,
          log.problemReport?.category  || '',
          log.problemReport?.severity  || '',
          log.problemReport?.resolved  ?? '',
        ].join(',');
      }),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="2ymentanance-maintenance-${Date.now()}.csv"`
    );
    res.send(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/export/assets?siteId=
// Returns CSV of all assets
router.get('/assets', async (req: Request, res: Response, next) => {
  try {
    const { siteId } = req.query;

    const where: Prisma.AssetWhereInput = siteId ? { siteId: siteId as string } : {};

    const assets = await prisma.asset.findMany({
      where,
      orderBy: [{ siteId: 'asc' }, { assetNumber: 'asc' }],
      include: {
        site:    { select: { name: true } },
        creator: { select: { fullName: true } },
        _count:  { select: { maintenanceLogs: true } },
      },
    });

    const rows = [
      [
        'Asset Number', 'Name', 'Type', 'Model', 'Serial Number',
        'Site', 'Building', 'Floor', 'Zone',
        'Status', 'Last Preventive', 'Last Corrective',
        'Total Maintenance Logs', 'Registered By', 'Registered At',
        'Remarks',
      ].join(','),
      ...assets.map((a) => [
        a.assetNumber,
        `"${a.name}"`,
        a.type,
        `"${a.model}"`,
        a.serialNumber,
        a.site.name,
        a.building || '',
        a.floor    || '',
        a.zone     || '',
        a.status,
        a.lastPreventiveDate?.toISOString().split('T')[0] || '',
        a.lastCorrectiveDate?.toISOString().split('T')[0] || '',
        a._count.maintenanceLogs,
        a.creator.fullName,
        a.createdAt.toISOString().split('T')[0],
        `"${a.remarks || ''}"`,
      ].join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="2ymentanance-assets-${Date.now()}.csv"`
    );
    res.send(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
