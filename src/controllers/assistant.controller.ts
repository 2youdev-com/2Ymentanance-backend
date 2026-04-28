import { Request, Response } from 'express';
import { AssistantService, ConversationMessage } from '../services/assistant/AssistantService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const chatWithAssistant = async (req: Request, res: Response): Promise<void> => {
  const { message, context, history } = req.body;
  const user = req.user!;

  if (!message) {
    res.status(400).json({ success: false, error: 'Message is required' });
    return;
  }

  // Validate and sanitize history (last 10 exchanges max to keep context window small)
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
      .slice(-20) // last 20 messages (10 exchanges)
      .map((h: any) => ({ role: h.role as 'user' | 'assistant', content: String(h.content).slice(0, 500) }))
    : [];

  try {
    const assistant = new AssistantService(user.userId, user.role);
    const response = await assistant.processMessage(message, context, sanitizedHistory);

    // ── Audit Log ────────────────────────────────────────────────────────────
    try {
      await prisma.aIActionLog.create({
        data: {
          userId: user.userId,
          userRole: user.role,
          prompt: message,
          toolName: response.toolName || null,
          toolInput: context || null,
          toolOutputSummary: response.data
            ? `Found ${Array.isArray(response.data) ? response.data.length : 1} records`
            : 'Response only',
          status: 'SUCCESS',
        },
      });
    } catch (logError) {
      console.error('Failed to log AI action:', logError);
    }

    res.json({
      success: true,
      ...response,
    });
  } catch (error: any) {
    console.error('Assistant error:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while processing your request with the assistant.',
    });
  }
};
