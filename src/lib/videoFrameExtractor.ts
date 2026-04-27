// src/lib/videoFrameExtractor.ts
//
// Extracts JPEG frames from a video buffer using ffmpeg (fluent-ffmpeg).
// ffmpeg must be installed on the server.
//
// On Vercel: install ffmpeg-static and set the binary path.
//   npm install fluent-ffmpeg ffmpeg-static
//
// On other servers: ensure `ffmpeg` is in PATH.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);

/**
 * Given a video Buffer, extracts up to `maxFrames` JPEG frames evenly
 * distributed across the video duration.
 *
 * Returns an array of base64-encoded JPEG strings.
 */
export async function extractFrames(
  videoBuffer: Buffer,
  maxFrames = 6,
): Promise<string[]> {
  // Write video to a temp file
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vframe-'));
  const inputPath = path.join(tmpDir, 'input.mp4');
  const outputPattern = path.join(tmpDir, 'frame_%03d.jpg');

  try {
    await writeFile(inputPath, videoBuffer);

    // Try to import fluent-ffmpeg (optional peer dep)
    let ffmpeg: any;
    try {
      ffmpeg = (await import('fluent-ffmpeg')).default;

      // Use ffmpeg-static binary if available
      try {
        const ffmpegStatic = await import('ffmpeg-static');
        ffmpeg.setFfmpegPath(ffmpegStatic.default ?? ffmpegStatic);
      } catch {
        // Use system ffmpeg
      }
    } catch {
      console.warn('[videoFrameExtractor] fluent-ffmpeg not installed. Returning empty frames.');
      return [];
    }

    // Extract frames using fps filter to get evenly distributed frames
    // fps=1/T means 1 frame every T seconds — we approximate based on maxFrames
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          `-vf fps=1/2`,      // 1 frame every 2 seconds
          `-frames:v ${maxFrames}`,
          '-q:v 3',           // JPEG quality (1=best, 31=worst)
        ])
        .output(outputPattern)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Read all extracted frames
    const files = (await readdir(tmpDir))
      .filter((f) => f.endsWith('.jpg'))
      .sort()
      .slice(0, maxFrames);

    const frames: string[] = [];
    for (const file of files) {
      const buf = await readFile(path.join(tmpDir, file));
      frames.push(buf.toString('base64'));
    }

    return frames;
  } finally {
    // Cleanup temp directory
    try {
      const files = await readdir(tmpDir);
      await Promise.all(files.map((f) => unlink(path.join(tmpDir, f))));
      await fs.promises.rmdir(tmpDir);
    } catch {
      // Best effort cleanup
    }
  }
}

/**
 * Fetch a video from a URL and extract frames.
 * Used when the mobile app uploads to Cloudinary first,
 * then the backend fetches for analysis.
 */
export async function extractFramesFromUrl(
  videoUrl: string,
  maxFrames = 6,
): Promise<string[]> {
  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch video: ${res.status}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return extractFrames(Buffer.from(arrayBuf), maxFrames);
}