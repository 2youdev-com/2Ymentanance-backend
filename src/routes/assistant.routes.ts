import { Router } from 'express';
import {
  chatWithAssistant,
  getSessions,
  createSession,
  getSessionMessages,
  deleteSession,
  chatInSession,
} from '../controllers/assistant.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Stateless (old endpoint — keep for backward compat)
router.post('/chat', chatWithAssistant);

// Sessions
router.get('/sessions', getSessions);
router.post('/sessions', createSession);
router.get('/sessions/:id/messages', getSessionMessages);
router.delete('/sessions/:id', deleteSession);
router.post('/sessions/:id/chat', chatInSession);

export default router;
