import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Latest 20 activity events for the dashboard feed
router.get('/', async (req, res) => {
  const { siteId } = req.query;

  const logSiteFilter = siteId
    ? { asset: { siteId: siteId as string } }
    : req.user!.role !== 'ADMIN'
    ? { asset: { siteId: { in: req.user!.siteIds } } }
    : {};

  const reportSiteFilter = siteId
    ? { log: { asset: { siteId: siteId as string } } }
    : req.user!.role !== 'ADMIN'
    ? { log: { asset: { siteId: { in: req.user!.siteIds } } } }
    : {};

  const [logs, reports] = await Promise.all([
    prisma.maintenanceLog.findMany({
      where: logSiteFilter,
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        type: true,
        status: true,
        startedAt: true,
        completedAt: true,
        asset: {
          select: {
            id: true,
            name: true,
            siteId: true,
            site: { select: { name: true } },
          },
        },
        technician: { select: { fullName: true } },
      },
    }),

    prisma.problemReport.findMany({
      where: reportSiteFilter,
      orderBy: { submittedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        category: true,
        severity: true,
        resolved: true,
        submittedAt: true,
        log: {
          select: {
            asset: {
              select: {
                id: true,
                name: true,
                siteId: true,
                site: { select: { name: true } },
              },
            },
            technician: { select: { fullName: true } },
          },
        },
      },
    }),
  ]);

  const activities = [
    ...logs.map((log) => ({
      id: `log-${log.id}`,
      type:
        log.status === 'COMPLETED'
          ? 'MAINTENANCE_COMPLETED'
          : 'MAINTENANCE_STARTED',
      assetId: log.asset.id,
      assetName: log.asset.name,
      siteName: log.asset.site.name,
      technicianName: log.technician.fullName,
      timestamp: log.completedAt || log.startedAt,
      details: `${log.type} maintenance ${log.status.toLowerCase()}`,
    })),

    ...reports.map((report) => ({
      id: `report-${report.id}`,
      type: 'PROBLEM_REPORTED',
      assetId: report.log.asset.id,
      assetName: report.log.asset.name,
      siteName: report.log.asset.site.name,
      technicianName: report.log.technician.fullName,
      timestamp: report.submittedAt,
      details: `${report.category} - ${report.severity}${
        report.resolved ? ' (resolved)' : ''
      }`,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);

  res.json({ success: true, data: activities });
});

export default router;