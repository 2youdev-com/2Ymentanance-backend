import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

/**
 * Unified Activity Feed / Audit Logs
 * Supports:
 *  - siteId: filter by site
 *  - type: filter by event type (MAINTENANCE_STARTED, MAINTENANCE_COMPLETED, PROBLEM_REPORTED, REGISTRATION)
 *  - page & limit: server-side pagination
 */
router.get('/', async (req, res) => {
  const siteId = req.query.siteId as string | undefined;
  const typeFilter = req.query.type as string | undefined;
  const page = parseInt(req.query.page as string || '1');
  const limit = parseInt(req.query.limit as string || '20');
  const skip = (page - 1) * limit;

  // 1. Define base filters based on user role and siteId
  const siteIds = req.user!.role !== 'ADMIN' ? req.user!.siteIds : siteId ? [siteId] : [];
  
  const logFilter: any = {};
  const reportFilter: any = {};
  const assetFilter: any = {};

  if (siteIds.length > 0) {
    logFilter.asset = { siteId: { in: siteIds } };
    reportFilter.asset = { siteId: { in: siteIds } };
    assetFilter.siteId = { in: siteIds };
  } else if (siteId) {
     logFilter.asset = { siteId };
     reportFilter.asset = { siteId };
     assetFilter.siteId = siteId;
  }

  const activities: any[] = [];
  let totalCount = 0;

  // 2. Fetch data based on type filter
  // For simplicity and to avoid complex UNIONs in Prisma, we handle 'all' by fetching 
  // recent entries from all relevant tables and merging them. 
  // For specific types, we use full pagination.

  if (!typeFilter || typeFilter === 'all') {
    // Merged view: Fetch 'limit' from each and merge
    // (Note: This doesn't guarantee perfect pagination for 'all' across thousands of records,
    // but works well for most dashboard/audit use cases without a dedicated ActivityLog table)
    const [logs, reports, assets] = await Promise.all([
      prisma.maintenanceLog.findMany({
        where: logFilter,
        orderBy: { startedAt: 'desc' },
        take: skip + limit,
        include: { 
          asset: { include: { site: true } }, 
          technician: { select: { fullName: true } } 
        },
      }),
      prisma.problemReport.findMany({
        where: reportFilter,
        orderBy: { submittedAt: 'desc' },
        take: skip + limit,
        include: { 
          asset: { include: { site: true } }, 
          log: { include: { technician: { select: { fullName: true } } } } 
        },
      }),
      prisma.asset.findMany({
        where: assetFilter,
        orderBy: { createdAt: 'desc' },
        take: skip + limit,
        include: { site: true, creator: { select: { fullName: true } } },
      }),
    ]);

    const allEvents = [
      ...logs.map(l => ({
        id: `log-${l.id}`,
        type: l.status === 'COMPLETED' ? 'MAINTENANCE_COMPLETED' : 'MAINTENANCE_STARTED',
        assetId: l.asset.id,
        assetName: l.asset.name,
        siteName: l.asset.site.name,
        technicianName: l.technician.fullName,
        timestamp: l.completedAt || l.startedAt,
        details: `${l.type} maintenance ${l.status.toLowerCase()}`,
      })),
      ...reports.map(r => ({
        id: `report-${r.id}`,
        type: 'PROBLEM_REPORTED',
        assetId: r.asset.id,
        assetName: r.asset.name,
        siteName: r.asset.site.name,
        technicianName: r.log.technician.fullName,
        timestamp: r.submittedAt,
        details: `${r.category} - ${r.severity}${r.resolved ? ' (resolved)' : ''}`,
      })),
      ...assets.map(a => ({
        id: `asset-${a.id}`,
        type: 'REGISTRATION',
        assetId: a.id,
        assetName: a.name,
        siteName: a.site.name,
        technicianName: a.creator.fullName,
        timestamp: a.createdAt,
        details: `Registered ${a.type.toLowerCase()} asset: ${a.model}`,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    activities.push(...allEvents.slice(skip, skip + limit));
    
    // Approximate total (just sum of counts)
    const [c1, c2, c3] = await Promise.all([
      prisma.maintenanceLog.count({ where: logFilter }),
      prisma.problemReport.count({ where: reportFilter }),
      prisma.asset.count({ where: assetFilter }),
    ]);
    totalCount = c1 + c2 + c3;

  } else {
    // Filtered view: Exact pagination
    if (typeFilter === 'PROBLEM_REPORTED') {
      const [items, count] = await Promise.all([
        prisma.problemReport.findMany({
          where: reportFilter,
          orderBy: { submittedAt: 'desc' },
          skip,
          take: limit,
          include: { asset: { include: { site: true } }, log: { include: { technician: true } } },
        }),
        prisma.problemReport.count({ where: reportFilter }),
      ]);
      totalCount = count;
      activities.push(...items.map(r => ({
        id: `report-${r.id}`,
        type: 'PROBLEM_REPORTED',
        assetId: r.asset.id,
        assetName: r.asset.name,
        siteName: r.asset.site.name,
        technicianName: r.log.technician.fullName,
        timestamp: r.submittedAt,
        details: `${r.category} - ${r.severity}`,
      })));
    } else if (typeFilter === 'REGISTRATION') {
      const [items, count] = await Promise.all([
        prisma.asset.findMany({
          where: assetFilter,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: { site: true, creator: true },
        }),
        prisma.asset.count({ where: assetFilter }),
      ]);
      totalCount = count;
      activities.push(...items.map(a => ({
        id: `asset-${a.id}`,
        type: 'REGISTRATION',
        assetId: a.id,
        assetName: a.name,
        siteName: a.site.name,
        technicianName: a.creator.fullName,
        timestamp: a.createdAt,
        details: `Registered ${a.type.toLowerCase()} asset`,
      })));
    } else {
      // MAINTENANCE_STARTED or MAINTENANCE_COMPLETED
      const subFilter = { ...logFilter };
      if (typeFilter === 'MAINTENANCE_COMPLETED') subFilter.status = 'COMPLETED';
      if (typeFilter === 'MAINTENANCE_STARTED') subFilter.status = 'IN_PROGRESS';

      const [items, count] = await Promise.all([
        prisma.maintenanceLog.findMany({
          where: subFilter,
          orderBy: { startedAt: 'desc' },
          skip,
          take: limit,
          include: { asset: { include: { site: true } }, technician: true },
        }),
        prisma.maintenanceLog.count({ where: subFilter }),
      ]);
      totalCount = count;
      activities.push(...items.map(l => ({
        id: `log-${l.id}`,
        type: l.status === 'COMPLETED' ? 'MAINTENANCE_COMPLETED' : 'MAINTENANCE_STARTED',
        assetId: l.asset.id,
        assetName: l.asset.name,
        siteName: l.asset.site.name,
        technicianName: l.technician.fullName,
        timestamp: l.completedAt || l.startedAt,
        details: `${l.type} maintenance`,
      })));
    }
  }

  res.json({
    success: true,
    data: activities,
    pagination: {
      total: totalCount,
      page,
      limit,
      pages: Math.ceil(totalCount / limit),
    },
  });
});

export default router;