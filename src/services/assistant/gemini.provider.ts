import https from 'node:https';

export type GeminiIntent = {
  toolName:
    | 'searchAssets'
    | 'getAssetDetails'
    | 'getLastMaintenanceByAsset'
    | 'getTechnicianWorkHistory'
    | 'getOpenProblemReports'
    | 'getHighSeverityProblems'
    | 'getSiteMaintenanceSummary'
    | 'getRecentMaintenanceRecords'
    | 'generalAnswer';
  toolInput?: Record<string, any>;
  confidence?: number;
};

export class GeminiProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  }

  async classifyIntent(message: string, context?: any): Promise<GeminiIntent | null> {
    const prompt = `
You are an AI assistant for an Asset Maintenance dashboard.

Return ONLY valid JSON.
Do not use markdown.
Do not add explanations.

JSON shape:
{
  "toolName": "toolNameHere",
  "toolInput": {},
  "confidence": 0.9
}

Allowed tools:
searchAssets
getAssetDetails
getLastMaintenanceByAsset
getTechnicianWorkHistory
getOpenProblemReports
getHighSeverityProblems
getSiteMaintenanceSummary
getRecentMaintenanceRecords
generalAnswer

Rules:
- Simple math or general help => generalAnswer
- Maintenance records / repairs / صيانات / تصليحات / سجلات => getRecentMaintenanceRecords
- Extract numbers from the user message and use them as limit when asking for recent records.
- Critical/high severity problems / مشاكل حرجة / خطيرة => getHighSeverityProblems
- Open/unresolved problems / مشاكل مفتوحة / غير محلولة => getOpenProblemReports
- Assets needing maintenance / أصول تحتاج صيانة => searchAssets with {"status":"NEEDS_MAINTENANCE"}
- Site summary / ملخص الموقع => getSiteMaintenanceSummary, extract site name from user message into siteName field
- Technician work history / سجل الفني / عمل الفني => getTechnicianWorkHistory, extract technician name into name field
- Last technician / last maintenance for an asset => getLastMaintenanceByAsset
- Create/update/delete/assign/resolve actions => generalAnswer

Examples:
User: "2+2"
JSON: {"toolName":"generalAnswer","toolInput":{},"confidence":0.99}

User: "آخر 30 صيانة"
JSON: {"toolName":"getRecentMaintenanceRecords","toolInput":{"limit":30},"confidence":0.95}

User: "حصل فيهم صيانة asset ابعتلي اخر 30"
JSON: {"toolName":"getRecentMaintenanceRecords","toolInput":{"limit":30},"confidence":0.9}

User: "هات المشاكل الحرجة"
JSON: {"toolName":"getHighSeverityProblems","toolInput":{},"confidence":0.95}

User: "ملخص موقع القاهرة"
JSON: {"toolName":"getSiteMaintenanceSummary","toolInput":{"siteName":"القاهرة"},"confidence":0.9}

User: "سجل عمل المهندس أحمد"
JSON: {"toolName":"getTechnicianWorkHistory","toolInput":{"name":"أحمد"},"confidence":0.92}

Current context:
${JSON.stringify(context || {}, null, 2)}

User:
${message}
`;

    const text = await this.generateText(prompt, true);
    console.log('Gemini RAW:', text);
    return this.parseJson(text);
  }

  async generateFinalAnswer(
    userMessage: string,
    toolName: string,
    toolData: any,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const historyText = conversationHistory && conversationHistory.length > 0
      ? `\nPrevious conversation:\n${conversationHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}\n`
      : '';

    const prompt = `
You are an AI assistant inside an Asset Maintenance dashboard.
${historyText}
The user asked:
${userMessage}

The backend safely executed this tool:
${toolName}

Tool result:
${JSON.stringify(toolData, null, 2)}

Answer in the same language as the user.
Be concise and helpful.
Do not invent data.
If the result is empty, say that no records were found.
Format lists clearly with bullet points when showing multiple items.
`;

    return this.generateText(prompt);
  }

  async generateGeneralAnswer(
    userMessage: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const historyText = conversationHistory && conversationHistory.length > 0
      ? `\nPrevious conversation:\n${conversationHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}\n`
      : '';

    const prompt = `
You are an AI assistant inside an Asset Maintenance dashboard.
${historyText}
Answer the user's general question in the same language.
You can answer simple calculations and explain what you can do.

You can help with:
- Viewing maintenance records (getRecentMaintenanceRecords)
- Searching assets (searchAssets)
- Asset details (getAssetDetails)
- Last maintenance for an asset (getLastMaintenanceByAsset)
- Technician work history (getTechnicianWorkHistory)
- Open problem reports (getOpenProblemReports)
- High severity problems (getHighSeverityProblems)
- Site maintenance summary (getSiteMaintenanceSummary)

Important:
- Do not claim access to database data unless a backend tool was used.
- If the user asks to create/update/delete/assign/resolve anything, say this is not available yet.

User message:
${userMessage}
`;

    return this.generateText(prompt);
  }

  private async generateText(prompt: string, jsonMode = false): Promise<string> {
    const path = `/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const body: any = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    };

    if (jsonMode) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const response = await this.postJson(path, body);

    const text =
      response?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text || '')
        .join('\n')
        .trim() || '';

    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    return text;
  }

  private postJson(path: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);

      const req = https.request(
        {
          hostname: 'generativelanguage.googleapis.com',
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
                    `Gemini API error ${res.statusCode}: ${JSON.stringify(json)}`
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

  private parseJson(text: string): GeminiIntent | null {
    try {
      const cleaned = text
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const match = cleaned.match(/\{[\s\S]*\}/);

      if (!match) return null;

      return JSON.parse(match[0]);
    } catch (error) {
      console.error('Failed to parse Gemini JSON:', text);
      return null;
    }
  }
}
