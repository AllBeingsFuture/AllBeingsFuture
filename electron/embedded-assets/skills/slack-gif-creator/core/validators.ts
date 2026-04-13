#!/usr/bin/env npx tsx
/**
 * Validators - Check if GIFs meet Slack's requirements.
 *
 * These validators help ensure your GIFs meet Slack's size and dimension constraints.
 *
 * Uses the `sharp` npm package for reading GIF metadata.
 */

import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

interface ValidationResults {
  file: string;
  passes: boolean;
  width: number;
  height: number;
  size_kb: number;
  size_mb: number;
  frame_count: number;
  duration_seconds: number | null;
  fps: number | null;
  is_emoji: boolean;
  optimal: boolean | null;
  error?: string;
}

/**
 * Validate GIF for Slack (dimensions, size, frame count).
 *
 * @param gifPath - Path to GIF file
 * @param isEmoji - True for emoji (128x128 recommended), False for message GIF
 * @param verbose - Print validation details
 * @returns Tuple of [passes, results]
 */
export async function validateGif(
  gifPath: string,
  isEmoji: boolean = true,
  verbose: boolean = true
): Promise<[boolean, ValidationResults]> {
  const resolvedPath = path.resolve(gifPath);

  if (!fs.existsSync(resolvedPath)) {
    return [
      false,
      {
        file: resolvedPath,
        passes: false,
        width: 0,
        height: 0,
        size_kb: 0,
        size_mb: 0,
        frame_count: 0,
        duration_seconds: null,
        fps: null,
        is_emoji: isEmoji,
        optimal: null,
        error: `File not found: ${resolvedPath}`,
      },
    ];
  }

  // Get file size
  const stats = fs.statSync(resolvedPath);
  const sizeBytes = stats.size;
  const sizeKb = sizeBytes / 1024;
  const sizeMb = sizeKb / 1024;

  try {
    const metadata = await sharp(resolvedPath).metadata();
    const width = metadata.width || 0;
    const height = metadata.pageHeight || metadata.height || 0;
    const pages = metadata.pages || 1;

    // Calculate timing
    let totalDuration: number | null = null;
    let fps: number | null = null;

    // sharp reports delay in metadata for animated images
    if (metadata.delay && metadata.delay.length > 0) {
      const avgDelay =
        metadata.delay.reduce((a: number, b: number) => a + b, 0) /
        metadata.delay.length;
      totalDuration = (avgDelay * pages) / 1000;
      fps = totalDuration > 0 ? pages / totalDuration : null;
    }

    // Validate dimensions
    let dimPass: boolean;
    let optimal: boolean | null = null;

    if (isEmoji) {
      optimal = width === 128 && height === 128;
      const acceptable =
        width === height && width >= 64 && width <= 128;
      dimPass = acceptable;
    } else {
      const minDim = Math.min(width, height);
      const maxDim = Math.max(width, height);
      const aspectRatio = minDim > 0 ? maxDim / minDim : Infinity;
      dimPass = aspectRatio <= 2.0 && minDim >= 320 && minDim <= 640;
    }

    const results: ValidationResults = {
      file: resolvedPath,
      passes: dimPass,
      width,
      height,
      size_kb: sizeKb,
      size_mb: sizeMb,
      frame_count: pages,
      duration_seconds: totalDuration,
      fps,
      is_emoji: isEmoji,
      optimal,
    };

    if (verbose) {
      const basename = path.basename(resolvedPath);
      console.log(`\nValidating ${basename}:`);

      let dimInfo = `  Dimensions: ${width}x${height}`;
      if (isEmoji && (width === height && width >= 64 && width <= 128)) {
        dimInfo += ` (${optimal ? "optimal" : "acceptable"})`;
      }
      console.log(dimInfo);

      let sizeInfo = `  Size: ${sizeKb.toFixed(1)} KB`;
      if (sizeMb >= 1.0) {
        sizeInfo += ` (${sizeMb.toFixed(2)} MB)`;
      }
      console.log(sizeInfo);

      let frameInfo = `  Frames: ${pages}`;
      if (fps) {
        frameInfo += ` @ ${fps.toFixed(1)} fps (${totalDuration?.toFixed(1)}s)`;
      }
      console.log(frameInfo);

      if (!dimPass) {
        console.log(
          `  Note: ${isEmoji ? "Emoji should be 128x128" : "Unusual dimensions for Slack"}`
        );
      }

      if (sizeMb > 5.0) {
        console.log(
          `  Note: Large file size - consider fewer frames/colors`
        );
      }
    }

    return [dimPass, results];
  } catch (e) {
    return [
      false,
      {
        file: resolvedPath,
        passes: false,
        width: 0,
        height: 0,
        size_kb: sizeKb,
        size_mb: sizeMb,
        frame_count: 0,
        duration_seconds: null,
        fps: null,
        is_emoji: isEmoji,
        optimal: null,
        error: `Failed to read GIF: ${e instanceof Error ? e.message : String(e)}`,
      },
    ];
  }
}

/**
 * Quick check if GIF is ready for Slack.
 *
 * @param gifPath - Path to GIF file
 * @param isEmoji - True for emoji GIF, False for message GIF
 * @param verbose - Print feedback
 * @returns True if dimensions are acceptable
 */
export async function isSlackReady(
  gifPath: string,
  isEmoji: boolean = true,
  verbose: boolean = true
): Promise<boolean> {
  const [passes] = await validateGif(gifPath, isEmoji, verbose);
  return passes;
}
