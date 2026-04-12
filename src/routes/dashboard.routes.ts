import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getDashboardStats } from '../controllers/assets.controller';
import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

const router = Router();
router.use(authenticate);

// GET /api/dashboard/kpi
// Returns the 4 KPI cards for the dashboard home (FR-B-05~08)
router.get('/kpi', getDashboardStats);

// GET /api/dashboard/floor-plan
// Returns all assets grouped by site → building → floor
// Used by the floor plan viewer (replaces CesiumJS map for indoor assets)
router.get('/floor-plan', async (req, res, next) => {
  try {
    const { siteId } = req.query;

    const where: Prisma.AssetWhereInput =
      siteId
        ? { siteId: siteId as string }
        : req.user!.role !== 'ADMIN'
        ? { siteId: { in: req.user!.siteIds } }
        : {};

    const assets = await prisma.asset.findMany({
      where,
      select: {
        id: true,
        name: true,
        assetNumber: true,
        type: true,
        status: true,
        building: true,
        floor: true,
        zone: true,
        site: { select: { id: true, name: true } },
      },
      orderBy: [{ building: 'asc' }, { floor: 'asc' }, { name: 'asc' }],
    });

    // Group by site → building → floor
    const grouped: Record<string, Record<string, Record<string, typeof assets>>> = {};

    for (const asset of assets) {
      const site   = asset.site.name;
      const bldg   = asset.building || 'Unknown';
      const floor  = asset.floor    || 'Unknown';

      if (!grouped[site])         grouped[site] = {};
      if (!grouped[site][bldg])   grouped[site][bldg] = {};
      if (!grouped[site][bldg][floor]) grouped[site][bldg][floor] = [];

      grouped[site][bldg][floor].push(asset);
    }

    res.json({ success: true, data: grouped });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/summary
// Returns per-site asset type breakdown for charts
router.get('/summary', async (req, res, next) => {
  try {
    const { siteId } = req.query;

    const where: Prisma.AssetWhereInput =
      siteId
        ? { siteId: siteId as string }
        : req.user!.role !== 'ADMIN'
        ? { siteId: { in: req.user!.siteIds } }
        : {};

    const [byType, byStatus, byFloor] = await Promise.all([
      // Count per asset type
      prisma.asset.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
        orderBy: { _count: { type: 'desc' } },
      }),

      // Count per status
      prisma.asset.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),

      // Count per floor (top 10)
      prisma.asset.groupBy({
        by: ['floor'],
        where: { ...where, floor: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { floor: 'desc' } },
        take: 10,
      }),
    ]);

    res.json({
      success: true,
      data: {
        byType:   byType.map((r)   => ({ type:   r.type,   count: r._count._all })),
        byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
        byFloor:  byFloor.map((r)  => ({ floor:  r.floor,  count: r._count._all })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
