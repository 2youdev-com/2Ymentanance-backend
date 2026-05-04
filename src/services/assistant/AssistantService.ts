import { AssistantTools } from './AssistantTools';
import { Role } from '@prisma/client';
import { DeepSeekProvider, DeepSeekIntent } from './Deepseek.provider';

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
  provider?: 'deepseek';
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
  'getDashboardStats',
  'getAssetsByStatus',
  'getAssetsByType',
  'getMaintenanceByDateRange',
  'getTechnicianPerformance',
  'getChecklistSummary',
  'generalAnswer',
]);

export class AssistantService {
  private tools: AssistantTools;
  private deepseek: DeepSeekProvider;

  constructor(userId: string, userRole: Role) {
    this.tools = new AssistantTools(userId, userRole);

    const apiKey = process.env.DEEPSEEK_API_KEY;

    console.log('AI CONFIG:', {
      provider: 'deepseek',
      hasDeepSeekKey: !!apiKey,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    });

    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is missing. Assistant cannot run without DeepSeek.');
    }

    this.deepseek = new DeepSeekProvider(apiKey);
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
        provider: 'deepseek',
      };
    }

    try {
      return await this.processWithDeepSeek(cleanMessage, context, history);
    } catch (error) {
      console.error('DeepSeek assistant failed:', error);

      return {
        message: 'حدث خطأ أثناء الاتصال بالذكاء الاصطناعي. تأكد من إعداد DeepSeek API Key وأن الخدمة تعمل بشكل صحيح.',
        toolName: 'generalAnswer',
        provider: 'deepseek',
      };
    }
  }

  private async processWithDeepSeek(
    message: string,
    context?: AssistantContext,
    history?: ConversationMessage[]
  ): Promise<AssistantResponse> {
    const intent = await this.deepseek.classifyIntent(message, context);

    console.log('DeepSeek intent:', intent);

    if (!this.isValidIntent(intent)) {
      const answer = await this.deepseek.generateGeneralAnswer(message, history);

      return {
        message: answer,
        toolName: 'generalAnswer',
        provider: 'deepseek',
        confidence: (intent as any)?.confidence,
      };
    }

    if (intent.toolName === 'generalAnswer') {
      const answer = await this.deepseek.generateGeneralAnswer(message, history);

      return {
        message: answer,
        toolName: 'generalAnswer',
        provider: 'deepseek',
        confidence: intent.confidence,
      };
    }

    const toolData = await this.executeTool(intent.toolName, intent.toolInput || {}, context, message);

    const answer = await this.deepseek.generateFinalAnswer(message, intent.toolName, toolData, history);

    return {
      message: answer,
      data: toolData,
      toolName: intent.toolName,
      provider: 'deepseek',
      confidence: intent.confidence,
    };
  }

  private isValidIntent(intent: DeepSeekIntent | null): intent is DeepSeekIntent {
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
        const limit = Number(input.limit) || this.extractNumber(originalMessage || '') || 10;
        return this.tools.getRecentMaintenanceRecords(limit);
      }

      case 'searchAssets':
        return this.tools.searchAssets(input || {});

      case 'getAssetDetails': {
        const assetId = input.assetId || context?.assetId;
        if (assetId) return this.tools.getAssetDetails(assetId);
        return { message: 'من فضلك حدد الأصل المطلوب.' };
      }

      case 'getLastMaintenanceByAsset': {
        const assetId = input.assetId || context?.assetId;
        if (assetId) return this.tools.getLastMaintenanceByAsset(assetId);
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

      // ─── New Tools ────────────────────────────────────────────────────────

      case 'getDashboardStats':
        return this.tools.getDashboardStats();

      case 'getAssetsByStatus':
        return this.tools.getAssetsByStatus();

      case 'getAssetsByType':
        return this.tools.getAssetsByType();

      case 'getMaintenanceByDateRange':
        return this.tools.getMaintenanceByDateRange(input.fromDate, input.toDate, input.limit);

      case 'getTechnicianPerformance':
        return this.tools.getTechnicianPerformance(input.name);

      case 'getChecklistSummary':
        return this.tools.getChecklistSummary();

      default:
        throw new Error(`No matching tool found for: ${toolName}`);
    }
  }

  private extractNumber(value: string): number | null {
    const match = value.match(/\d+/);
    return match ? Number(match[0]) : null;
  }
}