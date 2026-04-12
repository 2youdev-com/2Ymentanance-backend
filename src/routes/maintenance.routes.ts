import { Router } from 'express';
import {
  startMaintenance, submitChecklist, completeMaintenance,
  getMaintenanceLogs, getMaintenanceLogById,
} from '../controllers/maintenance.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { startMaintenanceSchema, submitChecklistSchema, getMaintenanceLogsQuerySchema } from '../utils/schemas';
import { upload } from '../middleware/upload';

const router = Router();

router.use(authenticate);

router.get('/', validate(getMaintenanceLogsQuerySchema), getMaintenanceLogs);
router.get('/:id', getMaintenanceLogById);
router.post('/', requireRole('TECHNICIAN', 'ADMIN'), validate(startMaintenanceSchema), startMaintenance);
router.post(
  '/:logId/checklist',
  requireRole('TECHNICIAN', 'ADMIN'),
  upload.fields([{ name: 'machinePhotos', maxCount: 10 }, { name: 'personPhoto', maxCount: 1 }]),
  validate(submitChecklistSchema),
  submitChecklist
);
router.post('/:logId/complete', requireRole('TECHNICIAN', 'ADMIN'), completeMaintenance);

export default router;
