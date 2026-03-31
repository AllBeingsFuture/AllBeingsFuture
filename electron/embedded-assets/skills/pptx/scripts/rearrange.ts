/**
 * Rearrange PowerPoint slides based on a sequence of indices.
 *
 * Usage:
 *     npx tsx rearrange.ts template.pptx output.pptx 0,34,34,50,52
 *
 * This will create output.pptx using slides from template.pptx in the specified order.
 * Slides can be repeated (e.g., 34 appears twice).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const NS_R =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_P =
  "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_RELS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const SLIDE_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const SLIDE_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";

function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

async function rearrangePresentation(
  templatePath: string,
  outputPath: string,
  slideSequence: number[]
): Promise<void> {
  const data = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(data);
  const parser = new DOMParser();

  // --- 1. Parse presentation.xml.rels to find slide targets ---
  const presRelsStr = await zip
    .file("ppt/_rels/presentation.xml.rels")!
    .async("text");
  const presRelsDoc = parser.parseFromString(presRelsStr, "text/xml");

  const ridToTarget: Record<string, string> = {};
  const targetToRid: Record<string, string> = {};
  const rels = presRelsDoc.getElementsByTagName("Relationship");
  for (let i = 0; i < rels.length; i++) {
    const rid = rels[i].getAttribute("Id") || "";
    const target = rels[i].getAttribute("Target") || "";
    const relType = rels[i].getAttribute("Type") || "";
    if (relType === SLIDE_REL_TYPE) {
      ridToTarget[rid] = target;
      targetToRid[target] = rid;
    }
  }

  // --- 2. Parse presentation.xml to get slide order ---
  const presXmlStr = await zip.file("ppt/presentation.xml")!.async("text");
  const presDoc = parser.parseFromString(presXmlStr, "text/xml");

  const sldIdEls = presDoc.getElementsByTagName("p:sldId");
  interface SlideInfo {
    sldId: string; // numeric id
    rId: string;
    target: string; // e.g., "slides/slide1.xml"
  }

  const originalSlides: SlideInfo[] = [];
  for (let i = 0; i < sldIdEls.length; i++) {
    const el = sldIdEls[i];
    const sldId = el.getAttribute("id") || "";
    const rId =
      el.getAttribute("r:id") || el.getAttributeNS(NS_R, "id") || "";
    const target = ridToTarget[rId] || "";
    originalSlides.push({ sldId, rId, target });
  }

  const totalSlides = originalSlides.length;

  // Validate indices
  for (const idx of slideSequence) {
    if (idx < 0 || idx >= totalSlides) {
      throw new Error(
        `Slide index ${idx} out of range (0-${totalSlides - 1})`
      );
    }
  }

  console.log(`Processing ${slideSequence.length} slides from template...`);

  // --- 3. Build the new slide list ---
  // For duplicated slides, we need to create new slide files in the zip
  const usedTargets = new Set<string>();
  const newSlideEntries: Array<{
    sourceIdx: number;
    target: string;
    isDuplicate: boolean;
  }> = [];

  // Find max slide number for naming duplicates
  let maxSlideNum = 0;
  for (const info of originalSlides) {
    const m = info.target.match(/slides\/slide(\d+)\.xml/);
    if (m) maxSlideNum = Math.max(maxSlideNum, parseInt(m[1], 10));
  }

  for (let i = 0; i < slideSequence.length; i++) {
    const srcIdx = slideSequence[i];
    const srcTarget = originalSlides[srcIdx].target;

    if (!usedTargets.has(srcTarget)) {
      // Use original slide
      usedTargets.add(srcTarget);
      newSlideEntries.push({
        sourceIdx: srcIdx,
        target: srcTarget,
        isDuplicate: false,
      });
      console.log(`  [${i}] Using original slide ${srcIdx}`);
    } else {
      // Need to duplicate
      maxSlideNum++;
      const newTarget = `slides/slide${maxSlideNum}.xml`;
      newSlideEntries.push({
        sourceIdx: srcIdx,
        target: newTarget,
        isDuplicate: true,
      });
      console.log(
        `  [${i}] Duplicating slide ${srcIdx} as ${newTarget}`
      );
    }
  }

  // --- 4. Create duplicate slide files in the zip ---
  for (const entry of newSlideEntries) {
    if (!entry.isDuplicate) continue;

    const srcTarget = originalSlides[entry.sourceIdx].target;
    const srcPath = `ppt/${srcTarget}`;
    const destPath = `ppt/${entry.target}`;

    // Copy slide XML
    const slideContent = await zip.file(srcPath)?.async("uint8array");
    if (slideContent) {
      zip.file(destPath, slideContent);
    }

    // Copy slide rels
    const srcSlideFile = srcTarget.replace("slides/", "");
    const destSlideFile = entry.target.replace("slides/", "");
    const srcRelsPath = `ppt/slides/_rels/${srcSlideFile}.rels`;
    const destRelsPath = `ppt/slides/_rels/${destSlideFile}.rels`;
    const relsContent = await zip.file(srcRelsPath)?.async("uint8array");
    if (relsContent) {
      zip.file(destRelsPath, relsContent);
    }
  }

  // --- 5. Update presentation.xml.rels ---
  // Add relationships for new duplicate slides
  const relsRoot = presRelsDoc.documentElement;

  // Find max rId
  let maxRid = 0;
  for (let i = 0; i < rels.length; i++) {
    const rid = rels[i].getAttribute("Id") || "";
    const m = rid.match(/^rId(\d+)$/);
    if (m) maxRid = Math.max(maxRid, parseInt(m[1], 10));
  }

  const targetToNewRid: Record<string, string> = {};
  for (const entry of newSlideEntries) {
    if (!entry.isDuplicate) continue;
    maxRid++;
    const newRid = `rId${maxRid}`;
    targetToNewRid[entry.target] = newRid;

    const newRel = presRelsDoc.createElement("Relationship");
    newRel.setAttribute("Id", newRid);
    newRel.setAttribute("Type", SLIDE_REL_TYPE);
    newRel.setAttribute("Target", entry.target);
    relsRoot.appendChild(newRel);
  }

  // --- 6. Update presentation.xml sldIdLst ---
  // Find sldIdLst element
  const sldIdLstEls = presDoc.getElementsByTagName("p:sldIdLst");
  if (sldIdLstEls.length === 0) {
    throw new Error("No p:sldIdLst found in presentation.xml");
  }
  const sldIdLst = sldIdLstEls[0];

  // Remove all existing sldId elements
  while (sldIdLst.firstChild) {
    sldIdLst.removeChild(sldIdLst.firstChild);
  }

  // Find max slide ID for new entries
  let maxSldId = 0;
  for (const info of originalSlides) {
    maxSldId = Math.max(maxSldId, parseInt(info.sldId, 10));
  }

  // Add sldId elements in the new order
  for (const entry of newSlideEntries) {
    let rId: string;
    let sldId: string;

    if (entry.isDuplicate) {
      rId = targetToNewRid[entry.target];
      maxSldId++;
      sldId = String(maxSldId);
    } else {
      rId = originalSlides[entry.sourceIdx].rId;
      sldId = originalSlides[entry.sourceIdx].sldId;
    }

    const newSldIdEl = presDoc.createElementNS(NS_P, "p:sldId");
    newSldIdEl.setAttribute("id", sldId);
    newSldIdEl.setAttribute("r:id", rId);
    sldIdLst.appendChild(newSldIdEl);
  }

  // --- 7. Remove slide rels for slides not in the new list ---
  const newTargets = new Set(newSlideEntries.map((e) => e.target));
  const relsToRemove: Element[] = [];
  for (let i = 0; i < rels.length; i++) {
    const relType = rels[i].getAttribute("Type") || "";
    const target = rels[i].getAttribute("Target") || "";
    if (relType === SLIDE_REL_TYPE && !newTargets.has(target)) {
      relsToRemove.push(rels[i] as Element);
    }
  }
  for (const rel of relsToRemove) {
    rel.parentNode?.removeChild(rel);
  }

  // --- 8. Update [Content_Types].xml ---
  const ctStr = await zip.file("[Content_Types].xml")!.async("text");
  const ctDoc = parser.parseFromString(ctStr, "text/xml");

  // Add content type for each new duplicate slide
  for (const entry of newSlideEntries) {
    if (!entry.isDuplicate) continue;
    const partName = `/ppt/${entry.target}`;

    // Check if already exists
    const overrides = ctDoc.getElementsByTagName("Override");
    let exists = false;
    for (let i = 0; i < overrides.length; i++) {
      if (overrides[i].getAttribute("PartName") === partName) {
        exists = true;
        break;
      }
    }

    if (!exists) {
      const override = ctDoc.createElement("Override");
      override.setAttribute("PartName", partName);
      override.setAttribute("ContentType", SLIDE_CONTENT_TYPE);
      ctDoc.documentElement.appendChild(override);
    }
  }

  // Remove content types for slides that are no longer referenced
  const overrides = ctDoc.getElementsByTagName("Override");
  const toRemove: Element[] = [];
  for (let i = 0; i < overrides.length; i++) {
    const partName = overrides[i].getAttribute("PartName") || "";
    const m = partName.match(/^\/ppt\/(slides\/slide\d+\.xml)$/);
    if (m && !newTargets.has(m[1])) {
      toRemove.push(overrides[i] as Element);
    }
  }
  for (const el of toRemove) {
    el.parentNode?.removeChild(el);
  }

  // --- 9. Remove unused slide files from zip ---
  for (const info of originalSlides) {
    if (!newTargets.has(info.target)) {
      zip.remove(`ppt/${info.target}`);
      const slideFile = info.target.replace("slides/", "");
      zip.remove(`ppt/slides/_rels/${slideFile}.rels`);
    }
  }

  // --- 10. Write updated XML back to zip ---
  zip.file("ppt/presentation.xml", serializeXml(presDoc));
  zip.file("ppt/_rels/presentation.xml.rels", serializeXml(presRelsDoc));
  zip.file("[Content_Types].xml", serializeXml(ctDoc));

  // --- 11. Save ---
  const outDir = path.dirname(outputPath);
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outputData = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(outputPath, outputData);

  console.log(`\nSaved rearranged presentation to: ${outputPath}`);
  console.log(`Final presentation has ${newSlideEntries.length} slides`);
}

// --- CLI ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length !== 3) {
    process.stderr.write(
      "Usage: npx tsx rearrange.ts template.pptx output.pptx 0,34,34,50,52\n\n"
    );
    process.stderr.write(
      "Creates output.pptx using slides from template in the specified order.\n"
    );
    process.stderr.write(
      "Note: Slide indices are 0-based (first slide is 0).\n"
    );
    process.exit(1);
  }

  const templatePath = args[0];
  const outputPath = args[1];
  const sequenceStr = args[2];

  // Parse sequence
  let slideSequence: number[];
  try {
    slideSequence = sequenceStr.split(",").map((x) => {
      const n = parseInt(x.trim(), 10);
      if (isNaN(n)) throw new Error(`Invalid number: ${x}`);
      return n;
    });
  } catch {
    process.stderr.write(
      "Error: Invalid sequence format. Use comma-separated integers (e.g., 0,34,34,50,52)\n"
    );
    process.exit(1);
  }

  if (!fs.existsSync(templatePath)) {
    process.stderr.write(
      `Error: Template file not found: ${templatePath}\n`
    );
    process.exit(1);
  }

  try {
    await rearrangePresentation(templatePath, outputPath, slideSequence);
  } catch (e: any) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

main();
