/**
 * Extract form structure from a non-fillable PDF.
 *
 * This script analyzes the PDF to find:
 * - Text labels with their exact coordinates
 * - Horizontal lines (row boundaries)
 * - Checkboxes (small rectangles)
 *
 * Output: A JSON file with the form structure that can be used to generate
 * accurate field coordinates for filling.
 *
 * Usage: npx tsx extract_form_structure.ts <input.pdf> <output.json>
 *
 * Dependencies: pdfjs-dist (for text extraction and page structure parsing)
 */

import * as fs from "node:fs";
import * as path from "node:path";

// pdfjs-dist types
interface PDFPageProxy {
  getViewport(params: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<TextContent>;
  getOperatorList(): Promise<OperatorList>;
}

interface TextContent {
  items: TextItem[];
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface OperatorList {
  fnArray: number[];
  argsArray: unknown[][];
}

interface PageInfo {
  page_number: number;
  width: number;
  height: number;
}

interface Label {
  page: number;
  text: string;
  x0: number;
  top: number;
  x1: number;
  bottom: number;
}

interface Line {
  page: number;
  y: number;
  x0: number;
  x1: number;
}

interface Checkbox {
  page: number;
  x0: number;
  top: number;
  x1: number;
  bottom: number;
  center_x: number;
  center_y: number;
}

interface RowBoundary {
  page: number;
  row_top: number;
  row_bottom: number;
  row_height: number;
}

interface FormStructure {
  pages: PageInfo[];
  labels: Label[];
  lines: Line[];
  checkboxes: Checkbox[];
  row_boundaries: RowBoundary[];
}

async function extractFormStructure(pdfPath: string): Promise<FormStructure> {
  // Dynamic import for pdfjs-dist (ESM module)
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as string);

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdfDocument = await loadingTask.promise;

  const structure: FormStructure = {
    pages: [],
    labels: [],
    lines: [],
    checkboxes: [],
    row_boundaries: [],
  };

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page: PDFPageProxy = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    structure.pages.push({
      page_number: pageNum,
      width: pageWidth,
      height: pageHeight,
    });

    // Extract text/words
    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      const textItem = item as TextItem;
      if (!textItem.str || textItem.str.trim() === "") continue;

      // transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
      const tx = textItem.transform[4];
      const ty = textItem.transform[5];
      const fontSize = Math.abs(textItem.transform[3]);

      // PDF coordinates have origin at bottom-left; convert to top-left
      const x0 = round1(tx);
      const top = round1(pageHeight - ty);
      const x1 = round1(tx + textItem.width);
      const bottom = round1(pageHeight - ty + fontSize);

      // Split into words
      const words = textItem.str.split(/\s+/);
      let currentX = tx;
      for (const word of words) {
        if (!word) continue;
        const wordWidth =
          textItem.width * (word.length / Math.max(textItem.str.length, 1));
        structure.labels.push({
          page: pageNum,
          text: word,
          x0: round1(currentX),
          top: round1(pageHeight - ty),
          x1: round1(currentX + wordWidth),
          bottom: round1(pageHeight - ty + fontSize),
        });
        currentX += wordWidth + textItem.width / Math.max(textItem.str.length, 1);
      }
    }

    // Extract graphical elements (lines, rectangles) from operator list
    try {
      const opList = await page.getOperatorList();
      // Track path operations to find lines and rectangles
      // OPS constants from pdfjs
      const OPS = pdfjsLib.OPS;
      let currentPath: number[][] = [];

      for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        const args = opList.argsArray[i];

        if (fn === OPS.constructPath) {
          // args[0] = ops array, args[1] = coords array
          const ops = args[0] as number[];
          const coords = args[1] as number[];
          let ci = 0;
          for (const op of ops) {
            if (op === OPS.moveTo) {
              currentPath.push([coords[ci], coords[ci + 1]]);
              ci += 2;
            } else if (op === OPS.lineTo) {
              currentPath.push([coords[ci], coords[ci + 1]]);
              ci += 2;
            } else if (op === OPS.rectangle) {
              const rx = coords[ci];
              const ry = coords[ci + 1];
              const rw = coords[ci + 2];
              const rh = coords[ci + 3];
              ci += 4;

              // Check if it's a checkbox-sized rectangle
              const absW = Math.abs(rw);
              const absH = Math.abs(rh);
              if (
                absW >= 5 &&
                absW <= 15 &&
                absH >= 5 &&
                absH <= 15 &&
                Math.abs(absW - absH) < 2
              ) {
                const x0 = round1(Math.min(rx, rx + rw));
                const x1 = round1(Math.max(rx, rx + rw));
                const pdfBottom = Math.min(ry, ry + rh);
                const pdfTop = Math.max(ry, ry + rh);
                const top = round1(pageHeight - pdfTop);
                const bottom = round1(pageHeight - pdfBottom);
                structure.checkboxes.push({
                  page: pageNum,
                  x0,
                  top,
                  x1,
                  bottom,
                  center_x: round1((x0 + x1) / 2),
                  center_y: round1((top + bottom) / 2),
                });
              }
            }
          }
        } else if (fn === OPS.stroke || fn === OPS.fill || fn === OPS.fillStroke) {
          // Check if path forms a horizontal line
          if (currentPath.length === 2) {
            const [p1, p2] = currentPath;
            // Horizontal line: same y, significant x span
            if (Math.abs(p1[1] - p2[1]) < 1) {
              const lineX0 = Math.min(p1[0], p2[0]);
              const lineX1 = Math.max(p1[0], p2[0]);
              const lineLength = lineX1 - lineX0;
              if (lineLength > pageWidth * 0.5) {
                const y = round1(pageHeight - p1[1]);
                structure.lines.push({
                  page: pageNum,
                  y,
                  x0: round1(lineX0),
                  x1: round1(lineX1),
                });
              }
            }
          }
          currentPath = [];
        }
      }
    } catch {
      // Operator list extraction may not always work perfectly
    }
  }

  // Calculate row boundaries from lines
  const linesByPage: Record<number, number[]> = {};
  for (const line of structure.lines) {
    if (!linesByPage[line.page]) {
      linesByPage[line.page] = [];
    }
    linesByPage[line.page].push(line.y);
  }

  for (const [pageStr, yCoords] of Object.entries(linesByPage)) {
    const page = parseInt(pageStr, 10);
    const uniqueYCoords = [...new Set(yCoords)].sort((a, b) => a - b);
    for (let i = 0; i < uniqueYCoords.length - 1; i++) {
      structure.row_boundaries.push({
        page,
        row_top: uniqueYCoords[i],
        row_bottom: uniqueYCoords[i + 1],
        row_height: round1(uniqueYCoords[i + 1] - uniqueYCoords[i]),
      });
    }
  }

  return structure;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.log("Usage: extract_form_structure.ts <input.pdf> <output.json>");
    process.exit(1);
  }

  const pdfPath = args[0];
  const outputPath = args[1];

  console.log(`Extracting structure from ${pdfPath}...`);
  const structure = await extractFormStructure(pdfPath);

  fs.writeFileSync(outputPath, JSON.stringify(structure, null, 2));

  console.log(`Found:`);
  console.log(`  - ${structure.pages.length} pages`);
  console.log(`  - ${structure.labels.length} text labels`);
  console.log(`  - ${structure.lines.length} horizontal lines`);
  console.log(`  - ${structure.checkboxes.length} checkboxes`);
  console.log(`  - ${structure.row_boundaries.length} row boundaries`);
  console.log(`Saved to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
