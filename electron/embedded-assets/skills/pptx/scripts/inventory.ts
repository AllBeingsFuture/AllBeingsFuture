/**
 * Extract structured text content from PowerPoint presentations.
 *
 * This module provides functionality to:
 * - Extract all text content from PowerPoint shapes
 * - Preserve paragraph formatting (alignment, bullets, fonts, spacing)
 * - Handle nested GroupShapes recursively with correct absolute positions
 * - Sort shapes by visual position on slides
 * - Filter out slide numbers and non-content placeholders
 * - Export to JSON with clean, structured data
 *
 * Usage:
 *     npx tsx inventory.ts input.pptx output.json [--issues-only]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";

// Namespace URIs
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_R =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// --- Types ---

interface ParagraphDict {
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

interface OverflowData {
  frame?: { overflow_bottom: number };
  slide?: { overflow_right?: number; overflow_bottom?: number };
}

interface OverlapData {
  overlapping_shapes: Record<string, number>;
}

interface ShapeDict {
  left: number;
  top: number;
  width: number;
  height: number;
  placeholder_type?: string;
  default_font_size?: number;
  overflow?: OverflowData;
  overlap?: OverlapData;
  warnings?: string[];
  paragraphs: ParagraphDict[];
}

type InventoryDict = Record<string, Record<string, ShapeDict>>;

// --- Helper functions ---

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

function getElementsByTagNS(
  parent: Element,
  ns: string,
  localName: string
): Element[] {
  const nodes = parent.getElementsByTagNameNS(ns, localName);
  const result: Element[] = [];
  for (let i = 0; i < nodes.length; i++) {
    result.push(nodes[i] as Element);
  }
  return result;
}

function getTextContent(el: Element): string {
  return el.textContent || "";
}

function getAttr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function getAttrNS(el: Element, ns: string, name: string): string | null {
  return el.getAttributeNS(ns, name);
}

function emuToInches(emu: number): number {
  return emu / 914400.0;
}

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

// --- Paragraph extraction ---

function extractParagraphData(pEl: Element): ParagraphDict | null {
  // Collect all text from <a:t> elements within <a:r> runs
  const runs = findAllDescendants(pEl, "r");
  let fullText = "";
  for (const run of runs) {
    const tEls = findAllDescendants(run, "t");
    for (const t of tEls) {
      fullText += getTextContent(t);
    }
  }

  // Also check for <a:fld> field elements (e.g., slide numbers)
  const fields = findAllDescendants(pEl, "fld");
  for (const fld of fields) {
    const tEls = findAllDescendants(fld, "t");
    for (const t of tEls) {
      fullText += getTextContent(t);
    }
  }

  const text = fullText.trim();
  if (!text) return null;

  const result: ParagraphDict = { text };

  // Get paragraph properties
  const pPr = findDescendant(pEl, "pPr");
  if (pPr) {
    // Check for bullet formatting
    const buChar = findDescendant(pPr, "buChar");
    const buAutoNum = findDescendant(pPr, "buAutoNum");
    if (buChar || buAutoNum) {
      result.bullet = true;
      const lvl = getAttr(pPr, "lvl");
      if (lvl !== null) {
        result.level = parseInt(lvl, 10);
      }
    }

    // Alignment
    const algn = getAttr(pPr, "algn");
    if (algn) {
      const alignMap: Record<string, string> = {
        ctr: "CENTER",
        r: "RIGHT",
        just: "JUSTIFY",
      };
      if (alignMap[algn]) {
        result.alignment = alignMap[algn];
      }
    }

    // Spacing
    const spcBef = findDescendant(pPr, "spcBef");
    if (spcBef) {
      const spcPts = findDescendant(spcBef, "spcPts");
      if (spcPts) {
        const val = getAttr(spcPts, "val");
        if (val) result.space_before = parseInt(val, 10) / 100;
      }
    }

    const spcAft = findDescendant(pPr, "spcAft");
    if (spcAft) {
      const spcPts = findDescendant(spcAft, "spcPts");
      if (spcPts) {
        const val = getAttr(spcPts, "val");
        if (val) result.space_after = parseInt(val, 10) / 100;
      }
    }

    // Line spacing
    const lnSpc = findDescendant(pPr, "lnSpc");
    if (lnSpc) {
      const spcPts = findDescendant(lnSpc, "spcPts");
      if (spcPts) {
        const val = getAttr(spcPts, "val");
        if (val) {
          result.line_spacing = parseInt(val, 10) / 100;
        }
      }
    }
  }

  // Extract font properties from first run
  if (runs.length > 0) {
    const rPr = findDescendant(runs[0], "rPr");
    if (rPr) {
      // Font size (in hundredths of a point)
      const sz = getAttr(rPr, "sz");
      if (sz) {
        result.font_size = parseInt(sz, 10) / 100;
      }

      // Bold
      const b = getAttr(rPr, "b");
      if (b !== null) {
        result.bold = b === "1" || b === "true";
      }

      // Italic
      const i = getAttr(rPr, "i");
      if (i !== null) {
        result.italic = i === "1" || i === "true";
      }

      // Underline
      const u = getAttr(rPr, "u");
      if (u !== null && u !== "none") {
        result.underline = true;
      }

      // Font name - check <a:latin>, <a:ea>, <a:cs>
      const latin = findDescendant(rPr, "latin");
      if (latin) {
        const typeface = getAttr(latin, "typeface");
        if (typeface) result.font_name = typeface;
      }

      // Color
      const solidFill = findDescendant(rPr, "solidFill");
      if (solidFill) {
        const srgbClr = findDescendant(solidFill, "srgbClr");
        if (srgbClr) {
          const val = getAttr(srgbClr, "val");
          if (val) result.color = val;
        }

        const schemeClr = findDescendant(solidFill, "schemeClr");
        if (schemeClr && !result.color) {
          const val = getAttr(schemeClr, "val");
          if (val) {
            // Map scheme color names to theme color names
            const schemeMap: Record<string, string> = {
              dk1: "DARK_1",
              dk2: "DARK_2",
              lt1: "LIGHT_1",
              lt2: "LIGHT_2",
              accent1: "ACCENT_1",
              accent2: "ACCENT_2",
              accent3: "ACCENT_3",
              accent4: "ACCENT_4",
              accent5: "ACCENT_5",
              accent6: "ACCENT_6",
              hlink: "HYPERLINK",
              folHlink: "FOLLOWED_HYPERLINK",
              tx1: "TEXT_1",
              tx2: "TEXT_2",
              bg1: "BACKGROUND_1",
              bg2: "BACKGROUND_2",
            };
            result.theme_color = schemeMap[val] || val;
          }
        }
      }
    }
  }

  return result;
}

// --- Shape extraction ---

interface ShapeInfo {
  leftEmu: number;
  topEmu: number;
  widthEmu: number;
  heightEmu: number;
  paragraphs: ParagraphDict[];
  placeholderType: string | null;
  warnings: string[];
}

function getShapePosition(
  spEl: Element
): { left: number; top: number; width: number; height: number } | null {
  // Look for spPr/xfrm or grpSpPr/xfrm
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
    left: parseInt(getAttr(off, "x") || "0", 10),
    top: parseInt(getAttr(off, "y") || "0", 10),
    width: parseInt(getAttr(ext, "cx") || "0", 10),
    height: parseInt(getAttr(ext, "cy") || "0", 10),
  };
}

function getPlaceholderType(spEl: Element): string | null {
  // Look for nvSpPr/nvPr/ph
  const nvSpPr = findDescendant(spEl, "nvSpPr");
  if (!nvSpPr) return null;
  const nvPr = findDescendant(nvSpPr, "nvPr");
  if (!nvPr) return null;
  const ph = findDescendant(nvPr, "ph");
  if (!ph) return null;

  const phType = getAttr(ph, "type");
  if (!phType) return "BODY"; // Default placeholder type
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

function extractShapeText(spEl: Element): ParagraphDict[] {
  const txBody = findDescendant(spEl, "txBody");
  if (!txBody) return [];

  const paragraphs: ParagraphDict[] = [];
  const pEls = getElements(txBody, "p");
  for (const pEl of pEls) {
    const pd = extractParagraphData(pEl);
    if (pd) paragraphs.push(pd);
  }
  return paragraphs;
}

function detectBulletIssues(spEl: Element): string[] {
  const warnings: string[] = [];
  const txBody = findDescendant(spEl, "txBody");
  if (!txBody) return warnings;

  const bulletSymbols = ["\u2022", "\u25CF", "\u25CB"]; // •, ●, ○
  const pEls = getElements(txBody, "p");
  for (const pEl of pEls) {
    const runs = findAllDescendants(pEl, "r");
    let text = "";
    for (const run of runs) {
      const tEls = findAllDescendants(run, "t");
      for (const t of tEls) text += getTextContent(t);
    }
    text = text.trim();
    if (
      text &&
      bulletSymbols.some((sym) => text.startsWith(sym + " "))
    ) {
      warnings.push("manual_bullet_symbol: use proper bullet formatting");
      break;
    }
  }
  return warnings;
}

function isValidShape(spEl: Element): boolean {
  const paragraphs = extractShapeText(spEl);
  if (paragraphs.length === 0) return false;

  const phType = getPlaceholderType(spEl);
  if (phType === "SLIDE_NUMBER") return false;
  if (
    phType === "FOOTER" &&
    paragraphs.length === 1 &&
    /^\d+$/.test(paragraphs[0].text)
  ) {
    return false;
  }

  return true;
}

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

  // Check if this is a group shape
  if (localName === "grpSp") {
    const result: ShapeWithPosition[] = [];
    const pos = getShapePosition(shapeEl);
    const groupLeft = pos ? pos.left : 0;
    const groupTop = pos ? pos.top : 0;
    const absGroupLeft = parentLeft + groupLeft;
    const absGroupTop = parentTop + groupTop;

    // Process children
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

  // Regular shape
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

function buildShapeDict(
  swp: ShapeWithPosition,
  slideWidthEmu: number | null,
  slideHeightEmu: number | null
): ShapeDict {
  const el = swp.element;
  const pos = getShapePosition(el);
  const widthEmu = pos ? pos.width : 0;
  const heightEmu = pos ? pos.height : 0;

  const left = Math.round(emuToInches(swp.absoluteLeft) * 100) / 100;
  const top = Math.round(emuToInches(swp.absoluteTop) * 100) / 100;
  const width = Math.round(emuToInches(widthEmu) * 100) / 100;
  const height = Math.round(emuToInches(heightEmu) * 100) / 100;

  const paragraphs = extractShapeText(el);
  const phType = getPlaceholderType(el);
  const warnings = detectBulletIssues(el);

  const result: ShapeDict = {
    left,
    top,
    width,
    height,
    paragraphs,
  };

  if (phType) {
    result.placeholder_type = phType;
  }

  // Estimate frame overflow (simple heuristic based on text length)
  const frameOverflow = estimateFrameOverflow(
    paragraphs,
    width,
    height
  );
  const overflowData: OverflowData = {};

  if (frameOverflow !== null && frameOverflow > 0.05) {
    overflowData.frame = { overflow_bottom: frameOverflow };
  }

  // Slide overflow
  if (slideWidthEmu !== null && slideHeightEmu !== null) {
    const slideOverflow: { overflow_right?: number; overflow_bottom?: number } =
      {};
    const rightEdge = swp.absoluteLeft + widthEmu;
    if (rightEdge > slideWidthEmu) {
      const overflowInches =
        Math.round(emuToInches(rightEdge - slideWidthEmu) * 100) / 100;
      if (overflowInches > 0.01) {
        slideOverflow.overflow_right = overflowInches;
      }
    }
    const bottomEdge = swp.absoluteTop + heightEmu;
    if (bottomEdge > slideHeightEmu) {
      const overflowInches =
        Math.round(emuToInches(bottomEdge - slideHeightEmu) * 100) / 100;
      if (overflowInches > 0.01) {
        slideOverflow.overflow_bottom = overflowInches;
      }
    }
    if (slideOverflow.overflow_right || slideOverflow.overflow_bottom) {
      overflowData.slide = slideOverflow;
    }
  }

  if (overflowData.frame || overflowData.slide) {
    result.overflow = overflowData;
  }

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
}

/**
 * Estimate frame overflow using a simple heuristic.
 * Without PIL/sharp text measurement at runtime, we approximate
 * by estimating the number of lines of text that would fit.
 */
function estimateFrameOverflow(
  paragraphs: ParagraphDict[],
  widthInches: number,
  heightInches: number
): number | null {
  if (paragraphs.length === 0 || widthInches <= 0 || heightInches <= 0) {
    return null;
  }

  // Approximate margins (PowerPoint defaults)
  const marginTop = 0.05;
  const marginBottom = 0.05;
  const marginLeft = 0.1;
  const marginRight = 0.1;

  const usableWidth = widthInches - marginLeft - marginRight;
  const usableHeight = heightInches - marginTop - marginBottom;
  if (usableWidth <= 0 || usableHeight <= 0) return null;

  // Approximate character width: average ~0.06" per character at 12pt
  // Scale linearly with font size
  let totalHeightInches = 0;

  for (let idx = 0; idx < paragraphs.length; idx++) {
    const para = paragraphs[idx];
    const fontSize = para.font_size || 14;
    const charWidthInches = (fontSize / 12) * 0.055;
    const lineHeightInches = (fontSize / 72) * 1.2; // 1.2x line height

    // Estimate wrapped lines
    const textLength = para.text.length;
    const charsPerLine = Math.max(1, Math.floor(usableWidth / charWidthInches));
    const numLines = Math.max(1, Math.ceil(textLength / charsPerLine));

    // Line spacing
    if (para.line_spacing) {
      totalHeightInches += numLines * (para.line_spacing / 72);
    } else {
      totalHeightInches += numLines * lineHeightInches;
    }

    // Space before (not first paragraph)
    if (idx > 0 && para.space_before) {
      totalHeightInches += para.space_before / 72;
    }

    // Space after
    if (para.space_after) {
      totalHeightInches += para.space_after / 72;
    }
  }

  if (totalHeightInches > usableHeight) {
    const overflow = Math.round((totalHeightInches - usableHeight) * 100) / 100;
    return overflow;
  }
  return null;
}

function calculateOverlap(
  rect1: [number, number, number, number],
  rect2: [number, number, number, number],
  tolerance: number = 0.05
): [boolean, number] {
  const [left1, top1, w1, h1] = rect1;
  const [left2, top2, w2, h2] = rect2;

  const overlapWidth =
    Math.min(left1 + w1, left2 + w2) - Math.max(left1, left2);
  const overlapHeight =
    Math.min(top1 + h1, top2 + h2) - Math.max(top1, top2);

  if (overlapWidth > tolerance && overlapHeight > tolerance) {
    const area = Math.round(overlapWidth * overlapHeight * 100) / 100;
    return [true, area];
  }

  return [false, 0];
}

function detectOverlaps(
  shapes: Array<{ id: string; dict: ShapeDict }>
): void {
  const n = shapes.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s1 = shapes[i].dict;
      const s2 = shapes[j].dict;
      const rect1: [number, number, number, number] = [
        s1.left,
        s1.top,
        s1.width,
        s1.height,
      ];
      const rect2: [number, number, number, number] = [
        s2.left,
        s2.top,
        s2.width,
        s2.height,
      ];
      const [overlaps, area] = calculateOverlap(rect1, rect2);
      if (overlaps) {
        if (!s1.overlap) s1.overlap = { overlapping_shapes: {} };
        if (!s2.overlap) s2.overlap = { overlapping_shapes: {} };
        s1.overlap.overlapping_shapes[shapes[j].id] = area;
        s2.overlap.overlapping_shapes[shapes[i].id] = area;
      }
    }
  }
}

// --- Main extraction ---

async function extractTextInventory(
  pptxPath: string,
  issuesOnly: boolean = false
): Promise<InventoryDict> {
  const data = fs.readFileSync(pptxPath);
  const zip = await JSZip.loadAsync(data);

  // Read presentation.xml for slide dimensions
  const presXmlStr = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presXmlStr) {
    throw new Error("Missing ppt/presentation.xml in PPTX");
  }

  const parser = new DOMParser();
  const presDoc = parser.parseFromString(presXmlStr, "text/xml");

  // Get slide dimensions
  let slideWidthEmu: number | null = null;
  let slideHeightEmu: number | null = null;
  const sldSzEls = presDoc.getElementsByTagName("p:sldSz");
  if (sldSzEls.length > 0) {
    const cx = sldSzEls[0].getAttribute("cx");
    const cy = sldSzEls[0].getAttribute("cy");
    if (cx) slideWidthEmu = parseInt(cx, 10);
    if (cy) slideHeightEmu = parseInt(cy, 10);
  }

  // Get slide order from presentation.xml
  const presRelsStr = await zip
    .file("ppt/_rels/presentation.xml.rels")
    ?.async("text");
  if (!presRelsStr) {
    throw new Error("Missing ppt/_rels/presentation.xml.rels in PPTX");
  }

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

  // Get ordered slide list from sldIdLst
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

  const inventory: InventoryDict = {};

  for (const { idx: slideIdx, target } of slideOrder) {
    const slideXmlStr = await zip.file(`ppt/${target}`)?.async("text");
    if (!slideXmlStr) continue;

    const slideDoc = parser.parseFromString(slideXmlStr, "text/xml");
    const slideEl = slideDoc.documentElement;

    // Find spTree (shape tree)
    const spTree = findDescendant(slideEl, "spTree");
    if (!spTree) continue;

    // Collect shapes
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

    // Build shape dicts
    let shapeDicts = shapesWithPositions.map((swp) =>
      buildShapeDict(swp, slideWidthEmu, slideHeightEmu)
    );

    // Sort by visual position (top-to-bottom, left-to-right)
    shapeDicts = sortShapesByPosition(shapeDicts);

    // Assign IDs
    const shapesWithIds = shapeDicts.map((dict, idx) => ({
      id: `shape-${idx}`,
      dict,
    }));

    // Detect overlaps
    if (shapesWithIds.length > 1) {
      detectOverlaps(shapesWithIds);
    }

    // Filter issues only
    let filtered = shapesWithIds;
    if (issuesOnly) {
      filtered = shapesWithIds.filter((s) => {
        const d = s.dict;
        return (
          d.overflow !== undefined ||
          (d.overlap && Object.keys(d.overlap.overlapping_shapes).length > 0) ||
          (d.warnings && d.warnings.length > 0)
        );
      });
    }

    if (filtered.length === 0) continue;

    const slideKey = `slide-${slideIdx}`;
    inventory[slideKey] = {};
    for (const { id, dict } of filtered) {
      inventory[slideKey][id] = dict;
    }
  }

  return inventory;
}

function sortShapesByPosition(shapes: ShapeDict[]): ShapeDict[] {
  if (shapes.length === 0) return shapes;

  // Sort by top, then left
  shapes = [...shapes].sort((a, b) =>
    a.top !== b.top ? a.top - b.top : a.left - b.left
  );

  // Group by row (within 0.5 inches vertically)
  const result: ShapeDict[] = [];
  let row: ShapeDict[] = [shapes[0]];
  let rowTop = shapes[0].top;

  for (let i = 1; i < shapes.length; i++) {
    if (Math.abs(shapes[i].top - rowTop) <= 0.5) {
      row.push(shapes[i]);
    } else {
      result.push(...row.sort((a, b) => a.left - b.left));
      row = [shapes[i]];
      rowTop = shapes[i].top;
    }
  }
  result.push(...row.sort((a, b) => a.left - b.left));

  return result;
}

// --- CLI ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    process.stderr.write(
      "Usage: npx tsx inventory.ts input.pptx output.json [--issues-only]\n"
    );
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];
  const issuesOnly = args.includes("--issues-only");

  if (!fs.existsSync(inputPath)) {
    process.stderr.write(`Error: Input file not found: ${inputPath}\n`);
    process.exit(1);
  }

  if (!inputPath.toLowerCase().endsWith(".pptx")) {
    process.stderr.write(
      "Error: Input must be a PowerPoint file (.pptx)\n"
    );
    process.exit(1);
  }

  console.log(`Extracting text inventory from: ${inputPath}`);
  if (issuesOnly) {
    console.log(
      "Filtering to include only text shapes with issues (overflow/overlap)"
    );
  }

  const inventory = await extractTextInventory(inputPath, issuesOnly);

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(
    outputPath,
    JSON.stringify(inventory, null, 2),
    "utf-8"
  );

  console.log(`Output saved to: ${outputPath}`);

  // Report statistics
  const totalSlides = Object.keys(inventory).length;
  const totalShapes = Object.values(inventory).reduce(
    (sum, shapes) => sum + Object.keys(shapes).length,
    0
  );

  if (issuesOnly) {
    if (totalShapes > 0) {
      console.log(
        `Found ${totalShapes} text elements with issues in ${totalSlides} slides`
      );
    } else {
      console.log("No issues discovered");
    }
  } else {
    console.log(
      `Found text in ${totalSlides} slides with ${totalShapes} text elements`
    );
  }
}

main().catch((e) => {
  console.error(`Error processing presentation: ${e}`);
  process.exit(1);
});
