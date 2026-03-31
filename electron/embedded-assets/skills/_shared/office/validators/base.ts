/**
 * Base validator with common validation logic for OOXML document files.
 *
 * Provides XML well-formedness checks, namespace validation, unique ID checks,
 * file reference validation, content type validation, XSD schema validation,
 * and whitespace preservation repair.
 *
 * NOTE: XSD schema validation (lxml-based in Python) is NOT available in Node.js.
 * The validateAgainstXsd / validateFileAgainstXsd methods are stubbed to return true.
 * All structural validations (XML parsing, namespaces, IDs, references, content types)
 * are fully implemented.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ValidatorOptions {
  unpackedDir: string;
  originalFile?: string | null;
  verbose?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function globRecursive(dir: string, patterns: string[]): string[] {
  const results: string[] = [];
  function walk(d: string): void {
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) return;
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile()) {
        const ext = path.extname(entry).toLowerCase();
        if (patterns.some((p) => ext === p || entry === p)) {
          results.push(full);
        }
      }
    }
  }
  walk(dir);
  return results;
}

function allFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string): void {
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) return;
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile()) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function relPath(file: string, base: string): string {
  return path.relative(base, file).replace(/\\/g, "/");
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
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return doc;
}

function tryParseXml(filePath: string): Document | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return parseXml(content);
  } catch {
    return null;
  }
}

/** Walk all elements in a DOM tree. */
function* iterElements(root: Node): Generator<Element> {
  if (root.nodeType === 1) yield root as Element;
  for (let i = 0; i < root.childNodes.length; i++) {
    yield* iterElements(root.childNodes[i]);
  }
}

/** Get local tag name from a possibly-namespaced tag. */
function localName(tag: string): string {
  const idx = tag.lastIndexOf(":");
  return idx >= 0 ? tag.substring(idx + 1) : tag;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const IGNORED_VALIDATION_ERRORS = [
  "hyphenationZone",
  "purl.org/dc/terms",
];

const UNIQUE_ID_REQUIREMENTS: Record<string, [string, string]> = {
  comment: ["id", "file"],
  commentrangestart: ["id", "file"],
  commentrangeend: ["id", "file"],
  bookmarkstart: ["id", "file"],
  bookmarkend: ["id", "file"],
  sldid: ["id", "file"],
  sldmasterid: ["id", "global"],
  sldlayoutid: ["id", "global"],
  cm: ["authorid", "file"],
  sheet: ["sheetid", "file"],
  definedname: ["id", "file"],
  cxnsp: ["id", "file"],
  sp: ["id", "file"],
  pic: ["id", "file"],
  grpsp: ["id", "file"],
};

const EXCLUDED_ID_CONTAINERS = new Set(["sectionlst"]);

const MC_NAMESPACE = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const PACKAGE_RELATIONSHIPS_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_RELATIONSHIPS_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CONTENT_TYPES_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types";

const MAIN_CONTENT_FOLDERS = new Set(["word", "ppt", "xl"]);

/* ------------------------------------------------------------------ */
/*  BaseSchemaValidator                                                */
/* ------------------------------------------------------------------ */

export class BaseSchemaValidator {
  unpackedDir: string;
  originalFile: string | null;
  verbose: boolean;
  xmlFiles: string[];

  static ELEMENT_RELATIONSHIP_TYPES: Record<string, string> = {};

  constructor(opts: ValidatorOptions) {
    this.unpackedDir = path.resolve(opts.unpackedDir);
    this.originalFile = opts.originalFile ? path.resolve(opts.originalFile) : null;
    this.verbose = opts.verbose ?? false;

    this.xmlFiles = globRecursive(this.unpackedDir, [".xml", ".rels"]);

    if (this.xmlFiles.length === 0) {
      console.log(`Warning: No XML files found in ${this.unpackedDir}`);
    }
  }

  /* -- Methods to override ----------------------------------------- */

  validate(): boolean {
    throw new Error("Subclasses must implement the validate method");
  }

  repair(): number {
    return this.repairWhitespacePreservation();
  }

  getElementRelationshipTypes(): Record<string, string> {
    return (this.constructor as typeof BaseSchemaValidator).ELEMENT_RELATIONSHIP_TYPES;
  }

  /* -- Whitespace repair ------------------------------------------- */

  repairWhitespacePreservation(): number {
    let repairs = 0;

    for (const xmlFile of this.xmlFiles) {
      try {
        const content = fs.readFileSync(xmlFile, "utf-8");
        const dom = parseXml(content);
        let modified = false;

        for (const elem of iterElements(dom)) {
          if (elem.tagName && elem.tagName.endsWith(":t") && elem.firstChild) {
            const text = elem.firstChild.nodeValue;
            if (text && (text.startsWith(" ") || text.startsWith("\t") || text.endsWith(" ") || text.endsWith("\t"))) {
              if (elem.getAttribute("xml:space") !== "preserve") {
                elem.setAttribute("xml:space", "preserve");
                const preview = text.length > 30 ? JSON.stringify(text.substring(0, 30)) + "..." : JSON.stringify(text);
                console.log(`  Repaired: ${path.basename(xmlFile)}: Added xml:space='preserve' to ${elem.tagName}: ${preview}`);
                repairs++;
                modified = true;
              }
            }
          }
        }

        if (modified) {
          const serializer = new XMLSerializer();
          fs.writeFileSync(xmlFile, serializer.serializeToString(dom), "utf-8");
        }
      } catch {
        // skip files that cannot be parsed
      }
    }

    return repairs;
  }

  /* -- XML well-formedness ----------------------------------------- */

  validateXml(): boolean {
    const errors: string[] = [];

    for (const xmlFile of this.xmlFiles) {
      try {
        const content = fs.readFileSync(xmlFile, "utf-8");
        parseXml(content);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`  ${relPath(xmlFile, this.unpackedDir)}: ${msg}`);
      }
    }

    if (errors.length > 0) {
      console.log(`FAILED - Found ${errors.length} XML violations:`);
      for (const error of errors) console.log(error);
      return false;
    }
    if (this.verbose) console.log("PASSED - All XML files are well-formed");
    return true;
  }

  /* -- Namespace validation ---------------------------------------- */

  validateNamespaces(): boolean {
    const errors: string[] = [];

    for (const xmlFile of this.xmlFiles) {
      try {
        const content = fs.readFileSync(xmlFile, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;

        // Collect declared namespace prefixes
        const declared = new Set<string>();
        if (root.attributes) {
          for (let i = 0; i < root.attributes.length; i++) {
            const attr = root.attributes[i];
            if (attr.name.startsWith("xmlns:")) {
              declared.add(attr.name.substring(6));
            }
          }
        }

        // Check mc:Ignorable attribute
        if (root.attributes) {
          for (let i = 0; i < root.attributes.length; i++) {
            const attr = root.attributes[i];
            if (attr.name.endsWith("Ignorable") || attr.localName === "Ignorable") {
              const prefixes = attr.value.split(/\s+/);
              for (const ns of prefixes) {
                if (ns && !declared.has(ns)) {
                  errors.push(
                    `  ${relPath(xmlFile, this.unpackedDir)}: ` +
                    `Namespace '${ns}' in Ignorable but not declared`
                  );
                }
              }
            }
          }
        }
      } catch {
        continue;
      }
    }

    if (errors.length > 0) {
      console.log(`FAILED - ${errors.length} namespace issues:`);
      for (const error of errors) console.log(error);
      return false;
    }
    if (this.verbose) console.log("PASSED - All namespace prefixes properly declared");
    return true;
  }

  /* -- Unique ID validation ---------------------------------------- */

  validateUniqueIds(): boolean {
    const errors: string[] = [];
    const globalIds: Record<string, [string, number, string]> = {};

    for (const xmlFile of this.xmlFiles) {
      try {
        const content = fs.readFileSync(xmlFile, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;

        const fileIds: Record<string, Record<string, number>> = {};
        let lineCounter = 0;

        for (const elem of iterElements(root)) {
          lineCounter++;
          const tag = localName(elem.tagName || "").toLowerCase();

          if (!(tag in UNIQUE_ID_REQUIREMENTS)) continue;

          // Check if inside excluded container
          let inExcluded = false;
          let ancestor: Node | null = elem.parentNode;
          while (ancestor) {
            if (ancestor.nodeType === 1) {
              const aTag = localName((ancestor as Element).tagName || "").toLowerCase();
              if (EXCLUDED_ID_CONTAINERS.has(aTag)) {
                inExcluded = true;
                break;
              }
            }
            ancestor = ancestor.parentNode;
          }
          if (inExcluded) continue;

          const [attrName, scope] = UNIQUE_ID_REQUIREMENTS[tag];

          // Find the matching attribute
          let idValue: string | null = null;
          if (elem.attributes) {
            for (let i = 0; i < elem.attributes.length; i++) {
              const attr = elem.attributes[i];
              const attrLocal = localName(attr.name).toLowerCase();
              if (attrLocal === attrName) {
                idValue = attr.value;
                break;
              }
            }
          }

          if (idValue === null) continue;

          const rel = relPath(xmlFile, this.unpackedDir);

          if (scope === "global") {
            if (idValue in globalIds) {
              const [prevFile, prevLine, prevTag] = globalIds[idValue];
              errors.push(
                `  ${rel}: Line ~${lineCounter}: Global ID '${idValue}' in <${tag}> ` +
                `already used in ${prevFile} at line ~${prevLine} in <${prevTag}>`
              );
            } else {
              globalIds[idValue] = [rel, lineCounter, tag];
            }
          } else if (scope === "file") {
            const key = `${tag}:${attrName}`;
            if (!fileIds[key]) fileIds[key] = {};

            if (idValue in fileIds[key]) {
              const prevLine = fileIds[key][idValue];
              errors.push(
                `  ${rel}: Line ~${lineCounter}: Duplicate ${attrName}='${idValue}' in <${tag}> ` +
                `(first occurrence at line ~${prevLine})`
              );
            } else {
              fileIds[key][idValue] = lineCounter;
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`  ${relPath(xmlFile, this.unpackedDir)}: Error: ${msg}`);
      }
    }

    if (errors.length > 0) {
      console.log(`FAILED - Found ${errors.length} ID uniqueness violations:`);
      for (const error of errors) console.log(error);
      return false;
    }
    if (this.verbose) console.log("PASSED - All required IDs are unique");
    return true;
  }

  /* -- File reference validation ----------------------------------- */

  validateFileReferences(): boolean {
    const errors: string[] = [];

    const relsFiles = globRecursive(this.unpackedDir, [".rels"]);
    if (relsFiles.length === 0) {
      if (this.verbose) console.log("PASSED - No .rels files found");
      return true;
    }

    const allFilePaths = allFiles(this.unpackedDir).filter((f) => {
      const name = path.basename(f);
      return name !== "[Content_Types].xml" && !name.endsWith(".rels");
    }).map((f) => path.resolve(f));

    const allReferencedFiles = new Set<string>();

    if (this.verbose) {
      console.log(`Found ${relsFiles.length} .rels files and ${allFilePaths.length} target files`);
    }

    for (const relsFile of relsFiles) {
      try {
        const content = fs.readFileSync(relsFile, "utf-8");
        const dom = parseXml(content);
        const root = dom.documentElement;
        if (!root) continue;

        const relsDir = path.dirname(relsFile);
        const brokenRefs: [string, number][] = [];

        for (const elem of iterElements(root)) {
          if (localName(elem.tagName || "") !== "Relationship") continue;
          const target = elem.getAttribute("Target");
          if (!target || target.startsWith("http") || target.startsWith("mailto:")) continue;

          let targetPath: string;
          if (target.startsWith("/")) {
            targetPath = path.join(this.unpackedDir, target.replace(/^\//, ""));
          } else if (path.basename(relsFile) === ".rels") {
            targetPath = path.join(this.unpackedDir, target);
          } else {
            const baseDir = path.dirname(relsDir);
            targetPath = path.join(baseDir, target);
          }

          try {
            targetPath = path.resolve(targetPath);
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
              allReferencedFiles.add(targetPath);
            } else {
              brokenRefs.push([target, 0]);
            }
          } catch {
            brokenRefs.push([target, 0]);
          }
        }

        if (brokenRefs.length > 0) {
          const relP = relPath(relsFile, this.unpackedDir);
          for (const [brokenRef] of brokenRefs) {
            errors.push(`  ${relP}: Broken reference to ${brokenRef}`);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const relP = relPath(relsFile, this.unpackedDir);
        errors.push(`  Error parsing ${relP}: ${msg}`);
      }
    }

    // Check for unreferenced files
    for (const filePath of allFilePaths) {
      if (!allReferencedFiles.has(filePath)) {
        errors.push(`  Unreferenced file: ${relPath(filePath, this.unpackedDir)}`);
      }
    }

    if (errors.length > 0) {
      console.log(`FAILED - Found ${errors.length} relationship validation errors:`);
      for (const error of errors) console.log(error);
      console.log(
        "CRITICAL: These errors will cause the document to appear corrupt. " +
        "Broken references MUST be fixed, " +
        "and unreferenced files MUST be referenced or removed."
      );
      return false;
    }
    if (this.verbose) {
      console.log("PASSED - All references are valid and all files are properly referenced");
    }
    return true;
  }

  /* -- Relationship ID validation ---------------------------------- */

  validateAllRelationshipIds(): boolean {
    const errors: string[] = [];

    for (const xmlFile of this.xmlFiles) {
      if (xmlFile.endsWith(".rels")) continue;

      const relsDir = path.join(path.dirname(xmlFile), "_rels");
      const relsFile = path.join(relsDir, `${path.basename(xmlFile)}.rels`);

      if (!fs.existsSync(relsFile)) continue;

      try {
        const relsContent = fs.readFileSync(relsFile, "utf-8");
        const relsDom = parseXml(relsContent);
        const relsRoot = relsDom.documentElement;
        if (!relsRoot) continue;

        const ridToType: Record<string, string> = {};

        for (const rel of iterElements(relsRoot)) {
          if (localName(rel.tagName || "") !== "Relationship") continue;
          const rid = rel.getAttribute("Id");
          const relType = rel.getAttribute("Type") || "";
          if (rid) {
            if (rid in ridToType) {
              errors.push(
                `  ${relPath(relsFile, this.unpackedDir)}: ` +
                `Duplicate relationship ID '${rid}' (IDs must be unique)`
              );
            }
            const typeName = relType.includes("/") ? relType.split("/").pop()! : relType;
            ridToType[rid] = typeName;
          }
        }

        const xmlContent = fs.readFileSync(xmlFile, "utf-8");
        const xmlDom = parseXml(xmlContent);
        const xmlRoot = xmlDom.documentElement;
        if (!xmlRoot) continue;

        const rNs = OFFICE_RELATIONSHIPS_NAMESPACE;
        const ridAttrsToCheck = ["id", "embed", "link"];

        for (const elem of iterElements(xmlRoot)) {
          for (const attrName of ridAttrsToCheck) {
            // Check for r:id, r:embed, r:link (with namespace prefix)
            let ridAttr: string | null = null;
            if (elem.attributes) {
              for (let i = 0; i < elem.attributes.length; i++) {
                const attr = elem.attributes[i];
                // Match both fully-qualified namespace and r: prefix
                if (attr.localName === attrName && (
                  attr.namespaceURI === rNs ||
                  attr.prefix === "r"
                )) {
                  ridAttr = attr.value;
                  break;
                }
              }
            }

            if (!ridAttr) continue;

            const elemName = localName(elem.tagName || "");
            const xmlRelP = relPath(xmlFile, this.unpackedDir);

            if (!(ridAttr in ridToType)) {
              const validIds = Object.keys(ridToType).sort().slice(0, 5);
              const suffix = Object.keys(ridToType).length > 5 ? "..." : "";
              errors.push(
                `  ${xmlRelP}: <${elemName}> r:${attrName} references non-existent relationship '${ridAttr}' ` +
                `(valid IDs: ${validIds.join(", ")}${suffix})`
              );
            } else if (attrName === "id") {
              const relTypes = this.getElementRelationshipTypes();
              if (Object.keys(relTypes).length > 0) {
                const expectedType = this._getExpectedRelationshipType(elemName, relTypes);
                if (expectedType) {
                  const actualType = ridToType[ridAttr];
                  if (!actualType.toLowerCase().includes(expectedType)) {
                    errors.push(
                      `  ${xmlRelP}: <${elemName}> references '${ridAttr}' which points to '${actualType}' ` +
                      `but should point to a '${expectedType}' relationship`
                    );
                  }
                }
              }
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`  Error processing ${relPath(xmlFile, this.unpackedDir)}: ${msg}`);
      }
    }

    if (errors.length > 0) {
      console.log(`FAILED - Found ${errors.length} relationship ID reference errors:`);
      for (const error of errors) console.log(error);
      console.log("\nThese ID mismatches will cause the document to appear corrupt!");
      return false;
    }
    if (this.verbose) console.log("PASSED - All relationship ID references are valid");
    return true;
  }

  _getExpectedRelationshipType(
    elementName: string,
    relTypes: Record<string, string>,
  ): string | null {
    const lower = elementName.toLowerCase();

    if (lower in relTypes) return relTypes[lower];

    if (lower.endsWith("id") && lower.length > 2) {
      const prefix = lower.substring(0, lower.length - 2);
      if (prefix.endsWith("master")) return prefix;
      if (prefix.endsWith("layout")) return prefix;
      if (prefix === "sld") return "slide";
      return prefix;
    }

    if (lower.endsWith("reference") && lower.length > 9) {
      return lower.substring(0, lower.length - 9);
    }

    return null;
  }

  /* -- Content types validation ------------------------------------ */

  validateContentTypes(): boolean {
    const errors: string[] = [];
    const ctFile = path.join(this.unpackedDir, "[Content_Types].xml");

    if (!fs.existsSync(ctFile)) {
      console.log("FAILED - [Content_Types].xml file not found");
      return false;
    }

    try {
      const content = fs.readFileSync(ctFile, "utf-8");
      const dom = parseXml(content);
      const root = dom.documentElement;
      if (!root) {
        errors.push("  Error: Could not parse [Content_Types].xml");
      } else {
        const declaredParts = new Set<string>();
        const declaredExtensions = new Set<string>();

        for (const elem of iterElements(root)) {
          const tag = localName(elem.tagName || "");
          if (tag === "Override") {
            const partName = elem.getAttribute("PartName");
            if (partName) declaredParts.add(partName.replace(/^\//, ""));
          } else if (tag === "Default") {
            const extension = elem.getAttribute("Extension");
            if (extension) declaredExtensions.add(extension.toLowerCase());
          }
        }

        const declarableRoots = new Set([
          "sld", "sldLayout", "sldMaster", "presentation",
          "document", "workbook", "worksheet", "theme",
        ]);

        const mediaExtensions: Record<string, string> = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          bmp: "image/bmp",
          tiff: "image/tiff",
          wmf: "image/x-wmf",
          emf: "image/x-emf",
        };

        // Check XML files have content type declarations
        for (const xmlFile of this.xmlFiles) {
          const pathStr = relPath(xmlFile, this.unpackedDir);
          if ([".rels", "[Content_Types]", "docProps/", "_rels/"].some((s) => pathStr.includes(s))) {
            continue;
          }

          try {
            const xmlContent = fs.readFileSync(xmlFile, "utf-8");
            const xmlDom = parseXml(xmlContent);
            const xmlRoot = xmlDom.documentElement;
            if (!xmlRoot) continue;

            const rootName = localName(xmlRoot.tagName || "");
            if (declarableRoots.has(rootName) && !declaredParts.has(pathStr)) {
              errors.push(`  ${pathStr}: File with <${rootName}> root not declared in [Content_Types].xml`);
            }
          } catch {
            continue;
          }
        }

        // Check media files have extension declarations
        const allFilesList = allFiles(this.unpackedDir);
        for (const filePath of allFilesList) {
          const ext = path.extname(filePath).toLowerCase();
          if (ext === ".xml" || ext === ".rels") continue;
          if (path.basename(filePath) === "[Content_Types].xml") continue;

          const parts = relPath(filePath, this.unpackedDir).split("/");
          if (parts.includes("_rels") || parts.includes("docProps")) continue;

          const extension = ext.replace(/^\./, "");
          if (extension && !declaredExtensions.has(extension) && extension in mediaExtensions) {
            errors.push(
              `  ${relPath(filePath, this.unpackedDir)}: File with extension '${extension}' not declared in [Content_Types].xml ` +
              `- should add: <Default Extension="${extension}" ContentType="${mediaExtensions[extension]}"/>`
            );
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`  Error parsing [Content_Types].xml: ${msg}`);
    }

    if (errors.length > 0) {
      console.log(`FAILED - Found ${errors.length} content type declaration errors:`);
      for (const error of errors) console.log(error);
      return false;
    }
    if (this.verbose) {
      console.log("PASSED - All content files are properly declared in [Content_Types].xml");
    }
    return true;
  }

  /* -- XSD validation (stub - no lxml in Node.js) -------------------- */

  validateAgainstXsd(): boolean {
    if (this.verbose) {
      console.log("SKIPPED - XSD schema validation not available in Node.js (requires lxml)");
    }
    return true;
  }

  validateFileAgainstXsd(_xmlFile: string, _verbose = false): [boolean | null, Set<string>] {
    return [null, new Set()];
  }
}
