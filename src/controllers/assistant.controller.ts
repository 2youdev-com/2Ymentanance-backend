import { Request, Response } from 'express';
import { AssistantService, ConversationMessage } from '../services/assistant/AssistantService';
import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../config/database';

// ─── Sessions ─────────────────────────────────────────────────────────────────

/** GET /assistant/sessions — list all sessions for the current user */
export const getSessions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const sessions = await prisma.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  res.json({ success: true, data: sessions });
});

/** POST /assistant/sessions — create a new session */
export const createSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const session = await prisma.chatSession.create({
    data: { userId, title: 'New Chat' },
  });

  res.json({ success: true, data: session });
});

/** GET /assistant/sessions/:id/messages — get messages for a session */
export const getSessionMessages = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { id } = req.params;

  const session = await prisma.chatSession.findFirst({
    where: { id, userId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!session) {
    res.status(404).json({ success: false, error: 'Session not found' });
    return;
  }

  res.json({ success: true, data: session.messages });
});

/** DELETE /assistant/sessions/:id — delete a session */
export const deleteSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { id } = req.params;

  const session = await prisma.chatSession.findFirst({ where: { id, userId } });

  if (!session) {
    res.status(404).json({ success: false, error: 'Session not found' });
    return;
  }

  await prisma.chatSession.delete({ where: { id } });

  res.json({ success: true });
});

// ─── Chat ─────────────────────────────────────────────────────────────────────

/** POST /assistant/sessions/:id/chat — send a message in a session */
export const chatInSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { message, context } = req.body;
  const user = req.user!;
  const { id: sessionId } = req.params;

  if (!message) {
    res.status(400).json({ success: false, error: 'Message is required' });
    return;
  }

  // Verify session belongs to user
  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, userId: user.userId },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
  });

  if (!session) {
    res.status(404).json({ success: false, error: 'Session not found' });
    return;
  }

  // Build history from DB messages
  const history: ConversationMessage[] = session.messages
    .filter((m) => m.content)
    .slice(-20)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  try {
    const assistant = new AssistantService(user.userId, user.role);
    const response = await assistant.processMessage(message, context, history);

    // Save user message
    await prisma.chatMessage.create({
      data: { sessionId, role: 'user', content: message },
    });

    // Save assistant response
    await prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: response.message,
        toolName: response.toolName ?? null,
        data: response.data ?? undefined,
      },
    });

    // Auto-title: use first user message (truncated)
    if (session.messages.length === 0) {
      const title = message.slice(0, 60) + (message.length > 60 ? '…' : '');
      await prisma.chatSession.update({ where: { id: sessionId }, data: { title } });
    } else {
      // touch updatedAt so it floats to top
      await prisma.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
    }

    // Audit log
    try {
      await prisma.aIActionLog.create({
        data: {
          userId: user.userId,
          userRole: user.role,
          prompt: message,
          toolName: response.toolName ?? null,
          toolInput: context ?? null,
          toolOutputSummary: response.data
            ? `Found ${Array.isArray(response.data) ? response.data.length : 1} records`
            : 'Response only',
          status: 'SUCCESS',
        },
      });
    } catch (logError) {
      console.error('Failed to log AI action:', logError);
    }

    res.json({ success: true, ...response });
  } catch (error: any) {
    console.error('Assistant error:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while processing your request.',
    });
  }
});

// ─── Keep old /chat endpoint working (stateless, no session) ──────────────────

export const chatWithAssistant = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { message, context, history } = req.body;
  const user = req.user!;

  if (!message) {
    res.status(400).json({ success: false, error: 'Message is required' });
    return;
  }

  const sanitizedHistory: ConversationMessage[] = Array.isArray(history)
    ? history
        .filter(
          (h: any) =>
            h &&
            typeof h.role === 'string' &&
            (h.role === 'user' || h.role === 'assistant') &&
            typeof h.content === 'string' &&
            h.content.length > 0
        )
        .slice(-20)
        .map((h: any) => ({ role: h.role as 'user' | 'assistant', content: String(h.content).slice(0, 500) }))
    : [];

  try {
    const assistant = new AssistantService(user.userId, user.role);
    const response = await assistant.processMessage(message, context, sanitizedHistory);

    try {
      await prisma.aIActionLog.create({
        data: {
          userId: user.userId,
          userRole: user.role,
          prompt: message,
          toolName: response.toolName ?? null,
          toolInput: context ?? null,
          toolOutputSummary: response.data
            ? `Found ${Array.isArray(response.data) ? response.data.length : 1} records`
            : 'Response only',
          status: 'SUCCESS',
        },
      });
    } catch (logError) {
      console.error('Failed to log AI action:', logError);
    }

    res.json({ success: true, ...response });
  } catch (error: any) {
    console.error('Assistant error:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while processing your request with the assistant.',
    });
  }
});