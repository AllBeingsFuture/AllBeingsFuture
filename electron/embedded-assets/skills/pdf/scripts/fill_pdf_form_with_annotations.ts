import * as fs from "node:fs";
import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFFont,
} from "pdf-lib";

interface PageInfo {
  page_number: number;
  image_width?: number;
  image_height?: number;
  pdf_width?: number;
  pdf_height?: number;
}

interface EntryText {
  text: string;
  font?: string;
  font_size?: number;
  font_color?: string;
}

interface FormField {
  page_number: number;
  entry_bounding_box: [number, number, number, number];
  label_bounding_box: [number, number, number, number];
  entry_text?: EntryText;
  [key: string]: unknown;
}

interface FieldsData {
  pages: PageInfo[];
  form_fields: FormField[];
}

function transformFromImageCoords(
  bbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
  pdfWidth: number,
  pdfHeight: number
): [number, number, number, number] {
  const xScale = pdfWidth / imageWidth;
  const yScale = pdfHeight / imageHeight;

  const left = bbox[0] * xScale;
  const right = bbox[2] * xScale;

  const top = pdfHeight - bbox[1] * yScale;
  const bottom = pdfHeight - bbox[3] * yScale;

  return [left, bottom, right, top];
}

function transformFromPdfCoords(
  bbox: [number, number, number, number],
  pdfHeight: number
): [number, number, number, number] {
  const left = bbox[0];
  const right = bbox[2];

  const pypdfTop = pdfHeight - bbox[1];
  const pypdfBottom = pdfHeight - bbox[3];

  return [left, pypdfBottom, right, pypdfTop];
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r, g, b };
}

/**
 * Map common font names to pdf-lib StandardFonts.
 */
function getStandardFont(fontName: string): StandardFonts {
  const normalized = fontName.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("courier") && normalized.includes("bold")) {
    return StandardFonts.CourierBold;
  }
  if (normalized.includes("courier")) {
    return StandardFonts.Courier;
  }
  if (normalized.includes("times") && normalized.includes("bold")) {
    return StandardFonts.TimesRomanBold;
  }
  if (normalized.includes("times")) {
    return StandardFonts.TimesRoman;
  }
  if (normalized.includes("helvetica") && normalized.includes("bold")) {
    return StandardFonts.HelveticaBold;
  }
  // Default to Helvetica (closest to Arial)
  return StandardFonts.Helvetica;
}

async function fillPdfForm(
  inputPdfPath: string,
  fieldsJsonPath: string,
  outputPdfPath: string
): Promise<void> {
  const fieldsData: FieldsData = JSON.parse(
    fs.readFileSync(fieldsJsonPath, "utf-8")
  );

  const pdfBytes = fs.readFileSync(inputPdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  // Cache for fonts
  const fontCache: Record<string, PDFFont> = {};

  async function getFont(fontName: string): Promise<PDFFont> {
    if (!fontCache[fontName]) {
      const stdFont = getStandardFont(fontName);
      fontCache[fontName] = await pdfDoc.embedFont(stdFont);
    }
    return fontCache[fontName];
  }

  // Get PDF page dimensions
  const pdfDimensions: Record<number, { width: number; height: number }> = {};
  for (let i = 0; i < pages.length; i++) {
    const { width, height } = pages[i].getSize();
    pdfDimensions[i + 1] = { width, height };
  }

  let annotationCount = 0;

  for (const field of fieldsData.form_fields) {
    const pageNum = field.page_number;
    const pageInfo = fieldsData.pages.find((p) => p.page_number === pageNum);
    if (!pageInfo) continue;

    const dims = pdfDimensions[pageNum];
    if (!dims) continue;

    let transformedEntryBox: [number, number, number, number];

    if (pageInfo.pdf_width !== undefined) {
      transformedEntryBox = transformFromPdfCoords(
        field.entry_bounding_box,
        dims.height
      );
    } else {
      const imageWidth = pageInfo.image_width!;
      const imageHeight = pageInfo.image_height!;
      transformedEntryBox = transformFromImageCoords(
        field.entry_bounding_box,
        imageWidth,
        imageHeight,
        dims.width,
        dims.height
      );
    }

    if (!field.entry_text || !field.entry_text.text) {
      continue;
    }

    const entryText = field.entry_text;
    const text = entryText.text;
    if (!text) continue;

    const fontName = entryText.font || "Arial";
    const fontSize = entryText.font_size ?? 14;
    const fontColor = entryText.font_color || "000000";

    const font = await getFont(fontName);
    const color = parseHexColor(fontColor);

    const page = pages[pageNum - 1];

    // transformedEntryBox = [left, bottom, right, top] in PDF coordinates
    const x = transformedEntryBox[0];
    const y = transformedEntryBox[1]; // bottom in PDF coords

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
    });

    annotationCount++;
  }

  const outputBytes = await pdfDoc.save();
  fs.writeFileSync(outputPdfPath, outputBytes);

  console.log(`Successfully filled PDF form and saved to ${outputPdfPath}`);
  console.log(`Added ${annotationCount} text annotations`);
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
  if (args.length !== 3) {
    console.log(
      "Usage: fill_pdf_form_with_annotations.ts [input pdf] [fields.json] [output pdf]"
    );
    process.exit(1);
  }
  const inputPdf = args[0];
  const fieldsJson = args[1];
  const outputPdf = args[2];

  fillPdfForm(inputPdf, fieldsJson, outputPdf).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
