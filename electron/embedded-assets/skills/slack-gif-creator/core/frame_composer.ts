#!/usr/bin/env npx tsx
/**
 * Frame Composer - Utilities for composing visual elements into frames.
 *
 * Provides functions for drawing shapes, text, emojis, and compositing elements
 * together to create animation frames.
 *
 * Uses the `sharp` npm package for image manipulation.
 */

import sharp from "sharp";

/** RGB color tuple. */
export type RGB = [number, number, number];

/**
 * Create a blank frame with solid color background.
 *
 * @param width - Frame width
 * @param height - Frame height
 * @param color - RGB color tuple (default: white)
 * @returns sharp instance of the blank frame
 */
export function createBlankFrame(
  width: number,
  height: number,
  color: RGB = [255, 255, 255]
): sharp.Sharp {
  const [r, g, b] = color;
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r, g, b },
    },
  });
}

/**
 * Create an SVG circle element string.
 */
function svgCircle(
  cx: number,
  cy: number,
  radius: number,
  fillColor?: RGB,
  outlineColor?: RGB,
  outlineWidth: number = 1
): string {
  const fill = fillColor
    ? `rgb(${fillColor[0]},${fillColor[1]},${fillColor[2]})`
    : "none";
  const stroke = outlineColor
    ? `rgb(${outlineColor[0]},${outlineColor[1]},${outlineColor[2]})`
    : "none";
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${outlineWidth}"/>`;
}

/**
 * Draw a circle on a frame by compositing an SVG overlay.
 *
 * @param frameBuffer - Raw pixel buffer (RGB, width*height*3)
 * @param width - Frame width
 * @param height - Frame height
 * @param center - [x, y] center position
 * @param radius - Circle radius
 * @param fillColor - RGB fill color
 * @param outlineColor - RGB outline color
 * @param outlineWidth - Outline width in pixels
 * @returns sharp instance with circle composited
 */
export async function drawCircle(
  frameBuffer: Buffer,
  width: number,
  height: number,
  center: [number, number],
  radius: number,
  fillColor?: RGB,
  outlineColor?: RGB,
  outlineWidth: number = 1
): Promise<Buffer> {
  const [cx, cy] = center;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${svgCircle(cx, cy, radius, fillColor, outlineColor, outlineWidth)}
  </svg>`;

  const overlay = Buffer.from(svg);
  const result = await sharp(frameBuffer, {
    raw: { width, height, channels: 3 },
  })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .raw()
    .toBuffer();

  return result;
}

/**
 * Draw text on a frame by compositing an SVG overlay.
 *
 * @param frameBuffer - Raw pixel buffer (RGB, width*height*3)
 * @param width - Frame width
 * @param height - Frame height
 * @param text - Text to draw
 * @param position - [x, y] position
 * @param color - RGB text color
 * @param centered - If true, center text at position
 * @param fontSize - Font size in pixels
 * @returns Updated raw pixel buffer
 */
export async function drawText(
  frameBuffer: Buffer,
  width: number,
  height: number,
  text: string,
  position: [number, number],
  color: RGB = [0, 0, 0],
  centered: boolean = false,
  fontSize: number = 16
): Promise<Buffer> {
  const [x, y] = position;
  const fillStr = `rgb(${color[0]},${color[1]},${color[2]})`;
  const anchor = centered ? "middle" : "start";
  const dominantBaseline = centered ? "central" : "auto";

  // Escape XML special characters in text
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${x}" y="${y}" fill="${fillStr}" font-size="${fontSize}" text-anchor="${anchor}" dominant-baseline="${dominantBaseline}">${escaped}</text>
  </svg>`;

  const overlay = Buffer.from(svg);
  const result = await sharp(frameBuffer, {
    raw: { width, height, channels: 3 },
  })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .raw()
    .toBuffer();

  return result;
}

/**
 * Create a vertical gradient background.
 *
 * @param width - Frame width
 * @param height - Frame height
 * @param topColor - RGB color at top
 * @param bottomColor - RGB color at bottom
 * @returns Raw pixel buffer (RGB)
 */
export function createGradientBackground(
  width: number,
  height: number,
  topColor: RGB,
  bottomColor: RGB
): Buffer {
  const [r1, g1, b1] = topColor;
  const [r2, g2, b2] = bottomColor;

  const buffer = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y++) {
    const ratio = y / height;
    const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
    const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
    const b = Math.round(b1 * (1 - ratio) + b2 * ratio);

    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      buffer[offset] = r;
      buffer[offset + 1] = g;
      buffer[offset + 2] = b;
    }
  }

  return buffer;
}

/**
 * Draw a 5-pointed star on a frame via SVG overlay.
 *
 * @param frameBuffer - Raw pixel buffer (RGB)
 * @param width - Frame width
 * @param height - Frame height
 * @param center - [x, y] center position
 * @param size - Star size (outer radius)
 * @param fillColor - RGB fill color
 * @param outlineColor - RGB outline color
 * @param outlineWidth - Outline width
 * @returns Updated raw pixel buffer
 */
export async function drawStar(
  frameBuffer: Buffer,
  width: number,
  height: number,
  center: [number, number],
  size: number,
  fillColor: RGB,
  outlineColor?: RGB,
  outlineWidth: number = 1
): Promise<Buffer> {
  const [cx, cy] = center;

  // Calculate star points
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = ((i * 36 - 90) * Math.PI) / 180;
    const radius = i % 2 === 0 ? size : size * 0.4;
    const px = cx + radius * Math.cos(angle);
    const py = cy + radius * Math.sin(angle);
    points.push(`${px},${py}`);
  }

  const fill = `rgb(${fillColor[0]},${fillColor[1]},${fillColor[2]})`;
  const stroke = outlineColor
    ? `rgb(${outlineColor[0]},${outlineColor[1]},${outlineColor[2]})`
    : "none";

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${points.join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${outlineWidth}"/>
  </svg>`;

  const overlay = Buffer.from(svg);
  const result = await sharp(frameBuffer, {
    raw: { width, height, channels: 3 },
  })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .raw()
    .toBuffer();

  return result;
}
