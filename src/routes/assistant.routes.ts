import { Router } from 'express';
import { chatWithAssistant } from '../controllers/assistant.controller';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.use(authenticate);

router.post('/chat', asyncHandler(chatWithAssistant));

export default router;
