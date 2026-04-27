// src/services/verification/AssetVerificationService.ts
//
// Abstraction layer for asset video verification.
// Handles: QR extraction, OCR (serial/asset number), visual similarity.
//
// Provider env vars:
//   ASSET_VERIFICATION_PROVIDER=mock|azure|aws
//
//   Azure Computer Vision (free tier: 5,000 OCR calls/month):
//     AZURE_CV_ENDPOINT=https://<region>.api.cognitive.microsoft.com
//     AZURE_CV_KEY=<your-key>
//
//   AWS Textract (free tier: 1,000 pages/month for 3 months):
//     AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
//
// QR decoding:
//   Backend QR decoding uses `jimp` + `@zxing/library` (free, no key needed).
//   Install: npm install jimp @zxing/library

import { prisma } from '../../config/database';

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export interface AssetVerificationInput {
  /** base64-encoded frames extracted from the asset video */
  frames: string[];
  /** The asset ID that was scanned via QR before maintenance started */
  expectedAssetId: string;
  /** Expected values loaded from the database */
  expectedData: {
    qrUuid: string;
    serialNumber: string;
    assetNumber: string;
    assetType: string;
    model: string;
    photoUrl?: string | null;
  };
}

export interface AssetVerificationResult {
  qrMatch: boolean;
  serialNumberMatch: boolean;
  assetNumberMatch: boolean;
  assetTypeMatch: boolean;
  visualMatch: boolean;
  confidence: number; // 0–1
  status: 'PASSED' | 'FAILED' | 'NEEDS_MANUAL_REVIEW' | 'NOT_CONFIGURED';
  provider: string;
  extractedQr?: string;
  extractedText?: string;
  rawDetail?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// QR Extraction Service (no API key needed — pure JS)
// ─────────────────────────────────────────────────────────────────────────────

export class QrExtractionService {
  /** Tries to decode a QR code from a base64 JPEG frame */
  async extractFromFrame(frameBase64: string): Promise<string | null> {
    try {
      // Dynamic imports — optional peer deps
      const Jimp = (await import('jimp')).default;
      const { BrowserQRCodeReader } = await import('@zxing/browser');

      const imageBuffer = Buffer.from(frameBase64, 'base64');
      const jimpImage = await (Jimp as any).read(imageBuffer);
      const { data, width, height } = jimpImage.bitmap;

      // Convert to luminance array for ZXing
      const luminanceSource = new Uint8ClampedArray(width * height);
      for (let i = 0; i < width * height; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        luminanceSource[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      }

      // Use the @zxing/library decode
      const { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, QRCodeReader } =
        await import('@zxing/library');

      const lumSrc = new RGBLuminanceSource(
        luminanceSource as unknown as Int32Array,
        width,
        height,
      );
      const bitmap = new BinaryBitmap(new HybridBinarizer(lumSrc));
      const reader = new QRCodeReader();
      const result = reader.decode(bitmap);
      return result.getText();
    } catch {
      return null;
    }
  }

  /** Try multiple frames, return first successful QR decode */
  async extractFromFrames(frames: string[]): Promise<string | null> {
    for (const frame of frames) {
      const result = await this.extractFromFrame(frame);
      if (result) return result;
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OCR Service Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface IOcrProvider {
  extractText(frameBase64: string): Promise<string>;
}

// Mock OCR
export class MockOcrProvider implements IOcrProvider {
  async extractText(_frameBase64: string): Promise<string> {
    return ''; // Mock returns nothing; matching will fall through to NEEDS_MANUAL_REVIEW
  }
}

// Azure Computer Vision OCR (Read API v3.2)
// Free tier: 5,000 transactions/month — https://azure.microsoft.com/free/
export class AzureOcrProvider implements IOcrProvider {
  private readonly endpoint: string;
  private readonly key: string;

  constructor() {
    this.endpoint = process.env.AZURE_CV_ENDPOINT ?? '';
    this.key = process.env.AZURE_CV_KEY ?? '';
  }

  async extractText(frameBase64: string): Promise<string> {
    if (!this.endpoint || !this.key) return '';

    // Azure Read API: submit image
    const submitUrl = `${this.endpoint}/vision/v3.2/read/analyze`;
    const imageBytes = Buffer.from(frameBase64, 'base64');

    const submitRes = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.key,
        'Content-Type': 'application/octet-stream',
      },
      body: imageBytes,
    });

    if (!submitRes.ok) return '';

    const operationUrl = submitRes.headers.get('Operation-Location');
    if (!operationUrl) return '';

    // Poll for result
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(operationUrl, {
        headers: { 'Ocp-Apim-Subscription-Key': this.key },
      });
      const pollData = (await pollRes.json()) as any;

      if (pollData.status === 'succeeded') {
        const lines: string[] = [];
        for (const page of pollData.analyzeResult?.readResults ?? []) {
          for (const line of page.lines ?? []) {
            lines.push(line.text);
          }
        }
        return lines.join('\n').toUpperCase();
      }
      if (pollData.status === 'failed') break;
    }
    return '';
  }
}

// AWS Textract OCR (free tier: 1,000 pages/month for 3 months)
export class AwsTextractProvider implements IOcrProvider {
  async extractText(frameBase64: string): Promise<string> {
    try {
      const { TextractClient, DetectDocumentTextCommand } = await import(
        '@aws-sdk/client-textract'
      );

      const client = new TextractClient({
        region: process.env.AWS_REGION ?? 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });

      const res = await client.send(
        new DetectDocumentTextCommand({
          Document: { Bytes: Buffer.from(frameBase64, 'base64') },
        }),
      );

      const lines = (res.Blocks ?? [])
        .filter((b: any) => b.BlockType === 'LINE')
        .map((b: any) => b.Text ?? '');

      return lines.join('\n').toUpperCase();
    } catch {
      return '';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OcrService factory
// ─────────────────────────────────────────────────────────────────────────────

export class OcrService {
  private static instance: OcrService;
  private provider: IOcrProvider;

  private constructor() {
    const p = process.env.ASSET_VERIFICATION_PROVIDER ?? 'mock';
    if (p === 'azure') {
      this.provider = new AzureOcrProvider();
    } else if (p === 'aws') {
      this.provider = new AwsTextractProvider();
    } else {
      this.provider = new MockOcrProvider();
    }
  }

  static getInstance(): OcrService {
    if (!OcrService.instance) OcrService.instance = new OcrService();
    return OcrService.instance;
  }

  /** Try OCR on all frames and return the accumulated text */
  async extractFromFrames(frames: string[]): Promise<string> {
    const results: string[] = [];
    // Only process every other frame to reduce API calls
    const sampled = frames.filter((_, i) => i % 2 === 0).slice(0, 4);
    for (const frame of sampled) {
      const text = await this.provider.extractText(frame);
      if (text) results.push(text);
    }
    return results.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AssetVisualMatchingService — compare video frame vs stored asset photo
// Uses AWS Rekognition CompareFaces as a rough visual similarity proxy.
// For non-face assets, this is best-effort only.
// ─────────────────────────────────────────────────────────────────────────────

export class AssetVisualMatchingService {
  async compare(
    frameBase64: string,
    referencePhotoUrl: string,
  ): Promise<{ match: boolean; confidence: number }> {
    const provider = process.env.ASSET_VERIFICATION_PROVIDER ?? 'mock';

    if (provider === 'aws') {
      try {
        const { RekognitionClient, CompareFacesCommand } = await import(
          '@aws-sdk/client-rekognition'
        );
        const client = new RekognitionClient({
          region: process.env.AWS_REGION ?? 'us-east-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        });

        const refRes = await fetch(referencePhotoUrl);
        const refBuf = Buffer.from(await refRes.arrayBuffer());

        // Note: CompareFaces is designed for faces, but for assets we use it
        // only as supporting evidence. A purpose-built embedding model is better.
        const cmd = new CompareFacesCommand({
          SourceImage: { Bytes: refBuf },
          TargetImage: { Bytes: Buffer.from(frameBase64, 'base64') },
          SimilarityThreshold: 50,
        });
        const res = await client.send(cmd);
        const similarity = res.FaceMatches?.[0]?.Similarity ?? 0;
        return { match: similarity >= 70, confidence: similarity / 100 };
      } catch {
        return { match: false, confidence: 0 };
      }
    }

    // Mock: always return moderate confidence
    return { match: true, confidence: 0.8 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AssetVerificationService — orchestrates all checks
// ─────────────────────────────────────────────────────────────────────────────

export class AssetVerificationService {
  private static instance: AssetVerificationService;

  private qrService = new QrExtractionService();
  private ocrService = OcrService.getInstance();
  private visualService = new AssetVisualMatchingService();

  static getInstance(): AssetVerificationService {
    if (!AssetVerificationService.instance) {
      AssetVerificationService.instance = new AssetVerificationService();
    }
    return AssetVerificationService.instance;
  }

  async verify(input: AssetVerificationInput): Promise<AssetVerificationResult> {
    const provider = process.env.ASSET_VERIFICATION_PROVIDER ?? 'mock';
    const { expectedData, frames } = input;

    if (provider === 'mock') {
      return {
        qrMatch: true,
        serialNumberMatch: true,
        assetNumberMatch: true,
        assetTypeMatch: true,
        visualMatch: true,
        confidence: 0.9,
        status: 'PASSED',
        provider: 'mock',
        extractedQr: expectedData.qrUuid,
        extractedText: 'MOCK OCR OUTPUT',
        rawDetail: { note: 'Mock result' },
      };
    }

    // ── 1. QR Check (strongest signal) ───────────────────────────────────────
    const extractedQr = await this.qrService.extractFromFrames(frames);
    const qrMatch = extractedQr != null && extractedQr === expectedData.qrUuid;

    // ── 2. OCR text extraction ────────────────────────────────────────────────
    const ocrText = await this.ocrService.extractFromFrames(frames);
    const extractedText = ocrText;

    // Normalize for matching (upper-case, trim spaces)
    const norm = (s: string) => s.toUpperCase().replace(/\s+/g, '');
    const ocrNorm = norm(ocrText);

    const serialNumberMatch =
      ocrText.length > 0
        ? ocrNorm.includes(norm(expectedData.serialNumber))
        : false;

    const assetNumberMatch =
      ocrText.length > 0
        ? ocrNorm.includes(norm(expectedData.assetNumber))
        : false;

    // Asset type check: look for the type keyword in OCR text
    const assetTypeMatch =
      ocrText.length > 0
        ? ocrNorm.includes(norm(expectedData.assetType.replace(/_/g, ' '))) ||
          ocrNorm.includes(norm(expectedData.model))
        : false;

    // ── 3. Visual similarity (supporting evidence only) ───────────────────────
    let visualMatch = false;
    let confidence = 0;

    if (expectedData.photoUrl && frames.length > 0) {
      const bestFrame = frames[Math.floor(frames.length / 2)];
      const visual = await this.visualService.compare(
        bestFrame,
        expectedData.photoUrl,
      );
      visualMatch = visual.match;
      confidence = visual.confidence;
    }

    // ── 4. Determine overall status ───────────────────────────────────────────
    // Core checks: QR + serial + asset number
    // Visual/type are supporting evidence

    const coreScore = [qrMatch, serialNumberMatch, assetNumberMatch].filter(
      Boolean,
    ).length;

    let status: AssetVerificationResult['status'];

    if (qrMatch && (serialNumberMatch || assetNumberMatch)) {
      status = 'PASSED';
    } else if (qrMatch && !serialNumberMatch && !assetNumberMatch) {
      // QR matched but OCR found nothing — might be OCR failure, not fraud
      status = ocrText.length === 0 ? 'NEEDS_MANUAL_REVIEW' : 'FAILED';
    } else if (coreScore >= 2) {
      status = 'NEEDS_MANUAL_REVIEW';
    } else {
      status = 'FAILED';
    }



    return {
      qrMatch,
      serialNumberMatch,
      assetNumberMatch,
      assetTypeMatch,
      visualMatch,
      confidence,
      status,
      provider,
      extractedQr: extractedQr ?? undefined,
      extractedText,
      rawDetail: { coreScore, ocrLength: ocrText.length },
    };
  }
}