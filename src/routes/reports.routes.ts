import { Router } from 'express';
import {
  createProblemReport, getProblemReports,
  getProblemReportById, resolveReport,
} from '../controllers/reports.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createReportSchema } from '../utils/schemas';

const router = Router();

router.use(authenticate);

router.get('/', getProblemReports);
router.get('/:id', getProblemReportById);
router.post(
  '/',
  requireRole('TECHNICIAN', 'ADMIN'),
  // No multer here — media is uploaded directly to Cloudinary from the client.
  // The request is plain JSON containing the resulting secure_url strings.
  validate(createReportSchema),
  createProblemReport
);
router.patch('/:id/resolve', requireRole('ADMIN'), resolveReport);

export default router;
