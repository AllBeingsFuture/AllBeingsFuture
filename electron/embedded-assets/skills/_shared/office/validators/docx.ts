/**
 * Validator for Word document (DOCX) XML files.
 *
 * Checks:
 * - XML well-formedness
 * - Namespace declarations
 * - Unique IDs
 * - File references
 * - Content types
 * - XSD validation (stubbed in TS)
 * - Whitespace preservation on w:t elements
 * - Deletion validation (no w:t inside w:del)
 * - Insertion validation (no w:delText inside w:ins)
 * - Relationship ID references
 * - paraId/durableId constraints
 * - Comment marker pairing
 * - Paragraph count comparison
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { BaseSchemaValidator, ValidatorOptions } from "./base.js";

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

const ELEMENT_NODE = 1;

function localName(tag: string): string {
  const idx = tag.lastIndexOf(":");
  return idx >= 0 ? tag.substring(idx + 1) : tag;
}

function* iterElements(root: Node): Generator<Element> {
  if (root.nodeType === ELEMENT_NODE) yield root as Element;
  for (let i = 0; i < root.childNodes.length; i++) {
    yield* iterElements(root.childNodes[i]);
  }
}

function parseXml(content: string): Document {
  const errors: string[] = [];
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (msg: string) => { errors.push(msg); },
      fatalError: (msg: string) => { errors.push(msg); },
    },
  });
  const doc = parser.parseFromString(content, "text/xml");
  if (errors.length > 0) throw new Error(errors.join("; "));
  return doc;
}

function findElementsByTag(root: Element, nsUri: string, localTag: string): Element[] {
  const results: Element[] = [];
  for (const elem of iterElements(root)) {
    const ns = elem.namespaceURI;
    const ln = elem.localName || localName(elem.tagName || "");
    if (ln === localTag && (!nsUri || ns === nsUri)) {
      results.push(elem);
    }
  }
  return results;
}

function isAncestorTag(elem: Element, nsUri: string, ancestorTag: string): boolean {
  let parent: Node | null = elem.parentNode;
  while (parent) {
    if (parent.nodeType === ELEMENT_NODE) {
      const el = parent as Element;
      const ln = el.localName || localName(el.tagName || "");
      if (ln === ancestorTag && (!nsUri || el.namespaceURI === nsUri)) return true;
    }
    parent = parent.parentNode;
  }
  return false;
}

function relPath(file: string, base: string): string {
  return path.relative(base, file).replace(/\\/g, "/");
}

function extractZip(zipPath: string, outDir: string): void {
  // Use yauzl synchronously via spawnSync
  const { execSync } = require("node:child_process");
  // Use node to extract - a small inline script approach
  const script = `
    const yauzl = require('yauzl');
    const fs = require('fs');
    const path = require('path');
    yauzl.open(${JSON.stringify(zipPath)}, {lazyEntries: true}, (err, zf) => {
      if (err) { process.stderr.write(err.message); process.exit(1); }
      zf.readEntry();
      zf.on('entry', (entry) => {
        const fp = path.join(${JSON.stringify(outDir)}, entry.fileName);
        if (/\\/$/.test(entry.fileName)) {
          fs.mkdirSync(fp, {recursive: true});
          zf.readEntry();
        } else {
          fs.mkdirSync(path.dirname(fp), {recursive: true});
          zf.openReadStream(entry, (err2, rs) => {
            if (err2) { process.stderr.write(err2.message); process.exit(1); }
            const ws = fs.createWriteStream(fp);
            rs.pipe(ws);
            ws.on('finish', () => zf.readEntry());
          });
        }
      });
      zf.on('end', () => process.exit(0));
    });
  `;
  execSync(`node -e ${JSON.stringify(script)}`, { stdio: ["pipe", "pipe", "pipe"] });
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const WORD_2006_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const W14_NS = "http://schemas.microsoft.com/office/word/2010/wordml";
const W16CID_NS = "http://schemas.microsoft.com/office/word/2016/wordml/cid";
const XML_NS = "http://www.w3.org/XML/1998/namespace";

/* ------------------------------------------------------------------ */
/*  DOCXSchemaValidator                                                */
/* ------------------------------------------------------------------ */

export class DOCXSchemaValidator extends BaseSchemaValidator {
  static override ELEMENT_RELATIONSHIP_TYPES: Record<string, string> = {};

  constructor(opts: ValidatorOptions) {
    super(opts);
  }

  override validate(): boolean {
    if (!this.validateXml()) return false;

    let allValid = true;
    if (!this.validateNamespaces()) allValid = false;
    if (!this.validateUniqueIds()) allValid = false;
    if (!this.validateFileReferences()) allValid = false;
    if (!this.validateContentTypes()) allValid = false;
    if (!this.validateAgainstXsd()) allValid = false;
    if (!this.validateWhitespacePreservation()) allValid = false;
    if (!this.validateDeletions()) allValid = false;
    if (!this.validateInsertions()) allValid = false;
    if (!this.validateAllRelationshipIds()) allValid = false;
    if (!this.validateIdConstraints()) allValid = false;
    if (!this.validateCommentMarkers()) allValid = false;
    this.compareParagraphCounts();

    return allValid;
  }

  /* -- Whitespace preservation ------------------------------------- */

  validateWhitespacePreservation(): boolean {
    const errors: string[] = [];

    for (const xmlFile of this.xmlFiles) {
      if (path.basename(xmlFile) !== "document.xml") continue;

      try {
        const content = fs.readFileSync(xmlFile, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;

        const tElems = findElementsByTag(root, WORD_2006_NS, "t");
        for (const elem of tElems) {
          if (!elem.firstChild || !elem.firstChild.nodeValue) continue;
          const text = elem.firstChild.nodeValue;
          if (/^[ \t\n\r]/.test(text) || /[ \t\n\r]$/.test(text)) {
            const spaceAttr = elem.getAttributeNS(XML_NS, "space") || elem.getAttribute("xml:space");
            if (spaceAttr !== "preserve") {
              const preview = JSON.stringify(text).length > 50
                ? JSON.stringify(text).substring(0, 50) + "..."
                : JSON.stringify(text);
              errors.push(
                `  ${relPath(xmlFile, this.unpackedDir)}: w:t element with whitespace missing xml:space='preserve': ${preview}`
              );
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`  ${relPath(xmlFile, this.unpackedDir)}: Error: ${msg}`);
      }
    }

    if (errors.length > 0) {
      console.log(`FAILED - Found ${errors.length} whitespace preservation violations:`);
      for (const error of errors) console.log(error);
      return false;
    }
    if (this.verbose) console.log("PASSED - All whitespace is properly preserved");
    return true;
  }

  /* -- Deletion validation ----------------------------------------- */

  validateDeletions(): boolean {
    const errors: string[] = [];

    for (const xmlFile of this.xmlFiles) {
      if (path.basename(xmlFile) !== "document.xml") continue;

      try {
        const content = fs.readFileSync(xmlFile, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;

        // Find w:t elements inside w:del
        for (const tElem of findElementsByTag(root, WORD_2006_NS, "t")) {
          if (isAncestorTag(tElem, WORD_2006_NS, "del")) {
            const text = tElem.firstChild?.nodeValue || "";
            const preview = JSON.stringify(text).length > 50
              ? JSON.stringify(text).substring(0, 50) + "..."
              : JSON.stringify(text);
            errors.push(
              `  ${relPath(xmlFile, this.unpackedDir)}: <w:t> found within <w:del>: ${preview}`
            );
          }
        }

        // Find w:instrText inside w:del
        for (const instrElem of findElementsByTag(root, WORD_2006_NS, "instrText")) {
          if (isAncestorTag(instrElem, WORD_2006_NS, "del")) {
            const text = instrElem.firstChild?.nodeValue || "";
            const preview = JSON.stringify(text).length > 50
              ? JSON.stringify(text).substring(0, 50) + "..."
              : JSON.stringify(text);
            errors.push(
              `  ${relPath(xmlFile, this.unpackedDir)}: <w:instrText> found within <w:del> (use <w:delInstrText>): ${preview}`
            );
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`  ${relPath(xmlFile, this.unpackedDir)}: Error: ${msg}`);
      }
    }

    if (errors.length > 0) {
      console.log(`FAILED - Found ${errors.length} deletion validation violations:`);
      for (const error of errors) console.log(error);
      return false;
    }
    if (this.verbose) console.log("PASSED - No w:t elements found within w:del elements");
    return true;
  }

  /* -- Insertion validation ---------------------------------------- */

  validateInsertions(): boolean {
    const errors: string[] = [];

    for (const xmlFile of this.xmlFiles) {
      if (path.basename(xmlFile) !== "document.xml") continue;

      try {
        const content = fs.readFileSync(xmlFile, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;

        // Find w:delText inside w:ins but not inside w:del
        for (const elem of findElementsByTag(root, WORD_2006_NS, "delText")) {
          if (isAncestorTag(elem, WORD_2006_NS, "ins") && !isAncestorTag(elem, WORD_2006_NS, "del")) {
            const text = elem.firstChild?.nodeValue || "";
            const preview = JSON.stringify(text).length > 50
              ? JSON.stringify(text).substring(0, 50) + "..."
              : JSON.stringify(text);
            errors.push(
              `  ${relPath(xmlFile, this.unpackedDir)}: <w:delText> within <w:ins>: ${preview}`
            );
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`  ${relPath(xmlFile, this.unpackedDir)}: Error: ${msg}`);
      }
    }

    if (errors.length > 0) {
      console.log(`FAILED - Found ${errors.length} insertion validation violations:`);
      for (const error of errors) console.log(error);
      return false;
    }
    if (this.verbose) console.log("PASSED - No w:delText elements within w:ins elements");
    return true;
  }

  /* -- ID constraints (paraId / durableId) ------------------------- */

  private parseIdValue(val: string, base: number = 16): number {
    return parseInt(val, base);
  }

  validateIdConstraints(): boolean {
    const errors: string[] = [];

    for (const xmlFile of this.xmlFiles) {
      try {
        const content = fs.readFileSync(xmlFile, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;

        for (const elem of iterElements(root)) {
          // Check paraId (w14:paraId)
          let paraIdVal: string | null = null;
          if (elem.attributes) {
            for (let i = 0; i < elem.attributes.length; i++) {
              const attr = elem.attributes[i];
              if (attr.localName === "paraId" && (attr.namespaceURI === W14_NS || attr.name.includes("w14:"))) {
                paraIdVal = attr.value;
                break;
              }
            }
          }
          if (paraIdVal) {
            const val = this.parseIdValue(paraIdVal, 16);
            if (!isNaN(val) && val >= 0x80000000) {
              errors.push(
                `  ${path.basename(xmlFile)}: paraId=${paraIdVal} >= 0x80000000`
              );
            }
          }

          // Check durableId (w16cid:durableId)
          let durableIdVal: string | null = null;
          if (elem.attributes) {
            for (let i = 0; i < elem.attributes.length; i++) {
              const attr = elem.attributes[i];
              if (attr.localName === "durableId" && (attr.namespaceURI === W16CID_NS || attr.name.includes("w16cid:"))) {
                durableIdVal = attr.value;
                break;
              }
            }
          }
          if (durableIdVal) {
            const fileName = path.basename(xmlFile);
            if (fileName === "numbering.xml") {
              const val = this.parseIdValue(durableIdVal, 10);
              if (isNaN(val)) {
                errors.push(
                  `  ${fileName}: durableId=${durableIdVal} must be decimal in numbering.xml`
                );
              } else if (val >= 0x7FFFFFFF) {
                errors.push(
                  `  ${fileName}: durableId=${durableIdVal} >= 0x7FFFFFFF`
                );
              }
            } else {
              const val = this.parseIdValue(durableIdVal, 16);
              if (!isNaN(val) && val >= 0x7FFFFFFF) {
                errors.push(
                  `  ${fileName}: durableId=${durableIdVal} >= 0x7FFFFFFF`
                );
              }
            }
          }
        }
      } catch {
        // skip parse errors
      }
    }

    if (errors.length > 0) {
      console.log(`FAILED - ${errors.length} ID constraint violations:`);
      for (const e of errors) console.log(e);
      return false;
    }
    if (this.verbose) console.log("PASSED - All paraId/durableId values within constraints");
    return true;
  }

  /* -- Comment marker validation ----------------------------------- */

  validateCommentMarkers(): boolean {
    const errors: string[] = [];

    let documentXml: string | null = null;
    let commentsXml: string | null = null;
    for (const xmlFile of this.xmlFiles) {
      const name = path.basename(xmlFile);
      if (name === "document.xml" && xmlFile.includes("word")) {
        documentXml = xmlFile;
      } else if (name === "comments.xml") {
        commentsXml = xmlFile;
      }
    }

    if (!documentXml) {
      if (this.verbose) console.log("PASSED - No document.xml found (skipping comment validation)");
      return true;
    }

    try {
      const content = fs.readFileSync(documentXml, "utf-8");
      const dom = parseXml(content);
      const root = dom.documentElement;
      if (!root) return true;

      const wIdAttr = (elem: Element): string | null => {
        for (let i = 0; i < (elem.attributes?.length || 0); i++) {
          const attr = elem.attributes[i];
          if ((attr.localName === "id" && attr.namespaceURI === WORD_2006_NS) || attr.name === "w:id") {
            return attr.value;
          }
        }
        return null;
      };

      const rangeStarts = new Set<string>();
      const rangeEnds = new Set<string>();
      const references = new Set<string>();

      for (const elem of findElementsByTag(root, WORD_2006_NS, "commentRangeStart")) {
        const id = wIdAttr(elem);
        if (id) rangeStarts.add(id);
      }
      for (const elem of findElementsByTag(root, WORD_2006_NS, "commentRangeEnd")) {
        const id = wIdAttr(elem);
        if (id) rangeEnds.add(id);
      }
      for (const elem of findElementsByTag(root, WORD_2006_NS, "commentReference")) {
        const id = wIdAttr(elem);
        if (id) references.add(id);
      }

      // Orphaned ends (no matching start)
      for (const id of [...rangeEnds].filter((x) => !rangeStarts.has(x)).sort((a, b) => {
        const na = parseInt(a, 10), nb = parseInt(b, 10);
        return (isNaN(na) ? 0 : na) - (isNaN(nb) ? 0 : nb);
      })) {
        errors.push(`  document.xml: commentRangeEnd id="${id}" has no matching commentRangeStart`);
      }

      // Orphaned starts (no matching end)
      for (const id of [...rangeStarts].filter((x) => !rangeEnds.has(x)).sort((a, b) => {
        const na = parseInt(a, 10), nb = parseInt(b, 10);
        return (isNaN(na) ? 0 : na) - (isNaN(nb) ? 0 : nb);
      })) {
        errors.push(`  document.xml: commentRangeStart id="${id}" has no matching commentRangeEnd`);
      }

      // Check references against actual comments
      if (commentsXml && fs.existsSync(commentsXml)) {
        const commentsContent = fs.readFileSync(commentsXml, "utf-8");
        const commentsDom = parseXml(commentsContent);
        const commentsRoot = commentsDom.documentElement;
        if (commentsRoot) {
          const commentIds = new Set<string>();
          for (const elem of findElementsByTag(commentsRoot, WORD_2006_NS, "comment")) {
            const id = wIdAttr(elem);
            if (id) commentIds.add(id);
          }

          const markerIds = new Set([...rangeStarts, ...rangeEnds, ...references]);
          for (const id of [...markerIds].filter((x) => x && !commentIds.has(x)).sort((a, b) => {
            const na = parseInt(a, 10), nb = parseInt(b, 10);
            return (isNaN(na) ? 0 : na) - (isNaN(nb) ? 0 : nb);
          })) {
            errors.push(`  document.xml: marker id="${id}" references non-existent comment`);
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`  Error parsing XML: ${msg}`);
    }

    if (errors.length > 0) {
      console.log(`FAILED - ${errors.length} comment marker violations:`);
      for (const error of errors) console.log(error);
      return false;
    }
    if (this.verbose) console.log("PASSED - All comment markers properly paired");
    return true;
  }

  /* -- Paragraph counting ------------------------------------------ */

  countParagraphsInUnpacked(): number {
    let count = 0;
    for (const xmlFile of this.xmlFiles) {
      if (path.basename(xmlFile) !== "document.xml") continue;
      try {
        const content = fs.readFileSync(xmlFile, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;
        count = findElementsByTag(root, WORD_2006_NS, "p").length;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`Error counting paragraphs in unpacked document: ${msg}`);
      }
    }
    return count;
  }

  countParagraphsInOriginal(): number {
    if (!this.originalFile) return 0;

    try {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "docx-para-"));
      try {
        extractZip(this.originalFile, tmpDir);
        const docXml = path.join(tmpDir, "word", "document.xml");
        if (!fs.existsSync(docXml)) return 0;
        const content = fs.readFileSync(docXml, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) return 0;
        return findElementsByTag(root, WORD_2006_NS, "p").length;
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`Error counting paragraphs in original document: ${msg}`);
      return 0;
    }
  }

  compareParagraphCounts(): void {
    const originalCount = this.countParagraphsInOriginal();
    const newCount = this.countParagraphsInUnpacked();
    const diff = newCount - originalCount;
    const diffStr = diff > 0 ? `+${diff}` : String(diff);
    console.log(`\nParagraphs: ${originalCount} -> ${newCount} (${diffStr})`);
  }

  /* -- Repair (durableId) ------------------------------------------ */

  override repair(): number {
    let repairs = super.repair();
    repairs += this.repairDurableId();
    return repairs;
  }

  repairDurableId(): number {
    let repairs = 0;

    for (const xmlFile of this.xmlFiles) {
      try {
        const content = fs.readFileSync(xmlFile, "utf-8");
        const dom = parseXml(content);
        let modified = false;

        for (const elem of iterElements(dom)) {
          if (!elem.attributes) continue;

          let durableIdAttr: Attr | null = null;
          for (let i = 0; i < elem.attributes.length; i++) {
            const attr = elem.attributes[i];
            if (attr.name === "w16cid:durableId" ||
                (attr.localName === "durableId" && (attr.namespaceURI === W16CID_NS || attr.prefix === "w16cid"))) {
              durableIdAttr = attr;
              break;
            }
          }

          if (!durableIdAttr) continue;

          const durableId = durableIdAttr.value;
          let needsRepair = false;
          const fileName = path.basename(xmlFile);

          if (fileName === "numbering.xml") {
            const val = parseInt(durableId, 10);
            needsRepair = isNaN(val) || val >= 0x7FFFFFFF;
          } else {
            const val = parseInt(durableId, 16);
            needsRepair = isNaN(val) || val >= 0x7FFFFFFF;
          }

          if (needsRepair) {
            const value = Math.floor(Math.random() * 0x7FFFFFFE) + 1;
            const newId = fileName === "numbering.xml"
              ? String(value)
              : value.toString(16).toUpperCase().padStart(8, "0");

            elem.setAttribute(durableIdAttr.name, newId);
            console.log(`  Repaired: ${fileName}: durableId ${durableId} -> ${newId}`);
            repairs++;
            modified = true;
          }
        }

        if (modified) {
          const serializer = new XMLSerializer();
          fs.writeFileSync(xmlFile, serializer.serializeToString(dom), "utf-8");
        }
      } catch {
        // skip files that fail
      }
    }

    return repairs;
  }
}
