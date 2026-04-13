/**
 * Apply text replacements to PowerPoint presentation.
 *
 * Usage:
 *     npx tsx replace.ts <input.pptx> <replacements.json> <output.pptx>
 *
 * The replacements JSON should have the structure output by inventory.ts.
 * ALL text shapes identified by inventory.ts will have their text cleared
 * unless "paragraphs" is specified in the replacements for that shape.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_R =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// --- Types ---

interface ParagraphData {
  text: string;
  bullet?: boolean;
  level?: number;
  alignment?: string;
  space_before?: number;
  space_after?: number;
  font_name?: string;
  font_size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  theme_color?: string;
  line_spacing?: number;
}

interface ShapeReplacement {
  paragraphs?: ParagraphData[];
  [key: string]: unknown;
}

type ReplacementsData = Record<string, Record<string, ShapeReplacement>>;

// --- XML helpers ---

function findDescendant(el: Element, localName: string): Element | null {
  const children = el.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Element;
    if (child.nodeType !== 1) continue;
    const name = child.localName || child.nodeName.split(":").pop();
    if (name === localName) return child;
    const found = findDescendant(child, localName);
    if (found) return found;
  }
  return null;
}

function findAllDescendants(el: Element, localName: string): Element[] {
  const results: Element[] = [];
  const children = el.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Element;
    if (child.nodeType !== 1) continue;
    const name = child.localName || child.nodeName.split(":").pop();
    if (name === localName) results.push(child);
    results.push(...findAllDescendants(child, localName));
  }
  return results;
}

function getElements(parent: Element, tagName: string): Element[] {
  const result: Element[] = [];
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Element;
    if (child.nodeType === 1) {
      const localName = child.localName || child.nodeName.split(":").pop();
      if (localName === tagName) {
        result.push(child);
      }
    }
  }
  return result;
}

function getShapePosition(
  spEl: Element
): { left: number; top: number; width: number; height: number } | null {
  const spPr = findDescendant(spEl, "spPr");
  const grpSpPr = findDescendant(spEl, "grpSpPr");
  const prEl = spPr || grpSpPr;
  if (!prEl) return null;

  const xfrm = findDescendant(prEl, "xfrm");
  if (!xfrm) return null;

  const off = findDescendant(xfrm, "off");
  const ext = findDescendant(xfrm, "ext");
  if (!off || !ext) return null;

  return {
    left: parseInt(off.getAttribute("x") || "0", 10),
    top: parseInt(off.getAttribute("y") || "0", 10),
    width: parseInt(ext.getAttribute("cx") || "0", 10),
    height: parseInt(ext.getAttribute("cy") || "0", 10),
  };
}

function emuToInches(emu: number): number {
  return emu / 914400.0;
}

function getPlaceholderType(spEl: Element): string | null {
  const nvSpPr = findDescendant(spEl, "nvSpPr");
  if (!nvSpPr) return null;
  const nvPr = findDescendant(nvSpPr, "nvPr");
  if (!nvPr) return null;
  const ph = findDescendant(nvPr, "ph");
  if (!ph) return null;

  const phType = ph.getAttribute("type");
  if (!phType) return "BODY";
  const typeMap: Record<string, string> = {
    title: "TITLE",
    ctrTitle: "CENTER_TITLE",
    subTitle: "SUBTITLE",
    body: "BODY",
    dt: "DATE",
    ftr: "FOOTER",
    sldNum: "SLIDE_NUMBER",
    tbl: "TABLE",
    chart: "CHART",
    dgm: "DIAGRAM",
    media: "MEDIA",
    clipArt: "CLIP_ART",
    pic: "PICTURE",
    obj: "OBJECT",
  };
  return typeMap[phType] || phType.toUpperCase();
}

function extractShapeText(spEl: Element): string[] {
  const txBody = findDescendant(spEl, "txBody");
  if (!txBody) return [];

  const texts: string[] = [];
  const pEls = getElements(txBody, "p");
  for (const pEl of pEls) {
    const runs = findAllDescendants(pEl, "r");
    let text = "";
    for (const run of runs) {
      const tEls = findAllDescendants(run, "t");
      for (const t of tEls) text += t.textContent || "";
    }
    const fields = findAllDescendants(pEl, "fld");
    for (const fld of fields) {
      const tEls = findAllDescendants(fld, "t");
      for (const t of tEls) text += t.textContent || "";
    }
    if (text.trim()) texts.push(text.trim());
  }
  return texts;
}

function isValidShape(spEl: Element): boolean {
  const texts = extractShapeText(spEl);
  if (texts.length === 0) return false;

  const phType = getPlaceholderType(spEl);
  if (phType === "SLIDE_NUMBER") return false;
  if (phType === "FOOTER" && texts.length === 1 && /^\d+$/.test(texts[0])) {
    return false;
  }
  return true;
}

// --- Shape collection (mirrors inventory.ts logic) ---

interface ShapeWithPosition {
  element: Element;
  absoluteLeft: number;
  absoluteTop: number;
}

function collectShapesWithAbsolutePositions(
  shapeEl: Element,
  parentLeft: number = 0,
  parentTop: number = 0
): ShapeWithPosition[] {
  const localName =
    shapeEl.localName || shapeEl.nodeName.split(":").pop();

  if (localName === "grpSp") {
    const result: ShapeWithPosition[] = [];
    const pos = getShapePosition(shapeEl);
    const groupLeft = pos ? pos.left : 0;
    const groupTop = pos ? pos.top : 0;
    const absGroupLeft = parentLeft + groupLeft;
    const absGroupTop = parentTop + groupTop;

    const children = shapeEl.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as Element;
      if (child.nodeType !== 1) continue;
      const childName = child.localName || child.nodeName.split(":").pop();
      if (childName === "sp" || childName === "grpSp") {
        result.push(
          ...collectShapesWithAbsolutePositions(
            child,
            absGroupLeft,
            absGroupTop
          )
        );
      }
    }
    return result;
  }

  if (localName === "sp" && isValidShape(shapeEl)) {
    const pos = getShapePosition(shapeEl);
    const shapeLeft = pos ? pos.left : 0;
    const shapeTop = pos ? pos.top : 0;
    return [
      {
        element: shapeEl,
        absoluteLeft: parentLeft + shapeLeft,
        absoluteTop: parentTop + shapeTop,
      },
    ];
  }

  return [];
}

function sortAndAssignIds(
  shapes: ShapeWithPosition[]
): Array<{ id: string; swp: ShapeWithPosition }> {
  // Sort by visual position
  const withInches = shapes.map((swp) => ({
    swp,
    left: Math.round(emuToInches(swp.absoluteLeft) * 100) / 100,
    top: Math.round(emuToInches(swp.absoluteTop) * 100) / 100,
  }));

  withInches.sort((a, b) =>
    a.top !== b.top ? a.top - b.top : a.left - b.left
  );

  // Group by row
  if (withInches.length === 0) return [];

  const result: typeof withInches = [];
  let row = [withInches[0]];
  let rowTop = withInches[0].top;

  for (let i = 1; i < withInches.length; i++) {
    if (Math.abs(withInches[i].top - rowTop) <= 0.5) {
      row.push(withInches[i]);
    } else {
      result.push(...row.sort((a, b) => a.left - b.left));
      row = [withInches[i]];
      rowTop = withInches[i].top;
    }
  }
  result.push(...row.sort((a, b) => a.left - b.left));

  return result.map((item, idx) => ({
    id: `shape-${idx}`,
    swp: item.swp,
  }));
}

// --- Text replacement ---

function clearTextBody(doc: Document, txBody: Element): void {
  // Remove all <a:p> elements
  const pEls = getElements(txBody, "p");
  for (const p of pEls) {
    txBody.removeChild(p);
  }

  // Add one empty paragraph
  const emptyP = doc.createElementNS(NS_A, "a:p");
  txBody.appendChild(emptyP);
}

function createParagraphElement(
  doc: Document,
  paraData: ParagraphData
): Element {
  const pEl = doc.createElementNS(NS_A, "a:p");

  // Paragraph properties
  const pPr = doc.createElementNS(NS_A, "a:pPr");
  let hasPPr = false;

  // Bullet handling
  if (paraData.bullet) {
    hasPPr = true;
    const level = paraData.level || 0;
    pPr.setAttribute("lvl", String(level));

    // Calculate indentation
    const fontSize = paraData.font_size || 18;
    const levelIndentEmu = Math.round(
      fontSize * (1.6 + level * 1.6) * 12700
    );
    const hangingIndentEmu = Math.round(-fontSize * 0.8 * 12700);

    pPr.setAttribute("marL", String(levelIndentEmu));
    pPr.setAttribute("indent", String(hangingIndentEmu));

    const buChar = doc.createElementNS(NS_A, "a:buChar");
    buChar.setAttribute("char", "\u2022");
    pPr.appendChild(buChar);

    // Default to left alignment for bullets
    if (!paraData.alignment) {
      pPr.setAttribute("algn", "l");
    }
  } else {
    hasPPr = true;
    pPr.setAttribute("marL", "0");
    pPr.setAttribute("indent", "0");

    const buNone = doc.createElementNS(NS_A, "a:buNone");
    pPr.appendChild(buNone);
  }

  // Alignment
  if (paraData.alignment) {
    hasPPr = true;
    const alignMap: Record<string, string> = {
      LEFT: "l",
      CENTER: "ctr",
      RIGHT: "r",
      JUSTIFY: "just",
    };
    if (alignMap[paraData.alignment]) {
      pPr.setAttribute("algn", alignMap[paraData.alignment]);
    }
  }

  // Spacing
  if (paraData.space_before !== undefined) {
    hasPPr = true;
    const spcBef = doc.createElementNS(NS_A, "a:spcBef");
    const spcPts = doc.createElementNS(NS_A, "a:spcPts");
    spcPts.setAttribute("val", String(Math.round(paraData.space_before * 100)));
    spcBef.appendChild(spcPts);
    pPr.appendChild(spcBef);
  }

  if (paraData.space_after !== undefined) {
    hasPPr = true;
    const spcAft = doc.createElementNS(NS_A, "a:spcAft");
    const spcPts = doc.createElementNS(NS_A, "a:spcPts");
    spcPts.setAttribute("val", String(Math.round(paraData.space_after * 100)));
    spcAft.appendChild(spcPts);
    pPr.appendChild(spcAft);
  }

  if (paraData.line_spacing !== undefined) {
    hasPPr = true;
    const lnSpc = doc.createElementNS(NS_A, "a:lnSpc");
    const spcPts = doc.createElementNS(NS_A, "a:spcPts");
    spcPts.setAttribute(
      "val",
      String(Math.round(paraData.line_spacing * 100))
    );
    lnSpc.appendChild(spcPts);
    pPr.appendChild(lnSpc);
  }

  if (hasPPr) {
    pEl.appendChild(pPr);
  }

  // Run with text
  const rEl = doc.createElementNS(NS_A, "a:r");

  // Run properties
  const rPr = doc.createElementNS(NS_A, "a:rPr");
  rPr.setAttribute("lang", "en-US");
  let hasRPr = false;

  if (paraData.font_size !== undefined) {
    hasRPr = true;
    rPr.setAttribute("sz", String(Math.round(paraData.font_size * 100)));
  }
  if (paraData.bold !== undefined) {
    hasRPr = true;
    rPr.setAttribute("b", paraData.bold ? "1" : "0");
  }
  if (paraData.italic !== undefined) {
    hasRPr = true;
    rPr.setAttribute("i", paraData.italic ? "1" : "0");
  }
  if (paraData.underline !== undefined) {
    hasRPr = true;
    rPr.setAttribute("u", paraData.underline ? "sng" : "none");
  }

  // Font name
  if (paraData.font_name) {
    hasRPr = true;
    const latin = doc.createElementNS(NS_A, "a:latin");
    latin.setAttribute("typeface", paraData.font_name);
    rPr.appendChild(latin);
  }

  // Color
  if (paraData.color) {
    hasRPr = true;
    const solidFill = doc.createElementNS(NS_A, "a:solidFill");
    const srgbClr = doc.createElementNS(NS_A, "a:srgbClr");
    const colorHex = paraData.color.replace(/^#/, "");
    srgbClr.setAttribute("val", colorHex);
    solidFill.appendChild(srgbClr);
    rPr.appendChild(solidFill);
  } else if (paraData.theme_color) {
    hasRPr = true;
    const solidFill = doc.createElementNS(NS_A, "a:solidFill");
    const schemeClr = doc.createElementNS(NS_A, "a:schemeClr");
    // Map theme color names back to scheme color codes
    const reverseMap: Record<string, string> = {
      DARK_1: "dk1",
      DARK_2: "dk2",
      LIGHT_1: "lt1",
      LIGHT_2: "lt2",
      ACCENT_1: "accent1",
      ACCENT_2: "accent2",
      ACCENT_3: "accent3",
      ACCENT_4: "accent4",
      ACCENT_5: "accent5",
      ACCENT_6: "accent6",
      HYPERLINK: "hlink",
      FOLLOWED_HYPERLINK: "folHlink",
      TEXT_1: "tx1",
      TEXT_2: "tx2",
      BACKGROUND_1: "bg1",
      BACKGROUND_2: "bg2",
    };
    schemeClr.setAttribute(
      "val",
      reverseMap[paraData.theme_color] || paraData.theme_color
    );
    solidFill.appendChild(schemeClr);
    rPr.appendChild(solidFill);
  }

  // Always add rPr (with at least lang)
  rEl.appendChild(rPr);

  // Text element
  const tEl = doc.createElementNS(NS_A, "a:t");
  tEl.textContent = paraData.text;
  rEl.appendChild(tEl);

  pEl.appendChild(rEl);

  return pEl;
}

// --- Main ---

async function applyReplacements(
  inputFile: string,
  jsonFile: string,
  outputFile: string
): Promise<void> {
  const data = fs.readFileSync(inputFile);
  const zip = await JSZip.loadAsync(data);
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  // Load replacements
  const replacementsStr = fs.readFileSync(jsonFile, "utf-8");
  // Check for duplicate keys
  const replacements: ReplacementsData = JSON.parse(replacementsStr);

  // Get slide order from presentation
  const presRelsStr = await zip
    .file("ppt/_rels/presentation.xml.rels")!
    .async("text");
  const presRelsDoc = parser.parseFromString(presRelsStr, "text/xml");

  const ridToTarget: Record<string, string> = {};
  const rels = presRelsDoc.getElementsByTagName("Relationship");
  for (let i = 0; i < rels.length; i++) {
    const rid = rels[i].getAttribute("Id") || "";
    const target = rels[i].getAttribute("Target") || "";
    const relType = rels[i].getAttribute("Type") || "";
    if (relType.includes("/slide") && target.startsWith("slides/")) {
      ridToTarget[rid] = target;
    }
  }

  const presXmlStr = await zip.file("ppt/presentation.xml")!.async("text");
  const presDoc = parser.parseFromString(presXmlStr, "text/xml");

  const sldIdEls = presDoc.getElementsByTagName("p:sldId");
  const slideOrder: Array<{ idx: number; target: string }> = [];
  for (let i = 0; i < sldIdEls.length; i++) {
    const rid =
      sldIdEls[i].getAttribute("r:id") ||
      sldIdEls[i].getAttributeNS(NS_R, "id") ||
      "";
    if (ridToTarget[rid]) {
      slideOrder.push({ idx: i, target: ridToTarget[rid] });
    }
  }

  // Build inventory (shape mapping) for each slide
  let shapesProcessed = 0;
  let shapesCleared = 0;
  let shapesReplaced = 0;

  for (const { idx: slideIdx, target } of slideOrder) {
    const slideKey = `slide-${slideIdx}`;
    const slideXmlStr = await zip.file(`ppt/${target}`)?.async("text");
    if (!slideXmlStr) continue;

    const slideDoc = parser.parseFromString(slideXmlStr, "text/xml");
    const slideEl = slideDoc.documentElement;
    const spTree = findDescendant(slideEl, "spTree");
    if (!spTree) continue;

    // Collect shapes (same logic as inventory)
    const shapesWithPositions: ShapeWithPosition[] = [];
    const children = spTree.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as Element;
      if (child.nodeType !== 1) continue;
      const localName = child.localName || child.nodeName.split(":").pop();
      if (localName === "sp" || localName === "grpSp") {
        shapesWithPositions.push(
          ...collectShapesWithAbsolutePositions(child)
        );
      }
    }

    if (shapesWithPositions.length === 0) continue;

    const sortedShapes = sortAndAssignIds(shapesWithPositions);

    // Process each shape
    for (const { id: shapeKey, swp } of sortedShapes) {
      shapesProcessed++;
      const shapeEl = swp.element;
      const txBody = findDescendant(shapeEl, "txBody");
      if (!txBody) continue;

      // Clear existing text
      clearTextBody(slideDoc, txBody);
      shapesCleared++;

      // Check for replacement
      const slideReplacements = replacements[slideKey];
      if (!slideReplacements) continue;
      const shapeReplacement = slideReplacements[shapeKey];
      if (!shapeReplacement || !shapeReplacement.paragraphs) continue;

      shapesReplaced++;

      // Remove the empty paragraph we added
      const existingPs = getElements(txBody, "p");
      for (const p of existingPs) {
        txBody.removeChild(p);
      }

      // Add replacement paragraphs
      for (const paraData of shapeReplacement.paragraphs) {
        const pEl = createParagraphElement(slideDoc, paraData);
        txBody.appendChild(pEl);
      }
    }

    // Write updated slide back to zip
    zip.file(`ppt/${target}`, serializer.serializeToString(slideDoc));
  }

  // Save output
  const outDir = path.dirname(outputFile);
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outputData = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(outputFile, outputData);

  console.log(`Saved updated presentation to: ${outputFile}`);
  console.log(`Processed ${slideOrder.length} slides`);
  console.log(`  - Shapes processed: ${shapesProcessed}`);
  console.log(`  - Shapes cleared: ${shapesCleared}`);
  console.log(`  - Shapes replaced: ${shapesReplaced}`);
}

// --- CLI ---

async function main(): Promise<void> {
  if (process.argv.length !== 5) {
    process.stderr.write(
      "Usage: npx tsx replace.ts <input.pptx> <replacements.json> <output.pptx>\n\n"
    );
    process.stderr.write(
      "The replacements JSON should have the structure output by inventory.ts.\n"
    );
    process.exit(1);
  }

  const inputPptx = process.argv[2];
  const replacementsJson = process.argv[3];
  const outputPptx = process.argv[4];

  if (!fs.existsSync(inputPptx)) {
    process.stderr.write(`Error: Input file '${inputPptx}' not found\n`);
    process.exit(1);
  }

  if (!fs.existsSync(replacementsJson)) {
    process.stderr.write(
      `Error: Replacements JSON file '${replacementsJson}' not found\n`
    );
    process.exit(1);
  }

  try {
    await applyReplacements(inputPptx, replacementsJson, outputPptx);
  } catch (e: any) {
    console.error(`Error applying replacements: ${e.message}`);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
}

main();
