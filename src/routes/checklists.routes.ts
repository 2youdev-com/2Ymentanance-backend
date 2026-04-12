import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getChecklistTemplate } from '../utils/checklists';
import { AssetType, MaintenanceType } from '@prisma/client';

const router = Router();

router.use(authenticate);

router.get('/:assetType/:maintenanceType', (req, res) => {
  const { assetType, maintenanceType } = req.params;

  const template = getChecklistTemplate(
    assetType as AssetType,
    maintenanceType as MaintenanceType
  );

  res.json({ success: true, data: template });
});

export default router;
