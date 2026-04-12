import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  const sites =
    req.user!.role === 'ADMIN'
      ? await prisma.site.findMany()
      : await prisma.site.findMany({
          where: { id: { in: req.user!.siteIds } },
        });

  res.json({ success: true, data: sites });
});

router.get('/:id', async (req, res) => {
  const site = await prisma.site.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { assets: true } } },
  });

  if (!site) {
    res.status(404).json({ success: false, error: 'Site not found' });
    return;
  }

  res.json({ success: true, data: site });
});

export default router;
