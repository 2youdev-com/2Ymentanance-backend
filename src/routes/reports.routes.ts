import { Router } from 'express';
import {
  createProblemReport, getProblemReports,
  getProblemReportById, resolveReport,
} from '../controllers/reports.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createReportSchema } from '../utils/schemas';
import { upload } from '../middleware/upload';

const router = Router();

router.use(authenticate);

router.get('/', getProblemReports);
router.get('/:id', getProblemReportById);
router.post(
  '/',
  requireRole('TECHNICIAN', 'ADMIN'),
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
    { name: 'extraPhotos', maxCount: 10 },
  ]),
  validate(createReportSchema),
  createProblemReport
);
router.patch('/:id/resolve', requireRole('ADMIN'), resolveReport);

export default router;
