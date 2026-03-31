/**
 * Validator for tracked changes (redlining) in Word documents.
 *
 * Validates that all changes by a specified author are properly tracked:
 * - Removes the author's tracked changes from both original and modified
 * - Compares the remaining text content
 * - If text differs, the author made untracked modifications
 *
 * Usage:
 *   import { RedliningValidator } from "./validators/redlining.js";
 *   const v = new RedliningValidator({
 *     unpackedDir: "./unpacked",
 *     originalFile: "./original.docx",
 *     author: "Claude",
 *   });
 *   v.validate();
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync, spawnSync } from "node:child_process";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RedliningValidatorOptions {
  unpackedDir: string;
  originalFile: string;
  verbose?: boolean;
  author?: string;
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

const ELEMENT_NODE = 1;
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

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

function* iterElements(root: Node): Generator<Element> {
  if (root.nodeType === ELEMENT_NODE) yield root as Element;
  for (let i = 0; i < root.childNodes.length; i++) {
    yield* iterElements(root.childNodes[i]);
  }
}

function findElementsByNs(root: Element, nsUri: string, localTag: string): Element[] {
  const results: Element[] = [];
  for (const elem of iterElements(root)) {
    const ln = elem.localName || (elem.tagName || "").split(":").pop() || "";
    if (ln === localTag && (!nsUri || elem.namespaceURI === nsUri)) {
      results.push(elem);
    }
  }
  return results;
}

function extractZip(zipPath: string, outDir: string): void {
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
/*  RedliningValidator                                                 */
/* ------------------------------------------------------------------ */

export class RedliningValidator {
  unpackedDir: string;
  originalDocx: string;
  verbose: boolean;
  author: string;

  constructor(opts: RedliningValidatorOptions) {
    this.unpackedDir = path.resolve(opts.unpackedDir);
    this.originalDocx = path.resolve(opts.originalFile);
    this.verbose = opts.verbose ?? false;
    this.author = opts.author ?? "Claude";
  }

  repair(): number {
    return 0;
  }

  validate(): boolean {
    const modifiedFile = path.join(this.unpackedDir, "word", "document.xml");
    if (!fs.existsSync(modifiedFile)) {
      console.log(`FAILED - Modified document.xml not found at ${modifiedFile}`);
      return false;
    }

    // Quick check: any tracked changes by this author?
    try {
      const content = fs.readFileSync(modifiedFile, "utf-8");
      const dom = parseXml(content);
      const root = dom.documentElement;

      const delElements = findElementsByNs(root, WORD_NS, "del");
      const insElements = findElementsByNs(root, WORD_NS, "ins");

      const wAuthor = `{${WORD_NS}}author`;
      const authorDelCount = delElements.filter((e) => {
        const a = e.getAttribute("w:author") || e.getAttributeNS(WORD_NS, "author");
        return a === this.author;
      }).length;
      const authorInsCount = insElements.filter((e) => {
        const a = e.getAttribute("w:author") || e.getAttributeNS(WORD_NS, "author");
        return a === this.author;
      }).length;

      if (authorDelCount === 0 && authorInsCount === 0) {
        if (this.verbose) console.log(`PASSED - No tracked changes by ${this.author} found.`);
        return true;
      }
    } catch {
      // continue to full validation
    }

    // Extract original to temp dir
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "redline-"));
    try {
      extractZip(this.originalDocx, tmpDir);

      const originalFile = path.join(tmpDir, "word", "document.xml");
      if (!fs.existsSync(originalFile)) {
        console.log(`FAILED - Original document.xml not found in ${this.originalDocx}`);
        return false;
      }

      // Parse both documents
      let modifiedRoot: Element;
      let originalRoot: Element;
      try {
        const modContent = fs.readFileSync(modifiedFile, "utf-8");
        const modDom = parseXml(modContent);
        modifiedRoot = modDom.documentElement;

        const origContent = fs.readFileSync(originalFile, "utf-8");
        const origDom = parseXml(origContent);
        originalRoot = origDom.documentElement;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`FAILED - Error parsing XML files: ${msg}`);
        return false;
      }

      // Remove author's tracked changes from both
      this._removeAuthorTrackedChanges(originalRoot);
      this._removeAuthorTrackedChanges(modifiedRoot);

      // Compare text content
      const modifiedText = this._extractTextContent(modifiedRoot);
      const originalText = this._extractTextContent(originalRoot);

      if (modifiedText !== originalText) {
        const errorMessage = this._generateDetailedDiff(originalText, modifiedText);
        console.log(errorMessage);
        return false;
      }

      if (this.verbose) console.log(`PASSED - All changes by ${this.author} are properly tracked`);
      return true;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /* -- Internal helpers -------------------------------------------- */

  private _generateDetailedDiff(originalText: string, modifiedText: string): string {
    const parts = [
      `FAILED - Document text doesn't match after removing ${this.author}'s tracked changes`,
      "",
      "Likely causes:",
      "  1. Modified text inside another author's <w:ins> or <w:del> tags",
      "  2. Made edits without proper tracked changes",
      "  3. Didn't nest <w:del> inside <w:ins> when deleting another's insertion",
      "",
      "For pre-redlined documents, use correct patterns:",
      "  - To reject another's INSERTION: Nest <w:del> inside their <w:ins>",
      "  - To restore another's DELETION: Add new <w:ins> AFTER their <w:del>",
      "",
    ];

    const gitDiff = this._getGitWordDiff(originalText, modifiedText);
    if (gitDiff) {
      parts.push("Differences:", "============", gitDiff);
    } else {
      parts.push("Unable to generate word diff (git not available)");
    }

    return parts.join("\n");
  }

  private _getGitWordDiff(originalText: string, modifiedText: string): string | null {
    try {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-"));
      try {
        const origFile = path.join(tmpDir, "original.txt");
        const modFile = path.join(tmpDir, "modified.txt");
        fs.writeFileSync(origFile, originalText, "utf-8");
        fs.writeFileSync(modFile, modifiedText, "utf-8");

        // Try character-level diff first
        const result = spawnSync("git", [
          "diff",
          "--word-diff=plain",
          "--word-diff-regex=.",
          "-U0",
          "--no-index",
          origFile,
          modFile,
        ], { encoding: "utf-8", timeout: 5000 });

        const stdout = result.stdout || "";
        if (stdout.trim()) {
          const lines = stdout.split("\n");
          const contentLines: string[] = [];
          let inContent = false;
          for (const line of lines) {
            if (line.startsWith("@@")) { inContent = true; continue; }
            if (inContent && line.trim()) contentLines.push(line);
          }
          if (contentLines.length > 0) return contentLines.join("\n");
        }

        // Fall back to word-level diff
        const result2 = spawnSync("git", [
          "diff",
          "--word-diff=plain",
          "-U0",
          "--no-index",
          origFile,
          modFile,
        ], { encoding: "utf-8", timeout: 5000 });

        const stdout2 = result2.stdout || "";
        if (stdout2.trim()) {
          const lines = stdout2.split("\n");
          const contentLines: string[] = [];
          let inContent = false;
          for (const line of lines) {
            if (line.startsWith("@@")) { inContent = true; continue; }
            if (inContent && line.trim()) contentLines.push(line);
          }
          return contentLines.join("\n");
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // git not available
    }
    return null;
  }

  private _removeAuthorTrackedChanges(root: Element): void {
    const insTag = "ins";
    const delTag = "del";

    // Remove author's insertions (the entire <w:ins> wrapper and content)
    for (const parent of iterElements(root)) {
      const toRemove: Element[] = [];
      for (let i = 0; i < parent.childNodes.length; i++) {
        const child = parent.childNodes[i];
        if (child.nodeType !== ELEMENT_NODE) continue;
        const el = child as Element;
        const ln = el.localName || (el.tagName || "").split(":").pop() || "";
        if (ln === insTag && (el.namespaceURI === WORD_NS || (el.tagName || "").startsWith("w:"))) {
          const a = el.getAttribute("w:author") || el.getAttributeNS(WORD_NS, "author");
          if (a === this.author) toRemove.push(el);
        }
      }
      for (const elem of toRemove) {
        parent.removeChild(elem);
      }
    }

    // Convert author's deletions: promote <w:delText> to <w:t>
    const delTextLocalName = "delText";
    const tLocalName = "t";

    for (const parent of iterElements(root)) {
      const toProcess: [Element, number][] = [];
      for (let i = 0; i < parent.childNodes.length; i++) {
        const child = parent.childNodes[i];
        if (child.nodeType !== ELEMENT_NODE) continue;
        const el = child as Element;
        const ln = el.localName || (el.tagName || "").split(":").pop() || "";
        if (ln === delTag && (el.namespaceURI === WORD_NS || (el.tagName || "").startsWith("w:"))) {
          const a = el.getAttribute("w:author") || el.getAttributeNS(WORD_NS, "author");
          if (a === this.author) toProcess.push([el, i]);
        }
      }

      for (const [delElem, delIndex] of toProcess.reverse()) {
        // Convert delText to t
        for (const elem of iterElements(delElem)) {
          const ln = elem.localName || (elem.tagName || "").split(":").pop() || "";
          if (ln === delTextLocalName) {
            // Rename element by creating a new one
            const doc = elem.ownerDocument;
            const prefix = (elem.tagName || "").includes(":") ? (elem.tagName || "").split(":")[0] + ":" : "";
            // We can't rename in xmldom easily, so we re-tag by changing the internal tagName
            // xmldom doesn't support renaming directly - but for text comparison it works
            // since we only extract text from "t" elements. We need to update the tag.
            // Workaround: create new element, copy children
            const newElem = doc.createElementNS(WORD_NS, prefix + tLocalName);
            while (elem.firstChild) {
              newElem.appendChild(elem.firstChild);
            }
            // Copy attributes
            if (elem.attributes) {
              for (let a = 0; a < elem.attributes.length; a++) {
                const attr = elem.attributes[a];
                newElem.setAttribute(attr.name, attr.value);
              }
            }
            if (elem.parentNode) {
              elem.parentNode.replaceChild(newElem, elem);
            }
          }
        }

        // Move children of del element to parent
        const children: Node[] = [];
        for (let c = delElem.childNodes.length - 1; c >= 0; c--) {
          children.unshift(delElem.childNodes[c]);
        }
        const refNode = delElem.nextSibling;
        parent.removeChild(delElem);
        for (const child of children) {
          if (refNode) {
            parent.insertBefore(child, refNode);
          } else {
            parent.appendChild(child);
          }
        }
      }
    }
  }

  private _extractTextContent(root: Element): string {
    const paragraphs: string[] = [];

    for (const pElem of findElementsByNs(root, WORD_NS, "p")) {
      const textParts: string[] = [];
      for (const tElem of findElementsByNs(pElem, WORD_NS, "t")) {
        if (tElem.firstChild && tElem.firstChild.nodeValue) {
          textParts.push(tElem.firstChild.nodeValue);
        }
      }
      const paragraphText = textParts.join("");
      if (paragraphText) paragraphs.push(paragraphText);
    }

    return paragraphs.join("\n");
  }
}
