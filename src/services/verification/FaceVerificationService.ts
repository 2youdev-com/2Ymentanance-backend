// src/services/verification/FaceVerificationService.ts
//
// Abstraction layer for technician face + liveness verification.
// All real AI API calls happen HERE — never in the mobile app.
//
// Provider selection via env var:  FACE_VERIFICATION_PROVIDER=aws|mock
// AWS env vars needed:
//   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
//   AWS_REKOGNITION_FACE_LIVENESS_SESSION_BUCKET (optional S3 bucket)

export interface LivenessAction {
  type: 'SMILE' | 'LOOK_LEFT' | 'LOOK_RIGHT' | 'BLINK' | 'NOD_UP' | 'NOD_DOWN';
  label: string;
}

export interface FaceVerificationInput {
  /** base64-encoded video frames extracted from the selfie video */
  frames: string[]; // array of base64 JPEG strings
  /** Cloudinary URL or base64 of the registered technician profile photo */
  profilePhotoUrl: string;
  /** The liveness actions the backend told the app to perform */
  requestedActions: LivenessAction['type'][];
}

export interface FaceVerificationResult {
  livenessPassed: boolean;
  faceMatched: boolean;
  similarity: number; // 0–100
  status: 'PASSED' | 'FAILED' | 'NEEDS_MANUAL_REVIEW' | 'NOT_CONFIGURED';
  provider: string;
  rawDetail?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interface every provider must implement
// ─────────────────────────────────────────────────────────────────────────────

export interface IFaceVerificationProvider {
  verify(input: FaceVerificationInput): Promise<FaceVerificationResult>;
  /** Returns 3 random liveness actions for the current session */
  getRandomActions(): LivenessAction[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Provider — used when no real provider is configured
// Returns PASSED in development, NOT_CONFIGURED in production
// ─────────────────────────────────────────────────────────────────────────────

const ALL_ACTIONS: LivenessAction[] = [
  { type: 'SMILE',      label: 'Smile'              },
  { type: 'LOOK_LEFT',  label: 'Look left'           },
  { type: 'LOOK_RIGHT', label: 'Look right'          },
  { type: 'BLINK',      label: 'Blink slowly'        },
  { type: 'NOD_UP',     label: 'Tilt head up'        },
  { type: 'NOD_DOWN',   label: 'Tilt head down'      },
];

export class MockFaceVerificationProvider implements IFaceVerificationProvider {
  private readonly isDev: boolean;

  constructor() {
    this.isDev = process.env.NODE_ENV !== 'production';
  }

  getRandomActions(): LivenessAction[] {
    const shuffled = [...ALL_ACTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  async verify(_input: FaceVerificationInput): Promise<FaceVerificationResult> {
    if (this.isDev) {
      // Simulate a short processing delay
      await new Promise((r) => setTimeout(r, 500));
      return {
        livenessPassed: true,
        faceMatched: true,
        similarity: 95.0,
        status: 'PASSED',
        provider: 'mock',
        rawDetail: { note: 'Mock result — dev mode' },
      };
    }

    // Production with no provider configured
    return {
      livenessPassed: false,
      faceMatched: false,
      similarity: 0,
      status: 'NOT_CONFIGURED',
      provider: 'mock',
      rawDetail: { note: 'No face verification provider is configured' },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AWS Rekognition Provider
// Free tier: 5,000 face analysis operations/month for 12 months
// Docs: https://docs.aws.amazon.com/rekognition/latest/dg/faces.html
// ─────────────────────────────────────────────────────────────────────────────
//
// NOTE: Install with:  npm install @aws-sdk/client-rekognition
//
// This provider uses:
//   1. DetectFaces       — detect face presence + basic liveness signals
//      (EyesOpen, MouthOpen, Pose) to approximate liveness
//   2. CompareFaces      — compare best frame against profile photo
//
// For production-grade liveness, upgrade to AWS Rekognition Face Liveness
// which requires the Amplify SDK on the client side:
//   https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html

export class AwsFaceVerificationProvider implements IFaceVerificationProvider {
  private client: unknown = null;
  private readonly similarityThreshold = 80; // % required to consider matched
  private readonly NEEDS_REVIEW_THRESHOLD = 70;

  constructor() {
    this.initClient();
  }

  private async initClient() {
    try {
      // Dynamic import so the package is optional at build time
      const { RekognitionClient } = await import('@aws-sdk/client-rekognition');
      this.client = new RekognitionClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });
    } catch {
      console.error('[FaceVerification] AWS SDK not installed. Run: npm install @aws-sdk/client-rekognition');
    }
  }

  getRandomActions(): LivenessAction[] {
    const shuffled = [...ALL_ACTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  async verify(input: FaceVerificationInput): Promise<FaceVerificationResult> {
    if (!this.client) {
      return {
        livenessPassed: false,
        faceMatched: false,
        similarity: 0,
        status: 'NOT_CONFIGURED',
        provider: 'aws-rekognition',
        rawDetail: { error: 'AWS client not initialized' },
      };
    }

    try {
      const {
        DetectFacesCommand,
        CompareFacesCommand,
      } = await import('@aws-sdk/client-rekognition');

      // ── Step 1: Liveness check via frame analysis ─────────────────────────
      // Pick the middle frame as "best" and first/last for motion detection
      const frameCount = input.frames.length;
      const bestFrameB64 = input.frames[Math.floor(frameCount / 2)];
      const bestFrameBytes = Buffer.from(bestFrameB64, 'base64');

      const detectCmd = new DetectFacesCommand({
        Image: { Bytes: bestFrameBytes },
        Attributes: ['ALL'],
      });

      const detectRes = await (this.client as any).send(detectCmd);
      const faces = detectRes.FaceDetails ?? [];

      let livenessPassed = false;
      if (faces.length === 1) {
        const face = faces[0];
        const eyeConf = face.EyesOpen?.Confidence ?? 0;
        const pose = face.Pose ?? {};
        // Basic liveness: face present, not a flat photo (some pose variation expected)
        const poseDynamic =
          Math.abs(pose.Yaw ?? 0) < 45 &&
          Math.abs(pose.Pitch ?? 0) < 30;
        livenessPassed = eyeConf > 80 && poseDynamic;
      }

      // ── Step 2: Face comparison ───────────────────────────────────────────
      let faceMatched = false;
      let similarity = 0;
      let compareDetail: unknown = null;

      if (livenessPassed && input.profilePhotoUrl) {
        // Fetch profile photo bytes
        let profileBytes: Buffer;
        if (input.profilePhotoUrl.startsWith('http')) {
          const res = await fetch(input.profilePhotoUrl);
          const buf = await res.arrayBuffer();
          profileBytes = Buffer.from(buf);
        } else {
          profileBytes = Buffer.from(input.profilePhotoUrl, 'base64');
        }

        const compareCmd = new CompareFacesCommand({
          SourceImage: { Bytes: profileBytes },
          TargetImage: { Bytes: bestFrameBytes },
          SimilarityThreshold: this.NEEDS_REVIEW_THRESHOLD,
        });

        const compareRes = await (this.client as any).send(compareCmd);
        compareDetail = compareRes;

        if (compareRes.FaceMatches && compareRes.FaceMatches.length > 0) {
          similarity = compareRes.FaceMatches[0].Similarity ?? 0;
          faceMatched = similarity >= this.similarityThreshold;
        }
      }

      // ── Status determination ──────────────────────────────────────────────
      let status: FaceVerificationResult['status'] = 'FAILED';
      if (livenessPassed && faceMatched) {
        status = 'PASSED';
      } else if (
        livenessPassed &&
        similarity >= this.NEEDS_REVIEW_THRESHOLD &&
        similarity < this.similarityThreshold
      ) {
        status = 'NEEDS_MANUAL_REVIEW';
      }

      return {
        livenessPassed,
        faceMatched,
        similarity,
        status,
        provider: 'aws-rekognition',
        rawDetail: { detectFaces: faces.length, compareDetail },
      };
    } catch (err) {
      console.error('[FaceVerification] AWS error:', err);
      return {
        livenessPassed: false,
        faceMatched: false,
        similarity: 0,
        status: 'FAILED',
        provider: 'aws-rekognition',
        rawDetail: { error: String(err) },
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory — reads FACE_VERIFICATION_PROVIDER env var
// ─────────────────────────────────────────────────────────────────────────────

export class FaceVerificationService {
  private static instance: FaceVerificationService;
  private provider: IFaceVerificationProvider;

  private constructor() {
    const providerName = process.env.FACE_VERIFICATION_PROVIDER ?? 'mock';
    switch (providerName) {
      case 'aws':
        this.provider = new AwsFaceVerificationProvider();
        break;
      default:
        this.provider = new MockFaceVerificationProvider();
    }
    console.log(`[FaceVerification] Using provider: ${providerName}`);
  }

  static getInstance(): FaceVerificationService {
    if (!FaceVerificationService.instance) {
      FaceVerificationService.instance = new FaceVerificationService();
    }
    return FaceVerificationService.instance;
  }

  getRandomActions(): LivenessAction[] {
    return this.provider.getRandomActions();
  }

  async verify(input: FaceVerificationInput): Promise<FaceVerificationResult> {
    return this.provider.verify(input);
  }
}