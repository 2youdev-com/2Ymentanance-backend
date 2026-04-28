import { AssistantTools } from './AssistantTools';
import { Role } from '@prisma/client';
import { GeminiProvider, GeminiIntent } from './gemini.provider';

export interface AssistantContext {
  assetId?: string;
  siteId?: string;
  page?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

type AssistantResponse = {
  message: string;
  data?: any;
  toolName?: string;
  provider?: 'gemini';
  confidence?: number;
};

const ALLOWED_TOOLS = new Set([
  'searchAssets',
  'getAssetDetails',
  'getLastMaintenanceByAsset',
  'getTechnicianWorkHistory',
  'getOpenProblemReports',
  'getHighSeverityProblems',
  'getSiteMaintenanceSummary',
  'getRecentMaintenanceRecords',
  'generalAnswer',
]);

export class AssistantService {
  private tools: AssistantTools;
  private gemini: GeminiProvider;

  constructor(userId: string, userRole: Role) {
    this.tools = new AssistantTools(userId, userRole);

    const apiKey = process.env.GEMINI_API_KEY;
    const aiMode = process.env.AI_MODE;
    const aiProvider = process.env.AI_PROVIDER;

    console.log('AI CONFIG:', {
      aiMode,
      aiProvider,
      hasGeminiKey: !!apiKey,
      geminiModel: process.env.GEMINI_MODEL,
    });

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is missing. Assistant cannot run without Gemini.');
    }

    if (aiMode !== 'gemini' && aiProvider !== 'gemini') {
      throw new Error('AI_MODE or AI_PROVIDER must be set to gemini.');
    }

    this.gemini = new GeminiProvider(apiKey);
  }

  async processMessage(
    message: string,
    context?: AssistantContext,
    history?: ConversationMessage[]
  ): Promise<AssistantResponse> {
    const cleanMessage = message?.trim();

    if (!cleanMessage) {
      return {
        message: 'من فضلك اكتب سؤالك.',
        provider: 'gemini',
      };
    }

    const mathAnswer = this.trySolveSimpleMath(cleanMessage);

    if (mathAnswer) {
      return {
        message: mathAnswer,
        toolName: 'generalAnswer',
        provider: 'gemini',
      };
    }

    try {
      return await this.processWithGemini(cleanMessage, context, history);
    } catch (error) {
      console.error('Gemini assistant failed:', error);

      return {
        message:
          'حدث خطأ أثناء الاتصال بالذكاء الاصطناعي. تأكد من إعداد Gemini API Key وأن الخدمة تعمل بشكل صحيح.',
        toolName: 'generalAnswer',
        provider: 'gemini',
      };
    }
  }

  private async processWithGemini(
    message: string,
    context?: AssistantContext,
    history?: ConversationMessage[]
  ): Promise<AssistantResponse> {
    const intent = await this.gemini.classifyIntent(message, context);

    console.log('Gemini intent:', intent);

    if (!this.isValidIntent(intent)) {
      const answer = await this.gemini.generateGeneralAnswer(message, history);

      return {
        message: answer,
        toolName: 'generalAnswer',
        provider: 'gemini',
        confidence: intent?.confidence,
      };
    }

    if (intent.toolName === 'generalAnswer') {
      const answer = await this.gemini.generateGeneralAnswer(message, history);

      return {
        message: answer,
        toolName: 'generalAnswer',
        provider: 'gemini',
        confidence: intent.confidence,
      };
    }

    const toolData = await this.executeTool(
      intent.toolName,
      intent.toolInput || {},
      context,
      message
    );

    const answer = await this.gemini.generateFinalAnswer(
      message,
      intent.toolName,
      toolData,
      history
    );

    return {
      message: answer,
      data: toolData,
      toolName: intent.toolName,
      provider: 'gemini',
      confidence: intent.confidence,
    };
  }

  private isValidIntent(intent: GeminiIntent | null): intent is GeminiIntent {
    return !!intent?.toolName && ALLOWED_TOOLS.has(intent.toolName);
  }

  private async executeTool(
    toolName: string,
    input: Record<string, any>,
    context?: AssistantContext,
    originalMessage?: string
  ) {
    switch (toolName) {
      case 'getRecentMaintenanceRecords': {
        const limit =
          Number(input.limit) ||
          this.extractNumber(originalMessage || '') ||
          10;

        return this.tools.getRecentMaintenanceRecords(limit);
      }

      case 'searchAssets':
        return this.tools.searchAssets(input || {});

      case 'getAssetDetails': {
        const assetId = input.assetId || context?.assetId;

        if (assetId) {
          return this.tools.getAssetDetails(assetId);
        }

        return { message: 'من فضلك حدد الأصل المطلوب.' };
      }

      case 'getLastMaintenanceByAsset': {
        const assetId = input.assetId || context?.assetId;

        if (assetId) {
          return this.tools.getLastMaintenanceByAsset(assetId);
        }

        return { message: 'من فضلك حدد الأصل المطلوب.' };
      }

      case 'getTechnicianWorkHistory':
        return this.tools.getTechnicianWorkHistory(input.name);

      case 'getOpenProblemReports':
        return this.tools.getOpenProblemReports();

      case 'getHighSeverityProblems':
        return this.tools.getHighSeverityProblems();

      case 'getSiteMaintenanceSummary':
        return this.tools.getSiteMaintenanceSummary(input.siteName || '');

      default:
        throw new Error(`No matching tool found for: ${toolName}`);
    }
  }

  private trySolveSimpleMath(message: string): string | null {
    const clean = message.replace(/[^\d+\-*/().]/g, '');

    if (!/[+\-*/]/.test(clean)) return null;

    try {
      const result = Function(`return (${clean})`)();
      return `${clean} = ${result}`;
    } catch {
      return null;
    }
  }

  private extractNumber(value: string): number | null {
    const match = value.match(/\d+/);
    return match ? Number(match[0]) : null;
  }
}