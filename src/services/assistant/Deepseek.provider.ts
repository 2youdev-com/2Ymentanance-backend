import https from 'node:https';

export type DeepSeekIntent = {
  toolName:
    | 'searchAssets'
    | 'getAssetDetails'
    | 'getLastMaintenanceByAsset'
    | 'getTechnicianWorkHistory'
    | 'getOpenProblemReports'
    | 'getHighSeverityProblems'
    | 'getSiteMaintenanceSummary'
    | 'getRecentMaintenanceRecords'
    | 'getDashboardStats'
    | 'getAssetsByStatus'
    | 'getAssetsByType'
    | 'getMaintenanceByDateRange'
    | 'getTechnicianPerformance'
    | 'getChecklistSummary'
    | 'generalAnswer';
  toolInput?: Record<string, any>;
  confidence?: number;
};

export class DeepSeekProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    this.baseUrl = 'api.deepseek.com';
  }

  async classifyIntent(message: string, context?: any): Promise<DeepSeekIntent | null> {
    const systemPrompt = `You are an intent classifier for an Asset Maintenance dashboard.
Return ONLY valid JSON. No markdown. No explanation.

JSON shape:
{"toolName":"...", "toolInput":{}, "confidence":0.9}

Allowed tools and when to use them:
- searchAssets: search for assets by name, type, site, status, location
- getAssetDetails: get full details of a specific asset (needs assetId)
- getLastMaintenanceByAsset: last maintenance record for a specific asset (needs assetId)
- getTechnicianWorkHistory: work history for a technician (needs name or uses current user)
- getOpenProblemReports: all open/unresolved problem reports
- getHighSeverityProblems: critical/high severity unresolved problems
- getSiteMaintenanceSummary: maintenance stats for a site (needs siteName)
- getRecentMaintenanceRecords: recent maintenance logs (accepts limit number)
- getDashboardStats: overall dashboard statistics (total assets, problems, maintenance counts)
- getAssetsByStatus: count/list assets grouped by status (OPERATIONAL, NEEDS_MAINTENANCE, OUT_OF_SERVICE)
- getAssetsByType: count/list assets grouped by type
- getMaintenanceByDateRange: maintenance records filtered by date (needs fromDate and/or toDate in ISO format)
- getTechnicianPerformance: performance stats for all technicians (completed jobs, open problems)
- getChecklistSummary: checklist completion stats
- generalAnswer: greetings, questions about what the assistant can do, write/modify/delete actions (not supported)

Rules:
- Extract numbers from user message for limit (e.g. "last 30" => limit:30, default 10)
- Extract site name for getSiteMaintenanceSummary
- Extract technician name for getTechnicianWorkHistory and getTechnicianPerformance
- Extract asset ID from context if user asks "this asset" or "current asset"
- If user asks about stats, counts, overview, summary without site => getDashboardStats
- If user mentions status groups or breakdown => getAssetsByStatus
- If user asks about types or categories of assets => getAssetsByType
- If user mentions specific dates or date ranges => getMaintenanceByDateRange
- Create/update/delete/assign/resolve actions => generalAnswer (not supported)
- NEVER classify a message as generalAnswer just because it contains numbers or hyphens. Asset names like "AHU Floor 12 - 1" or "Elevator 012" are asset names, not math. Always try searchAssets first if the message looks like a name.

Current page context: ${JSON.stringify(context || {})}`;

    const userPrompt = `User message: "${message}"`;

    const text = await this.callApi([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], true);

    console.log('DeepSeek RAW intent:', text);
    return this.parseJson(text);
  }

  async generateFinalAnswer(
    userMessage: string,
    toolName: string,
    toolData: any,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const messages: any[] = [
      {
        role: 'system',
        content: `You are an AI assistant inside an Asset Maintenance dashboard called 2Ymentanance.
Answer in the same language as the user (Arabic or English).
Be concise, helpful, and professional.
Do not invent data. Only use what is provided in the tool result.
If the result is empty, say clearly that no records were found.
Format lists with bullet points when showing multiple items.
When showing dates, format them in a readable way.
When showing asset status: OPERATIONAL=يعمل بشكل طبيعي, NEEDS_MAINTENANCE=يحتاج صيانة, OUT_OF_SERVICE=خارج الخدمة.
When showing maintenance type: PREVENTIVE=صيانة وقائية, CORRECTIVE=صيانة تصحيحية, EMERGENCY=صيانة طارئة.
When showing problem severity: LOW=منخفض, MEDIUM=متوسط, HIGH=عالي, CRITICAL=حرج.`,
      },
    ];

    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory.map(m => ({ role: m.role, content: m.content })));
    }

    messages.push({
      role: 'user',
      content: `The user asked: "${userMessage}"

Tool used: ${toolName}
Tool result:
${JSON.stringify(toolData, null, 2)}

Now answer the user's question based on this data.`,
    });

    return this.callApi(messages);
  }

  async generateGeneralAnswer(
    userMessage: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const messages: any[] = [
      {
        role: 'system',
        content: `You are an AI assistant inside an Asset Maintenance dashboard called 2Ymentanance.
Answer in the same language as the user (Arabic or English).
You can answer general questions, greetings, simple math, and explain what you can do.

You can help users with:
- عرض سجلات الصيانة الأخيرة (getRecentMaintenanceRecords)
- البحث عن الأصول (searchAssets)
- تفاصيل أصل محدد (getAssetDetails)
- آخر صيانة لأصل (getLastMaintenanceByAsset)
- سجل عمل الفني (getTechnicianWorkHistory)
- تقارير المشاكل المفتوحة (getOpenProblemReports)
- المشاكل عالية الخطورة (getHighSeverityProblems)
- ملخص صيانة الموقع (getSiteMaintenanceSummary)
- إحصائيات الداشبورد الإجمالية (getDashboardStats)
- الأصول مصنفة حسب الحالة (getAssetsByStatus)
- الأصول مصنفة حسب النوع (getAssetsByType)
- سجلات الصيانة في فترة زمنية محددة (getMaintenanceByDateRange)
- أداء الفنيين (getTechnicianPerformance)
- ملخص قوائم المراجعة (getChecklistSummary)

Important: You are READ-ONLY. You cannot create, update, delete, or assign anything. If asked, explain politely.`,
      },
    ];

    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory.map(m => ({ role: m.role, content: m.content })));
    }

    messages.push({ role: 'user', content: userMessage });

    return this.callApi(messages);
  }

  private async callApi(
    messages: Array<{ role: string; content: string }>,
    jsonMode = false
  ): Promise<string> {
    const body: any = {
      model: this.model,
      messages,
      temperature: 0.2,
      max_tokens: 1024,
    };

    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await this.postJson('/chat/completions', body);

    const text = response?.choices?.[0]?.message?.content?.trim() || '';

    if (!text) {
      throw new Error('DeepSeek returned an empty response');
    }

    return text;
  }

  private postJson(path: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);

      const req = https.request(
        {
          hostname: this.baseUrl,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const json = JSON.parse(data || '{}');

              if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                reject(
                  new Error(
                    `DeepSeek API error ${res.statusCode}: ${JSON.stringify(json)}`
                  )
                );
                return;
              }

              resolve(json);
            } catch (error) {
              reject(error);
            }
          });
        }
      );

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  private parseJson(text: string): DeepSeekIntent | null {
    try {
      const cleaned = text
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const match = cleaned.match(/\{[\s\S]*\}/);

      if (!match) return null;

      return JSON.parse(match[0]);
    } catch (error) {
      console.error('Failed to parse DeepSeek JSON:', text);
      return null;
    }
  }
}