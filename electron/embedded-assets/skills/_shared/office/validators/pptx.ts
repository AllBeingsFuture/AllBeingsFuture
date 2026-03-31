/**
 * Validator for PowerPoint presentation (PPTX) XML files.
 *
 * Checks:
 * - XML well-formedness
 * - Namespace declarations
 * - Unique IDs
 * - UUID-format IDs
 * - File references
 * - Slide layout IDs
 * - Content types
 * - XSD validation (stubbed in TS)
 * - Notes slide references
 * - Relationship IDs
 * - No duplicate slide layouts per slide
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
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

function relPath(file: string, base: string): string {
  return path.relative(base, file).replace(/\\/g, "/");
}

function globRecursive(dir: string, patterns: string[]): string[] {
  const results: string[] = [];
  function walk(d: string): void {
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) return;
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) {
        for (const p of patterns) {
          if (full.endsWith(p) || entry.match(new RegExp(p.replace("*", ".*")))) {
            results.push(full);
            break;
          }
        }
      }
    }
  }
  walk(dir);
  return results;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PRESENTATIONML_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const PACKAGE_RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const UUID_PATTERN = /^[{(]?[0-9A-Fa-f]{8}-?[0-9A-Fa-f]{4}-?[0-9A-Fa-f]{4}-?[0-9A-Fa-f]{4}-?[0-9A-Fa-f]{12}[})]?$/;

/* ------------------------------------------------------------------ */
/*  PPTXSchemaValidator                                                */
/* ------------------------------------------------------------------ */

export class PPTXSchemaValidator extends BaseSchemaValidator {
  static override ELEMENT_RELATIONSHIP_TYPES: Record<string, string> = {
    sldid: "slide",
    sldmasterid: "slidemaster",
    notesmasterid: "notesmaster",
    sldlayoutid: "slidelayout",
    themeid: "theme",
    tablestyleid: "tablestyles",
  };

  constructor(opts: ValidatorOptions) {
    super(opts);
  }

  override getElementRelationshipTypes(): Record<string, string> {
    return PPTXSchemaValidator.ELEMENT_RELATIONSHIP_TYPES;
  }

  override validate(): boolean {
    if (!this.validateXml()) return false;

    let allValid = true;
    if (!this.validateNamespaces()) allValid = false;
    if (!this.validateUniqueIds()) allValid = false;
    if (!this.validateUuidIds()) allValid = false;
    if (!this.validateFileReferences()) allValid = false;
    if (!this.validateSlideLayoutIds()) allValid = false;
    if (!this.validateContentTypes()) allValid = false;
    if (!this.validateAgainstXsd()) allValid = false;
    if (!this.validateNotesSlideReferences()) allValid = false;
    if (!this.validateAllRelationshipIds()) allValid = false;
    if (!this.validateNoDuplicateSlideLayouts()) allValid = false;

    return allValid;
  }

  /* -- UUID ID validation ------------------------------------------ */

  private looksLikeUuid(value: string): boolean {
    const clean = value.replace(/[{}()]/g, "").replace(/-/g, "");
    return clean.length === 32 && /^[0-9A-Za-z]+$/.test(clean);
  }

  validateUuidIds(): boolean {
    const errors: string[] = [];

    for (const xmlFile of this.xmlFiles) {
      try {
        const content = fs.readFileSync(xmlFile, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;

        for (const elem of iterElements(root)) {
          if (!elem.attributes) continue;
          for (let i = 0; i < elem.attributes.length; i++) {
            const attr = elem.attributes[i];
            const attrName = localName(attr.name).toLowerCase();
            if (attrName === "id" || attrName.endsWith("id")) {
              if (this.looksLikeUuid(attr.value)) {
                if (!UUID_PATTERN.test(attr.value)) {
                  errors.push(
                    `  ${relPath(xmlFile, this.unpackedDir)}: ` +
                    `ID '${attr.value}' appears to be a UUID but contains invalid hex characters`
                  );
                }
              }
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`  ${relPath(xmlFile, this.unpackedDir)}: Error: ${msg}`);
      }
    }

    if (errors.length > 0) {
      console.log(`FAILED - Found ${errors.length} UUID ID validation errors:`);
      for (const error of errors) console.log(error);
      return false;
    }
    if (this.verbose) console.log("PASSED - All UUID-like IDs contain valid hex values");
    return true;
  }

  /* -- Slide layout ID validation ---------------------------------- */

  validateSlideLayoutIds(): boolean {
    const errors: string[] = [];

    const slideMastersDir = path.join(this.unpackedDir, "ppt", "slideMasters");
    if (!fs.existsSync(slideMastersDir)) {
      if (this.verbose) console.log("PASSED - No slide masters found");
      return true;
    }

    const slideMasters = fs.readdirSync(slideMastersDir)
      .filter((f) => f.endsWith(".xml"))
      .map((f) => path.join(slideMastersDir, f));

    if (slideMasters.length === 0) {
      if (this.verbose) console.log("PASSED - No slide masters found");
      return true;
    }

    for (const slideMaster of slideMasters) {
      try {
        const content = fs.readFileSync(slideMaster, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;

        const relsFile = path.join(
          path.dirname(slideMaster), "_rels", `${path.basename(slideMaster)}.rels`
        );

        if (!fs.existsSync(relsFile)) {
          errors.push(
            `  ${relPath(slideMaster, this.unpackedDir)}: ` +
            `Missing relationships file: ${relPath(relsFile, this.unpackedDir)}`
          );
          continue;
        }

        const relsContent = fs.readFileSync(relsFile, "utf-8");
        const relsDom = parseXml(relsContent);
        const relsRoot = relsDom.documentElement;
        if (!relsRoot) continue;

        // Collect valid layout relationship IDs
        const validLayoutRids = new Set<string>();
        for (const rel of iterElements(relsRoot)) {
          if (localName(rel.tagName || "") !== "Relationship") continue;
          const relType = rel.getAttribute("Type") || "";
          if (relType.includes("slideLayout")) {
            const id = rel.getAttribute("Id");
            if (id) validLayoutRids.add(id);
          }
        }

        // Check sldLayoutId references
        for (const elem of iterElements(root)) {
          const ln = elem.localName || localName(elem.tagName || "");
          if (ln !== "sldLayoutId") continue;

          let rId: string | null = null;
          if (elem.attributes) {
            for (let i = 0; i < elem.attributes.length; i++) {
              const attr = elem.attributes[i];
              if ((attr.localName === "id" && attr.namespaceURI === OFFICE_RELATIONSHIPS_NS) || attr.name === "r:id") {
                rId = attr.value;
                break;
              }
            }
          }

          const layoutId = elem.getAttribute("id");
          if (rId && !validLayoutRids.has(rId)) {
            errors.push(
              `  ${relPath(slideMaster, this.unpackedDir)}: ` +
              `sldLayoutId with id='${layoutId}' references r:id='${rId}' ` +
              `which is not found in slide layout relationships`
            );
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`  ${relPath(slideMaster, this.unpackedDir)}: Error: ${msg}`);
      }
    }

    if (errors.length > 0) {
      console.log(`FAILED - Found ${errors.length} slide layout ID validation errors:`);
      for (const error of errors) console.log(error);
      console.log("Remove invalid references or add missing slide layouts to the relationships file.");
      return false;
    }
    if (this.verbose) console.log("PASSED - All slide layout IDs reference valid slide layouts");
    return true;
  }

  /* -- No duplicate slide layouts ---------------------------------- */

  validateNoDuplicateSlideLayouts(): boolean {
    const errors: string[] = [];

    const slideRelsDir = path.join(this.unpackedDir, "ppt", "slides", "_rels");
    if (!fs.existsSync(slideRelsDir)) {
      if (this.verbose) console.log("PASSED - No slide rels directory found");
      return true;
    }

    const slideRelsFiles = fs.readdirSync(slideRelsDir)
      .filter((f) => f.endsWith(".xml.rels"))
      .map((f) => path.join(slideRelsDir, f));

    for (const relsFile of slideRelsFiles) {
      try {
        const content = fs.readFileSync(relsFile, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;

        let layoutCount = 0;
        for (const rel of iterElements(root)) {
          if (localName(rel.tagName || "") !== "Relationship") continue;
          const relType = rel.getAttribute("Type") || "";
          if (relType.includes("slideLayout")) layoutCount++;
        }

        if (layoutCount > 1) {
          errors.push(
            `  ${relPath(relsFile, this.unpackedDir)}: has ${layoutCount} slideLayout references`
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`  ${relPath(relsFile, this.unpackedDir)}: Error: ${msg}`);
      }
    }

    if (errors.length > 0) {
      console.log("FAILED - Found slides with duplicate slideLayout references:");
      for (const error of errors) console.log(error);
      return false;
    }
    if (this.verbose) console.log("PASSED - All slides have exactly one slideLayout reference");
    return true;
  }

  /* -- Notes slide reference validation ---------------------------- */

  validateNotesSlideReferences(): boolean {
    const errors: string[] = [];
    const notesSlideRefs: Record<string, [string, string][]> = {};

    const slideRelsDir = path.join(this.unpackedDir, "ppt", "slides", "_rels");
    if (!fs.existsSync(slideRelsDir)) {
      if (this.verbose) console.log("PASSED - No slide relationship files found");
      return true;
    }

    const slideRelsFiles = fs.readdirSync(slideRelsDir)
      .filter((f) => f.endsWith(".xml.rels"))
      .map((f) => path.join(slideRelsDir, f));

    if (slideRelsFiles.length === 0) {
      if (this.verbose) console.log("PASSED - No slide relationship files found");
      return true;
    }

    for (const relsFile of slideRelsFiles) {
      try {
        const content = fs.readFileSync(relsFile, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;

        for (const rel of iterElements(root)) {
          if (localName(rel.tagName || "") !== "Relationship") continue;
          const relType = rel.getAttribute("Type") || "";
          if (!relType.includes("notesSlide")) continue;

          const target = rel.getAttribute("Target") || "";
          if (!target) continue;

          const normalized = target.replace(/\.\.\//g, "");
          const slideName = path.basename(relsFile).replace(".xml.rels", "");

          if (!notesSlideRefs[normalized]) notesSlideRefs[normalized] = [];
          notesSlideRefs[normalized].push([slideName, relsFile]);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`  ${relPath(relsFile, this.unpackedDir)}: Error: ${msg}`);
      }
    }

    for (const [target, refs] of Object.entries(notesSlideRefs)) {
      if (refs.length > 1) {
        const slideNames = refs.map((r) => r[0]);
        errors.push(
          `  Notes slide '${target}' is referenced by multiple slides: ${slideNames.join(", ")}`
        );
        for (const [, rFile] of refs) {
          errors.push(`    - ${relPath(rFile, this.unpackedDir)}`);
        }
      }
    }

    if (errors.length > 0) {
      const mainErrors = errors.filter((e) => !e.startsWith("    "));
      console.log(`FAILED - Found ${mainErrors.length} notes slide reference validation errors:`);
      for (const error of errors) console.log(error);
      console.log("Each slide may optionally have its own slide file.");
      return false;
    }
    if (this.verbose) console.log("PASSED - All notes slide references are unique");
    return true;
  }
}
