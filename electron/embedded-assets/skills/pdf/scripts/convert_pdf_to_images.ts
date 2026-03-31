import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

/**
 * Convert PDF pages to PNG images using pdftoppm (from poppler-utils).
 *
 * If pdftoppm is not available, falls back to using ImageMagick's convert command,
 * or to mudraw / mutool if available.
 */
function convert(pdfPath: string, outputDir: string, maxDim: number = 1000): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const prefix = path.join(outputDir, "page");

  // Try pdftoppm first (poppler-utils)
  let usedTool = "";
  try {
    execSync(`pdftoppm -png -r 200 "${pdfPath}" "${prefix}"`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    usedTool = "pdftoppm";
  } catch {
    // Try mutool as fallback
    try {
      execSync(
        `mutool convert -o "${path.join(outputDir, "page_%d.png")}" -O resolution=200 "${pdfPath}"`,
        { stdio: ["pipe", "pipe", "pipe"] }
      );
      usedTool = "mutool";
    } catch {
      console.error(
        "ERROR: Neither pdftoppm (poppler-utils) nor mutool (mupdf) found. " +
          "Please install poppler-utils or mupdf to convert PDFs to images."
      );
      process.exit(1);
    }
  }

  // pdftoppm names files as prefix-01.png, prefix-02.png, etc.
  // Rename them to page_1.png, page_2.png, etc. and resize if needed.
  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".png")).sort();

  let pageCount = 0;
  for (const file of files) {
    pageCount++;
    const srcPath = path.join(outputDir, file);
    const destPath = path.join(outputDir, `page_${pageCount}.png`);

    // Rename if needed (pdftoppm produces page-1.png style names)
    if (srcPath !== destPath) {
      if (fs.existsSync(destPath) && srcPath !== destPath) {
        fs.unlinkSync(destPath);
      }
      fs.renameSync(srcPath, destPath);
    }

    // Use sharp for resizing if available, otherwise try ImageMagick
    try {
      // Attempt to resize with sharp (dynamic import since it may not be installed)
      const sharpModule = require("sharp");
      const image = sharpModule(destPath);
      const metadata = image.metadata();
      metadata.then((meta: { width?: number; height?: number }) => {
        const width = meta.width || 0;
        const height = meta.height || 0;
        if (width > maxDim || height > maxDim) {
          const scaleFactor = Math.min(maxDim / width, maxDim / height);
          const newWidth = Math.round(width * scaleFactor);
          const newHeight = Math.round(height * scaleFactor);
          sharpModule(destPath)
            .resize(newWidth, newHeight)
            .toFile(destPath + ".tmp")
            .then(() => {
              fs.renameSync(destPath + ".tmp", destPath);
              console.log(
                `Saved page ${pageCount} as ${destPath} (size: ${newWidth}x${newHeight})`
              );
            });
        } else {
          console.log(
            `Saved page ${pageCount} as ${destPath} (size: ${width}x${height})`
          );
        }
      });
    } catch {
      // sharp not available, try ImageMagick for resize
      try {
        const identifyOutput = execSync(`identify -format "%wx%h" "${destPath}"`, {
          encoding: "utf-8",
        }).trim();
        const [widthStr, heightStr] = identifyOutput.replace(/"/g, "").split("x");
        const width = parseInt(widthStr, 10);
        const height = parseInt(heightStr, 10);

        if (width > maxDim || height > maxDim) {
          const scaleFactor = Math.min(maxDim / width, maxDim / height);
          const newWidth = Math.round(width * scaleFactor);
          const newHeight = Math.round(height * scaleFactor);
          execSync(
            `convert "${destPath}" -resize ${newWidth}x${newHeight} "${destPath}"`,
            { stdio: ["pipe", "pipe", "pipe"] }
          );
          console.log(
            `Saved page ${pageCount} as ${destPath} (size: ${newWidth}x${newHeight})`
          );
        } else {
          console.log(
            `Saved page ${pageCount} as ${destPath} (size: ${width}x${height})`
          );
        }
      } catch {
        // No resize tool available, just report
        console.log(`Saved page ${pageCount} as ${destPath} (size: original)`);
      }
    }
  }

  console.log(`Converted ${pageCount} pages to PNG images`);
}

function isMainModule(): boolean {
  try {
    return require.main === module;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.log("Usage: convert_pdf_to_images.ts [input pdf] [output directory]");
    process.exit(1);
  }
  const pdfPath = args[0];
  const outputDirectory = args[1];
  convert(pdfPath, outputDirectory);
}
