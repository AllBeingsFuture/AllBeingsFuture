/**
 * Remove unreferenced files from an unpacked PPTX directory.
 *
 * Usage: npx tsx clean.ts <unpacked_dir>
 *
 * Example:
 *     npx tsx clean.ts unpacked/
 *
 * This script removes:
 * - Orphaned slides (not in sldIdLst) and their relationships
 * - [trash] directory (unreferenced files)
 * - Orphaned .rels files for deleted resources
 * - Unreferenced media, embeddings, charts, diagrams, drawings, ink files
 * - Unreferenced theme files
 * - Unreferenced notes slides
 * - Content-Type overrides for deleted files
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

function parseXmlFile(filePath: string): Document {
  const content = fs.readFileSync(filePath, "utf-8");
  return new DOMParser().parseFromString(content, "text/xml");
}

function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

function globFiles(dir: string, pattern: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => pattern.test(f));
}

/**
 * Normalize a path for cross-platform comparison: forward slashes, no leading slashes.
 */
function normalizePosix(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

function getSlidesInSldIdLst(unpackedDir: string): Set<string> {
  const presPath = path.join(unpackedDir, "ppt", "presentation.xml");
  const presRelsPath = path.join(
    unpackedDir,
    "ppt",
    "_rels",
    "presentation.xml.rels"
  );

  if (!fs.existsSync(presPath) || !fs.existsSync(presRelsPath)) {
    return new Set();
  }

  const relsDom = parseXmlFile(presRelsPath);
  const ridToSlide: Record<string, string> = {};
  const rels = relsDom.getElementsByTagName("Relationship");
  for (let i = 0; i < rels.length; i++) {
    const rel = rels[i];
    const rid = rel.getAttribute("Id") || "";
    const target = rel.getAttribute("Target") || "";
    const relType = rel.getAttribute("Type") || "";
    if (relType.includes("slide") && target.startsWith("slides/")) {
      ridToSlide[rid] = target.replace("slides/", "");
    }
  }

  const presContent = fs.readFileSync(presPath, "utf-8");
  const referencedRids = new Set<string>();
  const ridRegex = /<p:sldId[^>]*r:id="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = ridRegex.exec(presContent)) !== null) {
    referencedRids.add(match[1]);
  }

  const result = new Set<string>();
  for (const rid of referencedRids) {
    if (ridToSlide[rid]) {
      result.add(ridToSlide[rid]);
    }
  }
  return result;
}

function removeOrphanedSlides(unpackedDir: string): string[] {
  const slidesDir = path.join(unpackedDir, "ppt", "slides");
  const slidesRelsDir = path.join(slidesDir, "_rels");
  const presRelsPath = path.join(
    unpackedDir,
    "ppt",
    "_rels",
    "presentation.xml.rels"
  );

  if (!fs.existsSync(slidesDir)) return [];

  const referencedSlides = getSlidesInSldIdLst(unpackedDir);
  const removed: string[] = [];

  const slideFiles = globFiles(slidesDir, /^slide\d+\.xml$/);
  for (const fileName of slideFiles) {
    if (!referencedSlides.has(fileName)) {
      const fullPath = path.join(slidesDir, fileName);
      const relPath = normalizePosix(path.relative(unpackedDir, fullPath));
      fs.unlinkSync(fullPath);
      removed.push(relPath);

      const relsFile = path.join(slidesRelsDir, `${fileName}.rels`);
      if (fs.existsSync(relsFile)) {
        fs.unlinkSync(relsFile);
        removed.push(
          normalizePosix(path.relative(unpackedDir, relsFile))
        );
      }
    }
  }

  if (removed.length > 0 && fs.existsSync(presRelsPath)) {
    const relsDom = parseXmlFile(presRelsPath);
    let changed = false;

    const rels = relsDom.getElementsByTagName("Relationship");
    const toRemove: Element[] = [];
    for (let i = 0; i < rels.length; i++) {
      const rel = rels[i] as Element;
      const target = rel.getAttribute("Target") || "";
      if (target.startsWith("slides/")) {
        const slideName = target.replace("slides/", "");
        if (!referencedSlides.has(slideName)) {
          toRemove.push(rel);
        }
      }
    }

    for (const rel of toRemove) {
      if (rel.parentNode) {
        rel.parentNode.removeChild(rel);
        changed = true;
      }
    }

    if (changed) {
      const xmlStr = serializeXml(relsDom);
      fs.writeFileSync(presRelsPath, xmlStr, "utf-8");
    }
  }

  return removed;
}

function removeTrashDirectory(unpackedDir: string): string[] {
  const trashDir = path.join(unpackedDir, "[trash]");
  const removed: string[] = [];

  if (fs.existsSync(trashDir) && fs.statSync(trashDir).isDirectory()) {
    const files = fs.readdirSync(trashDir);
    for (const file of files) {
      const filePath = path.join(trashDir, file);
      if (fs.statSync(filePath).isFile()) {
        removed.push(normalizePosix(path.relative(unpackedDir, filePath)));
        fs.unlinkSync(filePath);
      }
    }
    fs.rmdirSync(trashDir);
  }

  return removed;
}

function resolveRelTarget(
  relsFilePath: string,
  target: string,
  unpackedDir: string
): string | null {
  // rels file is in e.g. slides/_rels/slide1.xml.rels
  // The target is relative to the parent of _rels (i.e. slides/)
  const baseDir = path.dirname(path.dirname(relsFilePath));
  const resolved = path.resolve(baseDir, target);
  try {
    const rel = path.relative(unpackedDir, resolved);
    return normalizePosix(rel);
  } catch {
    return null;
  }
}

function getSlideReferencedFiles(unpackedDir: string): Set<string> {
  const referenced = new Set<string>();
  const slidesRelsDir = path.join(unpackedDir, "ppt", "slides", "_rels");

  if (!fs.existsSync(slidesRelsDir)) return referenced;

  const relsFiles = globFiles(slidesRelsDir, /\.rels$/);
  for (const relsFile of relsFiles) {
    const relsPath = path.join(slidesRelsDir, relsFile);
    const dom = parseXmlFile(relsPath);
    const rels = dom.getElementsByTagName("Relationship");
    for (let i = 0; i < rels.length; i++) {
      const target = rels[i].getAttribute("Target") || "";
      if (!target) continue;
      const resolved = resolveRelTarget(relsPath, target, unpackedDir);
      if (resolved) referenced.add(resolved);
    }
  }

  return referenced;
}

function removeOrphanedRelsFiles(unpackedDir: string): string[] {
  const resourceDirs = ["charts", "diagrams", "drawings"];
  const removed: string[] = [];
  const slideReferenced = getSlideReferencedFiles(unpackedDir);

  for (const dirName of resourceDirs) {
    const relsDir = path.join(unpackedDir, "ppt", dirName, "_rels");
    if (!fs.existsSync(relsDir)) continue;

    const relsFiles = globFiles(relsDir, /\.rels$/);
    for (const relsFile of relsFiles) {
      const relsPath = path.join(relsDir, relsFile);
      const resourceFile = path.join(
        path.dirname(relsDir),
        relsFile.replace(".rels", "")
      );
      const resourceRelPath = normalizePosix(
        path.relative(unpackedDir, path.resolve(resourceFile))
      );

      if (
        !fs.existsSync(resourceFile) ||
        !slideReferenced.has(resourceRelPath)
      ) {
        fs.unlinkSync(relsPath);
        removed.push(normalizePosix(path.relative(unpackedDir, relsPath)));
      }
    }
  }

  return removed;
}

function getReferencedFiles(unpackedDir: string): Set<string> {
  const referenced = new Set<string>();

  function walkDir(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith(".rels")) {
        const dom = parseXmlFile(fullPath);
        const rels = dom.getElementsByTagName("Relationship");
        for (let i = 0; i < rels.length; i++) {
          const target = rels[i].getAttribute("Target") || "";
          if (!target) continue;
          const resolved = resolveRelTarget(fullPath, target, unpackedDir);
          if (resolved) referenced.add(resolved);
        }
      }
    }
  }

  walkDir(unpackedDir);
  return referenced;
}

function removeOrphanedFiles(
  unpackedDir: string,
  referenced: Set<string>
): string[] {
  const resourceDirs = [
    "media",
    "embeddings",
    "charts",
    "diagrams",
    "tags",
    "drawings",
    "ink",
  ];
  const removed: string[] = [];

  for (const dirName of resourceDirs) {
    const dirPath = path.join(unpackedDir, "ppt", dirName);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      if (!fs.statSync(filePath).isFile()) continue;
      const relPath = normalizePosix(
        path.relative(unpackedDir, filePath)
      );
      if (!referenced.has(relPath)) {
        fs.unlinkSync(filePath);
        removed.push(relPath);
      }
    }
  }

  // Theme files
  const themeDir = path.join(unpackedDir, "ppt", "theme");
  if (fs.existsSync(themeDir)) {
    const themeFiles = globFiles(themeDir, /^theme\d*\.xml$/);
    for (const file of themeFiles) {
      const filePath = path.join(themeDir, file);
      const relPath = normalizePosix(
        path.relative(unpackedDir, filePath)
      );
      if (!referenced.has(relPath)) {
        fs.unlinkSync(filePath);
        removed.push(relPath);
        const themeRels = path.join(themeDir, "_rels", `${file}.rels`);
        if (fs.existsSync(themeRels)) {
          fs.unlinkSync(themeRels);
          removed.push(
            normalizePosix(path.relative(unpackedDir, themeRels))
          );
        }
      }
    }
  }

  // Notes slides
  const notesDir = path.join(unpackedDir, "ppt", "notesSlides");
  if (fs.existsSync(notesDir)) {
    const noteFiles = globFiles(notesDir, /\.xml$/);
    for (const file of noteFiles) {
      const filePath = path.join(notesDir, file);
      if (!fs.statSync(filePath).isFile()) continue;
      const relPath = normalizePosix(
        path.relative(unpackedDir, filePath)
      );
      if (!referenced.has(relPath)) {
        fs.unlinkSync(filePath);
        removed.push(relPath);
      }
    }

    const notesRelsDir = path.join(notesDir, "_rels");
    if (fs.existsSync(notesRelsDir)) {
      const relsFiles = globFiles(notesRelsDir, /\.rels$/);
      for (const file of relsFiles) {
        const notesFile = path.join(notesDir, file.replace(".rels", ""));
        if (!fs.existsSync(notesFile)) {
          const relsPath = path.join(notesRelsDir, file);
          fs.unlinkSync(relsPath);
          removed.push(
            normalizePosix(path.relative(unpackedDir, relsPath))
          );
        }
      }
    }
  }

  return removed;
}

function updateContentTypes(
  unpackedDir: string,
  removedFiles: string[]
): void {
  const ctPath = path.join(unpackedDir, "[Content_Types].xml");
  if (!fs.existsSync(ctPath)) return;

  const dom = parseXmlFile(ctPath);
  let changed = false;

  const overrides = dom.getElementsByTagName("Override");
  const toRemove: Element[] = [];
  for (let i = 0; i < overrides.length; i++) {
    const override = overrides[i] as Element;
    const partName = (override.getAttribute("PartName") || "").replace(
      /^\/+/,
      ""
    );
    if (removedFiles.includes(partName)) {
      toRemove.push(override);
    }
  }

  for (const override of toRemove) {
    if (override.parentNode) {
      override.parentNode.removeChild(override);
      changed = true;
    }
  }

  if (changed) {
    const xmlStr = serializeXml(dom);
    fs.writeFileSync(ctPath, xmlStr, "utf-8");
  }
}

function cleanUnusedFiles(unpackedDir: string): string[] {
  const allRemoved: string[] = [];

  const slidesRemoved = removeOrphanedSlides(unpackedDir);
  allRemoved.push(...slidesRemoved);

  const trashRemoved = removeTrashDirectory(unpackedDir);
  allRemoved.push(...trashRemoved);

  while (true) {
    const removedRels = removeOrphanedRelsFiles(unpackedDir);
    const referenced = getReferencedFiles(unpackedDir);
    const removedFiles = removeOrphanedFiles(unpackedDir, referenced);

    const totalRemoved = [...removedRels, ...removedFiles];
    if (totalRemoved.length === 0) break;

    allRemoved.push(...totalRemoved);
  }

  if (allRemoved.length > 0) {
    updateContentTypes(unpackedDir, allRemoved);
  }

  return allRemoved;
}

// --- CLI ---
if (process.argv.length !== 3) {
  process.stderr.write("Usage: npx tsx clean.ts <unpacked_dir>\n");
  process.stderr.write("Example: npx tsx clean.ts unpacked/\n");
  process.exit(1);
}

const unpackedDir = process.argv[2];

if (!fs.existsSync(unpackedDir)) {
  process.stderr.write(`Error: ${unpackedDir} not found\n`);
  process.exit(1);
}

const removed = cleanUnusedFiles(unpackedDir);

if (removed.length > 0) {
  console.log(`Removed ${removed.length} unreferenced files:`);
  for (const f of removed) {
    console.log(`  ${f}`);
  }
} else {
  console.log("No unreferenced files found");
}
