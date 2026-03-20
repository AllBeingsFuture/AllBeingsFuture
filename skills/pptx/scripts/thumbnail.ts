/**
 * Create thumbnail grids from PowerPoint presentation slides.
 *
 * Creates a grid layout of slide thumbnails for quick visual analysis.
 * Labels each thumbnail with its XML filename (e.g., slide1.xml).
 * Hidden slides are shown with a placeholder pattern.
 *
 * Usage:
 *     npx tsx thumbnail.ts input.pptx [output_prefix] [--cols N]
 *
 * Examples:
 *     npx tsx thumbnail.ts presentation.pptx
 *     # Creates: thumbnails.jpg
 *
 *     npx tsx thumbnail.ts template.pptx grid --cols 4
 *     # Creates: grid.jpg (or grid-1.jpg, grid-2.jpg for large decks)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import sharp from "sharp";

const THUMBNAIL_WIDTH = 300;
const CONVERSION_DPI = 100;
const MAX_COLS = 6;
const DEFAULT_COLS = 3;
const JPEG_QUALITY = 95;
const GRID_PADDING = 20;
const BORDER_WIDTH = 2;
const FONT_SIZE_RATIO = 0.10;
const LABEL_PADDING_RATIO = 0.4;

// --- Slide info ---

interface SlideInfo {
  name: string;
  hidden: boolean;
}

async function getSlideInfo(pptxPath: string): Promise<SlideInfo[]> {
  const data = fs.readFileSync(pptxPath);
  const zip = await JSZip.loadAsync(data);
  const parser = new DOMParser();

  const relsStr = await zip
    .file("ppt/_rels/presentation.xml.rels")!
    .async("text");
  const relsDom = parser.parseFromString(relsStr, "text/xml");

  const ridToSlide: Record<string, string> = {};
  const rels = relsDom.getElementsByTagName("Relationship");
  for (let i = 0; i < rels.length; i++) {
    const rid = rels[i].getAttribute("Id") || "";
    const target = rels[i].getAttribute("Target") || "";
    const relType = rels[i].getAttribute("Type") || "";
    if (relType.includes("slide") && target.startsWith("slides/")) {
      ridToSlide[rid] = target.replace("slides/", "");
    }
  }

  const presStr = await zip.file("ppt/presentation.xml")!.async("text");
  const presDom = parser.parseFromString(presStr, "text/xml");

  const slides: SlideInfo[] = [];
  const sldIdEls = presDom.getElementsByTagName("p:sldId");
  for (let i = 0; i < sldIdEls.length; i++) {
    const el = sldIdEls[i];
    const rid =
      el.getAttribute("r:id") ||
      el.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id"
      ) ||
      "";
    if (ridToSlide[rid]) {
      const show = el.getAttribute("show");
      slides.push({
        name: ridToSlide[rid],
        hidden: show === "0",
      });
    }
  }

  return slides;
}

// --- LibreOffice / soffice helper ---

function getSofficeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  env["SAL_USE_VCLPLUGIN"] = "svp";
  return env;
}

function convertToImages(pptxPath: string, tempDir: string): string[] {
  const stem = path.basename(pptxPath, path.extname(pptxPath));
  const pdfPath = path.join(tempDir, `${stem}.pdf`);

  // Convert PPTX to PDF using LibreOffice
  try {
    execFileSync(
      "soffice",
      [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        tempDir,
        pptxPath,
      ],
      {
        env: getSofficeEnv(),
        stdio: "pipe",
      }
    );
  } catch (e: any) {
    throw new Error(`PDF conversion failed: ${e.message}`);
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error("PDF conversion failed: output file not found");
  }

  // Convert PDF to images using pdftoppm
  try {
    execFileSync(
      "pdftoppm",
      [
        "-jpeg",
        "-r",
        String(CONVERSION_DPI),
        pdfPath,
        path.join(tempDir, "slide"),
      ],
      { stdio: "pipe" }
    );
  } catch (e: any) {
    throw new Error(`Image conversion failed: ${e.message}`);
  }

  // Collect generated images, sorted
  const files = fs
    .readdirSync(tempDir)
    .filter((f) => f.startsWith("slide-") && f.endsWith(".jpg"))
    .sort();

  return files.map((f) => path.join(tempDir, f));
}

// --- Image creation with sharp ---

async function createHiddenPlaceholder(
  width: number,
  height: number
): Promise<Buffer> {
  // Create a light gray image with diagonal cross lines
  const svgWidth = width;
  const svgHeight = height;
  const lineWidth = Math.max(5, Math.min(width, height) / 100);

  const svg = `<svg width="${svgWidth}" height="${svgHeight}">
    <rect width="${svgWidth}" height="${svgHeight}" fill="#F0F0F0"/>
    <line x1="0" y1="0" x2="${svgWidth}" y2="${svgHeight}" stroke="#CCCCCC" stroke-width="${lineWidth}"/>
    <line x1="${svgWidth}" y1="0" x2="0" y2="${svgHeight}" stroke="#CCCCCC" stroke-width="${lineWidth}"/>
  </svg>`;

  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function createTextImage(
  text: string,
  width: number,
  fontSize: number
): Promise<{ buffer: Buffer; height: number }> {
  // Create text label using SVG rendered by sharp
  const escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const textHeight = Math.ceil(fontSize * 1.4);

  const svg = `<svg width="${width}" height="${textHeight}">
    <text x="${width / 2}" y="${fontSize}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="black" text-anchor="middle">${escapedText}</text>
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buffer, height: textHeight };
}

interface SlideEntry {
  imagePath: string;
  label: string;
}

async function buildSlideList(
  slideInfo: SlideInfo[],
  visibleImages: string[],
  tempDir: string
): Promise<SlideEntry[]> {
  let placeholderWidth = 1920;
  let placeholderHeight = 1080;

  if (visibleImages.length > 0) {
    const meta = await sharp(visibleImages[0]).metadata();
    placeholderWidth = meta.width || 1920;
    placeholderHeight = meta.height || 1080;
  }

  const slides: SlideEntry[] = [];
  let visibleIdx = 0;

  for (const info of slideInfo) {
    if (info.hidden) {
      const placeholderPath = path.join(
        tempDir,
        `hidden-${info.name}.jpg`
      );
      const buf = await createHiddenPlaceholder(
        placeholderWidth,
        placeholderHeight
      );
      fs.writeFileSync(placeholderPath, buf);
      slides.push({
        imagePath: placeholderPath,
        label: `${info.name} (hidden)`,
      });
    } else {
      if (visibleIdx < visibleImages.length) {
        slides.push({
          imagePath: visibleImages[visibleIdx],
          label: info.name,
        });
        visibleIdx++;
      }
    }
  }

  return slides;
}

async function createGrid(
  slides: SlideEntry[],
  cols: number,
  thumbWidth: number
): Promise<Buffer> {
  const fontSize = Math.round(thumbWidth * FONT_SIZE_RATIO);
  const labelPadding = Math.round(fontSize * LABEL_PADDING_RATIO);

  // Get aspect ratio from first slide
  const firstMeta = await sharp(slides[0].imagePath).metadata();
  const aspect = (firstMeta.height || 720) / (firstMeta.width || 1280);
  const thumbHeight = Math.round(thumbWidth * aspect);

  const rows = Math.ceil(slides.length / cols);
  const cellHeight = thumbHeight + fontSize + labelPadding * 2;
  const gridW = cols * thumbWidth + (cols + 1) * GRID_PADDING;
  const gridH = rows * cellHeight + (rows + 1) * GRID_PADDING;

  // Start with a white background
  const compositeOps: sharp.OverlayOptions[] = [];

  for (let i = 0; i < slides.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = col * thumbWidth + (col + 1) * GRID_PADDING;
    const yBase = row * cellHeight + (row + 1) * GRID_PADDING;

    // Create label
    const { buffer: labelBuf, height: labelHeight } = await createTextImage(
      slides[i].label,
      thumbWidth,
      fontSize
    );

    compositeOps.push({
      input: labelBuf,
      left: x,
      top: yBase + labelPadding,
    });

    // Create thumbnail
    const yThumbnail = yBase + labelPadding + fontSize + labelPadding;

    const thumbBuf = await sharp(slides[i].imagePath)
      .resize(thumbWidth, thumbHeight, { fit: "inside" })
      .toBuffer();

    const thumbMeta = await sharp(thumbBuf).metadata();
    const tw = thumbMeta.width || thumbWidth;
    const th = thumbMeta.height || thumbHeight;
    const tx = x + Math.floor((thumbWidth - tw) / 2);
    const ty = yThumbnail + Math.floor((thumbHeight - th) / 2);

    // Add border by compositing a slightly larger gray rectangle first
    if (BORDER_WIDTH > 0) {
      const borderW = tw + BORDER_WIDTH * 2;
      const borderH = th + BORDER_WIDTH * 2;
      const borderBuf = await sharp({
        create: {
          width: borderW,
          height: borderH,
          channels: 3,
          background: { r: 128, g: 128, b: 128 },
        },
      })
        .png()
        .toBuffer();

      compositeOps.push({
        input: borderBuf,
        left: tx - BORDER_WIDTH,
        top: ty - BORDER_WIDTH,
      });
    }

    compositeOps.push({
      input: thumbBuf,
      left: tx,
      top: ty,
    });
  }

  const result = await sharp({
    create: {
      width: gridW,
      height: gridH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(compositeOps)
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return result;
}

async function createGrids(
  slides: SlideEntry[],
  cols: number,
  width: number,
  outputPath: string
): Promise<string[]> {
  const maxPerGrid = cols * (cols + 1);
  const gridFiles: string[] = [];

  for (
    let chunkIdx = 0, startIdx = 0;
    startIdx < slides.length;
    chunkIdx++, startIdx += maxPerGrid
  ) {
    const endIdx = Math.min(startIdx + maxPerGrid, slides.length);
    const chunkSlides = slides.slice(startIdx, endIdx);

    const gridBuf = await createGrid(chunkSlides, cols, width);

    let gridFilename: string;
    if (slides.length <= maxPerGrid) {
      gridFilename = outputPath;
    } else {
      const ext = path.extname(outputPath);
      const stem = path.basename(outputPath, ext);
      const dir = path.dirname(outputPath);
      gridFilename = path.join(dir, `${stem}-${chunkIdx + 1}${ext}`);
    }

    const dir = path.dirname(gridFilename);
    if (dir) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(gridFilename, gridBuf);
    gridFiles.push(gridFilename);
  }

  return gridFiles;
}

// --- CLI ---

async function main(): Promise<void> {
  // Parse arguments manually
  const args = process.argv.slice(2);

  if (args.length === 0) {
    process.stderr.write(
      "Usage: npx tsx thumbnail.ts input.pptx [output_prefix] [--cols N]\n"
    );
    process.exit(1);
  }

  let inputPath = "";
  let outputPrefix = "thumbnails";
  let cols = DEFAULT_COLS;

  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cols" && i + 1 < args.length) {
      cols = parseInt(args[i + 1], 10);
      i++;
    } else {
      positional.push(args[i]);
    }
  }

  inputPath = positional[0] || "";
  if (positional.length > 1) outputPrefix = positional[1];

  if (cols > MAX_COLS) {
    console.log(`Warning: Columns limited to ${MAX_COLS}`);
    cols = MAX_COLS;
  }

  if (
    !inputPath ||
    !fs.existsSync(inputPath) ||
    !inputPath.toLowerCase().endsWith(".pptx")
  ) {
    process.stderr.write(
      `Error: Invalid PowerPoint file: ${inputPath}\n`
    );
    process.exit(1);
  }

  const outputPath = `${outputPrefix}.jpg`;

  try {
    const slideInfo = await getSlideInfo(inputPath);

    // Create temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pptx-thumb-"));

    try {
      const visibleImages = convertToImages(inputPath, tempDir);

      if (
        visibleImages.length === 0 &&
        !slideInfo.some((s) => s.hidden)
      ) {
        process.stderr.write("Error: No slides found\n");
        process.exit(1);
      }

      const slides = await buildSlideList(
        slideInfo,
        visibleImages,
        tempDir
      );
      const gridFiles = await createGrids(
        slides,
        cols,
        THUMBNAIL_WIDTH,
        outputPath
      );

      console.log(`Created ${gridFiles.length} grid(s):`);
      for (const gf of gridFiles) {
        console.log(`  ${gf}`);
      }
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (e: any) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

main();
