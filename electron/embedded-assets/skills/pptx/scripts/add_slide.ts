/**
 * Add a new slide to an unpacked PPTX directory.
 *
 * Usage: npx tsx add_slide.ts <unpacked_dir> <source>
 *
 * The source can be:
 *   - A slide file (e.g., slide2.xml) - duplicates the slide
 *   - A layout file (e.g., slideLayout2.xml) - creates from layout
 *
 * Examples:
 *     npx tsx add_slide.ts unpacked/ slide2.xml
 *     # Duplicates slide2, creates slide5.xml
 *
 *     npx tsx add_slide.ts unpacked/ slideLayout2.xml
 *     # Creates slide5.xml from slideLayout2.xml
 *
 * To see available layouts: ls unpacked/ppt/slideLayouts/
 *
 * Prints the <p:sldId> element to add to presentation.xml.
 */

import * as fs from "node:fs";
import * as path from "node:path";

function getNextSlideNumber(slidesDir: string): number {
  const files = fs.readdirSync(slidesDir);
  const existing: number[] = [];
  for (const f of files) {
    const m = f.match(/^slide(\d+)\.xml$/);
    if (m) {
      existing.push(parseInt(m[1], 10));
    }
  }
  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

function addToContentTypes(unpackedDir: string, dest: string): void {
  const ctPath = path.join(unpackedDir, "[Content_Types].xml");
  let content = fs.readFileSync(ctPath, "utf-8");

  const newOverride = `<Override PartName="/ppt/slides/${dest}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;

  if (!content.includes(`/ppt/slides/${dest}`)) {
    content = content.replace("</Types>", `  ${newOverride}\n</Types>`);
    fs.writeFileSync(ctPath, content, "utf-8");
  }
}

function addToPresentationRels(unpackedDir: string, dest: string): string {
  const presRelsPath = path.join(
    unpackedDir,
    "ppt",
    "_rels",
    "presentation.xml.rels"
  );
  let presRels = fs.readFileSync(presRelsPath, "utf-8");

  const rids: number[] = [];
  const ridRegex = /Id="rId(\d+)"/g;
  let match: RegExpExecArray | null;
  while ((match = ridRegex.exec(presRels)) !== null) {
    rids.push(parseInt(match[1], 10));
  }
  const nextRid = rids.length > 0 ? Math.max(...rids) + 1 : 1;
  const rid = `rId${nextRid}`;

  const newRel = `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${dest}"/>`;

  if (!presRels.includes(`slides/${dest}`)) {
    presRels = presRels.replace(
      "</Relationships>",
      `  ${newRel}\n</Relationships>`
    );
    fs.writeFileSync(presRelsPath, presRels, "utf-8");
  }

  return rid;
}

function getNextSlideId(unpackedDir: string): number {
  const presPath = path.join(unpackedDir, "ppt", "presentation.xml");
  const presContent = fs.readFileSync(presPath, "utf-8");
  const slideIds: number[] = [];
  const idRegex = /<p:sldId[^>]*id="(\d+)"/g;
  let match: RegExpExecArray | null;
  while ((match = idRegex.exec(presContent)) !== null) {
    slideIds.push(parseInt(match[1], 10));
  }
  return slideIds.length > 0 ? Math.max(...slideIds) + 1 : 256;
}

function createSlideFromLayout(
  unpackedDir: string,
  layoutFile: string
): void {
  const slidesDir = path.join(unpackedDir, "ppt", "slides");
  const relsDir = path.join(slidesDir, "_rels");
  const layoutsDir = path.join(unpackedDir, "ppt", "slideLayouts");

  const layoutPath = path.join(layoutsDir, layoutFile);
  if (!fs.existsSync(layoutPath)) {
    process.stderr.write(`Error: ${layoutPath} not found\n`);
    process.exit(1);
  }

  const nextNum = getNextSlideNumber(slidesDir);
  const dest = `slide${nextNum}.xml`;
  const destSlide = path.join(slidesDir, dest);
  const destRels = path.join(relsDir, `${dest}.rels`);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>`;
  fs.writeFileSync(destSlide, slideXml, "utf-8");

  fs.mkdirSync(relsDir, { recursive: true });
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/${layoutFile}"/>
</Relationships>`;
  fs.writeFileSync(destRels, relsXml, "utf-8");

  addToContentTypes(unpackedDir, dest);

  const rid = addToPresentationRels(unpackedDir, dest);

  const nextSlideId = getNextSlideId(unpackedDir);

  console.log(`Created ${dest} from ${layoutFile}`);
  console.log(
    `Add to presentation.xml <p:sldIdLst>: <p:sldId id="${nextSlideId}" r:id="${rid}"/>`
  );
}

function duplicateSlide(unpackedDir: string, source: string): void {
  const slidesDir = path.join(unpackedDir, "ppt", "slides");
  const relsDir = path.join(slidesDir, "_rels");

  const sourceSlide = path.join(slidesDir, source);

  if (!fs.existsSync(sourceSlide)) {
    process.stderr.write(`Error: ${sourceSlide} not found\n`);
    process.exit(1);
  }

  const nextNum = getNextSlideNumber(slidesDir);
  const dest = `slide${nextNum}.xml`;
  const destSlide = path.join(slidesDir, dest);

  const sourceRels = path.join(relsDir, `${source}.rels`);
  const destRelsPath = path.join(relsDir, `${dest}.rels`);

  fs.copyFileSync(sourceSlide, destSlide);

  if (fs.existsSync(sourceRels)) {
    fs.copyFileSync(sourceRels, destRelsPath);

    let relsContent = fs.readFileSync(destRelsPath, "utf-8");
    relsContent = relsContent.replace(
      /\s*<Relationship[^>]*Type="[^"]*notesSlide"[^>]*\/>\s*/g,
      "\n"
    );
    fs.writeFileSync(destRelsPath, relsContent, "utf-8");
  }

  addToContentTypes(unpackedDir, dest);

  const rid = addToPresentationRels(unpackedDir, dest);

  const nextSlideId = getNextSlideId(unpackedDir);

  console.log(`Created ${dest} from ${source}`);
  console.log(
    `Add to presentation.xml <p:sldIdLst>: <p:sldId id="${nextSlideId}" r:id="${rid}"/>`
  );
}

function parseSource(source: string): [string, string | null] {
  if (source.startsWith("slideLayout") && source.endsWith(".xml")) {
    return ["layout", source];
  }
  return ["slide", null];
}

// --- CLI ---
if (process.argv.length !== 4) {
  process.stderr.write(
    "Usage: npx tsx add_slide.ts <unpacked_dir> <source>\n\n"
  );
  process.stderr.write("Source can be:\n");
  process.stderr.write(
    "  slide2.xml        - duplicate an existing slide\n"
  );
  process.stderr.write(
    "  slideLayout2.xml  - create from a layout template\n\n"
  );
  process.stderr.write(
    "To see available layouts: ls <unpacked_dir>/ppt/slideLayouts/\n"
  );
  process.exit(1);
}

const unpackedDir = process.argv[2];
const source = process.argv[3];

if (!fs.existsSync(unpackedDir)) {
  process.stderr.write(`Error: ${unpackedDir} not found\n`);
  process.exit(1);
}

const [sourceType, layoutFile] = parseSource(source);

if (sourceType === "layout" && layoutFile !== null) {
  createSlideFromLayout(unpackedDir, layoutFile);
} else {
  duplicateSlide(unpackedDir, source);
}
