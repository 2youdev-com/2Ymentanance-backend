// ─────────────────────────────────────────────────────────────────────────────
// ADD THIS to your main Express app file (e.g. src/index.ts or src/app.ts)
// ─────────────────────────────────────────────────────────────────────────────
//
// import verificationRouter from './routes/verification';
// app.use('/api/verification', verificationRouter);
//
// ─────────────────────────────────────────────────────────────────────────────
// ALSO update the maintenance route to include verification data in responses:
// ─────────────────────────────────────────────────────────────────────────────
//
// In your existing GET /api/maintenance/:id (or wherever you return MaintenanceLog),
// add these fields to the select/include:
//
//   technicianVerification: true,
//   assetVerification:      true,
//
// ─────────────────────────────────────────────────────────────────────────────
// ENV VARS TO ADD TO .env / Vercel environment:
// ─────────────────────────────────────────────────────────────────────────────
//
// # Verification providers: mock | aws | azure
// FACE_VERIFICATION_PROVIDER=mock
// ASSET_VERIFICATION_PROVIDER=mock
//
// # AWS (free tier 12 months — https://aws.amazon.com/free/)
// # Rekognition: 5,000 face analysis calls/month
// # Textract:    1,000 pages/month for 3 months
// AWS_REGION=us-east-1
// AWS_ACCESS_KEY_ID=
// AWS_SECRET_ACCESS_KEY=
//
// # Azure Computer Vision (free tier: 5,000 OCR calls/month)
// # https://azure.microsoft.com/en-us/free/
// AZURE_CV_ENDPOINT=https://<region>.api.cognitive.microsoft.com
// AZURE_CV_KEY=
//
// ─────────────────────────────────────────────────────────────────────────────
// NEW npm PACKAGES NEEDED:
// ─────────────────────────────────────────────────────────────────────────────
//
// # AWS Rekognition + Textract (install only if using aws provider)
// npm install @aws-sdk/client-rekognition @aws-sdk/client-textract
//
// # Azure OCR is done via fetch() — no extra package needed
//
// # Video frame extraction (optional — needed for server-side frame extraction)
// npm install fluent-ffmpeg ffmpeg-static
// npm install --save-dev @types/fluent-ffmpeg
//
// # QR code decoding from video frames
// npm install jimp @zxing/library @zxing/browser
//
// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION — run after updating prisma/schema.prisma:
// ─────────────────────────────────────────────────────────────────────────────
//
// npx prisma migrate dev --name add_verification_fields
// npx prisma generate
//
// ─────────────────────────────────────────────────────────────────────────────

export {};