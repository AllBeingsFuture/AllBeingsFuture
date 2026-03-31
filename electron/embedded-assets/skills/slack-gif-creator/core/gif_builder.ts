#!/usr/bin/env npx tsx
/**
 * GIF Builder - Core module for assembling frames into GIFs optimized for Slack.
 *
 * This module provides the main interface for creating GIFs from programmatically
 * generated frames, with automatic optimization for Slack's requirements.
 *
 * Uses the `sharp` npm package for image manipulation and GIF creation.
 */

import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

export class GIFBuilder {
  width: number;
  height: number;
  fps: number;
  frames: Buffer[] = [];

  /**
   * Initialize GIF builder.
   *
   * @param width - Frame width in pixels
   * @param height - Frame height in pixels
   * @param fps - Frames per second
   */
  constructor(width: number = 480, height: number = 480, fps: number = 15) {
    this.width = width;
    this.height = height;
    this.fps = fps;
  }

  /**
   * Add a frame to the GIF.
   *
   * @param frame - Frame as a raw RGB Buffer or a PNG/JPEG Buffer.
   *                If dimensions differ, the frame is resized.
   */
  async addFrame(frame: Buffer): Promise<void> {
    // Ensure frame is the correct size by passing through sharp
    const resized = await sharp(frame)
      .resize(this.width, this.height, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();

    this.frames.push(resized);
  }

  /**
   * Add multiple frames at once.
   */
  async addFrames(frames: Buffer[]): Promise<void> {
    for (const frame of frames) {
      await this.addFrame(frame);
    }
  }

  /**
   * Reduce colors in all frames using quantization via sharp's palette option.
   *
   * @param numColors - Target number of colors (8-256)
   * @returns List of color-optimized frame buffers (raw RGB)
   */
  async optimizeColors(numColors: number = 128): Promise<Buffer[]> {
    const optimized: Buffer[] = [];

    for (const frame of this.frames) {
      // Convert raw to PNG with palette (quantized colors)
      const quantized = await sharp(frame, {
        raw: { width: this.width, height: this.height, channels: 3 },
      })
        .png({ colours: Math.min(256, Math.max(2, numColors)), palette: true })
        .toBuffer();

      // Convert back to raw RGB
      const raw = await sharp(quantized).removeAlpha().raw().toBuffer();
      optimized.push(raw);
    }

    return optimized;
  }

  /**
   * Remove duplicate or near-duplicate consecutive frames.
   *
   * @param threshold - Similarity threshold (0.0-1.0). Higher = more strict.
   * @returns Number of frames removed
   */
  deduplicateFrames(threshold: number = 0.9995): number {
    if (this.frames.length < 2) {
      return 0;
    }

    const deduplicated: Buffer[] = [this.frames[0]];
    let removedCount = 0;

    for (let i = 1; i < this.frames.length; i++) {
      const prevFrame = deduplicated[deduplicated.length - 1];
      const currFrame = this.frames[i];

      // Calculate similarity (normalized)
      let diffSum = 0;
      const len = Math.min(prevFrame.length, currFrame.length);
      for (let j = 0; j < len; j++) {
        diffSum += Math.abs(prevFrame[j] - currFrame[j]);
      }
      const similarity = 1.0 - diffSum / (len * 255.0);

      if (similarity < threshold) {
        deduplicated.push(this.frames[i]);
      } else {
        removedCount++;
      }
    }

    this.frames = deduplicated;
    return removedCount;
  }

  /**
   * Save frames as optimized GIF for Slack.
   *
   * @param outputPath - Where to save the GIF
   * @param numColors - Number of colors to use (fewer = smaller file)
   * @param optimizeForEmoji - If true, optimize for emoji size (128x128, fewer colors)
   * @param removeDuplicates - If true, remove duplicate consecutive frames
   * @returns Dictionary with file info
   */
  async save(
    outputPath: string,
    numColors: number = 128,
    optimizeForEmoji: boolean = false,
    removeDuplicates: boolean = false
  ): Promise<Record<string, unknown>> {
    if (this.frames.length === 0) {
      throw new Error("No frames to save. Add frames with addFrame() first.");
    }

    // Remove duplicate frames
    if (removeDuplicates) {
      const removed = this.deduplicateFrames(0.9995);
      if (removed > 0) {
        console.log(
          `  Removed ${removed} nearly identical frames (preserved subtle animations)`
        );
      }
    }

    // Optimize for emoji if requested
    if (optimizeForEmoji) {
      if (this.width > 128 || this.height > 128) {
        console.log(
          `  Resizing from ${this.width}x${this.height} to 128x128 for emoji`
        );
        this.width = 128;
        this.height = 128;
        // Resize all frames
        const resizedFrames: Buffer[] = [];
        for (const frame of this.frames) {
          // Determine the source dimensions by buffer length
          const srcPixels = frame.length / 3;
          const srcDim = Math.round(Math.sqrt(srcPixels));
          const resized = await sharp(frame, {
            raw: {
              width: srcDim,
              height: Math.round(srcPixels / srcDim),
              channels: 3,
            },
          })
            .resize(128, 128, { fit: "fill" })
            .raw()
            .toBuffer();
          resizedFrames.push(resized);
        }
        this.frames = resizedFrames;
      }
      numColors = Math.min(numColors, 48);

      // Reduce frame count for emoji
      if (this.frames.length > 12) {
        console.log(
          `  Reducing frames from ${this.frames.length} to ~12 for emoji size`
        );
        const keepEvery = Math.max(1, Math.floor(this.frames.length / 12));
        this.frames = this.frames.filter((_, i) => i % keepEvery === 0);
      }
    }

    // Optimize colors
    const optimizedFrames = await this.optimizeColors(numColors);

    // Calculate frame delay in milliseconds
    const frameDelay = Math.round(1000 / this.fps);

    // Build GIF using sharp's animated GIF support
    // Convert each raw frame to a PNG buffer first
    const pngFrames: Buffer[] = [];
    for (const frame of optimizedFrames) {
      const png = await sharp(frame, {
        raw: { width: this.width, height: this.height, channels: 3 },
      })
        .png()
        .toBuffer();
      pngFrames.push(png);
    }

    // Use sharp to create animated GIF
    // sharp expects frames joined vertically for animation
    const totalHeight = this.height * pngFrames.length;
    const rawFrames: Buffer[] = [];
    for (const frame of optimizedFrames) {
      rawFrames.push(frame);
    }

    // Concatenate all raw frames vertically
    const combinedBuffer = Buffer.concat(rawFrames);

    await sharp(combinedBuffer, {
      raw: {
        width: this.width,
        height: totalHeight,
        channels: 3,
      },
    })
      .gif({
        delay: Array(pngFrames.length).fill(frameDelay),
        loop: 0,
      })
      .toFile(outputPath);

    // Get file info
    const stats = fs.statSync(outputPath);
    const fileSizeKb = stats.size / 1024;
    const fileSizeMb = fileSizeKb / 1024;

    const info: Record<string, unknown> = {
      path: outputPath,
      size_kb: fileSizeKb,
      size_mb: fileSizeMb,
      dimensions: `${this.width}x${this.height}`,
      frame_count: optimizedFrames.length,
      fps: this.fps,
      duration_seconds: optimizedFrames.length / this.fps,
      colors: numColors,
    };

    console.log(`\nGIF created successfully!`);
    console.log(`  Path: ${outputPath}`);
    console.log(`  Size: ${fileSizeKb.toFixed(1)} KB (${fileSizeMb.toFixed(2)} MB)`);
    console.log(`  Dimensions: ${this.width}x${this.height}`);
    console.log(
      `  Frames: ${optimizedFrames.length} @ ${this.fps} fps`
    );
    console.log(
      `  Duration: ${(optimizedFrames.length / this.fps).toFixed(1)}s`
    );
    console.log(`  Colors: ${numColors}`);

    if (optimizeForEmoji) {
      console.log(`  Optimized for emoji (128x128, reduced colors)`);
    }
    if (fileSizeMb > 1.0) {
      console.log(`\n  Note: Large file size (${fileSizeKb.toFixed(1)} KB)`);
      console.log(
        "  Consider: fewer frames, smaller dimensions, or fewer colors"
      );
    }

    return info;
  }

  /** Clear all frames (useful for creating multiple GIFs). */
  clear(): void {
    this.frames = [];
  }
}
