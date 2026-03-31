/**
 * Simplify tracked changes by merging adjacent w:ins or w:del elements.
 *
 * Merges adjacent <w:ins> elements from the same author into a single element.
 * Same for <w:del> elements. This makes heavily-redlined documents easier to
 * work with by reducing the number of tracked change wrappers.
 *
 * Rules:
 * - Only merges w:ins with w:ins, w:del with w:del (same element type)
 * - Only merges if same author (ignores timestamp differences)
 * - Only merges if truly adjacent (only whitespace between them)
 *
 * Usage:
 *   npx tsx simplify-redlines.ts <unpacked_dir>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/* ------------------------------------------------------------------ */
/*  DOM helper utilities                                               */
/* ------------------------------------------------------------------ */

function findElements(root: Node, tag: string): Element[] {
  const results: Element[] = [];
  function traverse(node: Node): void {
    if (node.nodeType === ELEMENT_NODE) {
      const el = node as Element;
      const name = el.localName || el.tagName;
      if (name === tag || name.endsWith(`:${tag}`)) {
        results.push(el);
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        traverse(node.childNodes[i]);
      }
    }
  }
  traverse(root);
  return results;
}

function isElement(node: Element, tag: string): boolean {
  const name = node.localName || node.tagName;
  return name === tag || name.endsWith(`:${tag}`);
}

function getAuthor(elem: Element): string {
  let author = elem.getAttribute("w:author");
  if (!author && elem.attributes) {
    for (let i = 0; i < elem.attributes.length; i++) {
      const attr = elem.attributes[i];
      if (attr.localName === "author" || attr.name.endsWith(":author")) {
        return attr.value;
      }
    }
  }
  return author || "";
}

function canMergeTracked(elem1: Element, elem2: Element): boolean {
  if (getAuthor(elem1) !== getAuthor(elem2)) return false;

  let node = elem1.nextSibling;
  while (node && node !== elem2) {
    if (node.nodeType === ELEMENT_NODE) return false;
    if (node.nodeType === TEXT_NODE && node.nodeValue && node.nodeValue.trim()) {
      return false;
    }
    node = node.nextSibling;
  }
  return true;
}

function mergeTrackedContent(target: Element, source: Element): void {
  while (source.firstChild) {
    const child = source.firstChild;
    source.removeChild(child);
    target.appendChild(child);
  }
}

function mergeTrackedChangesIn(container: Element, tag: string): number {
  let mergeCount = 0;

  const tracked: Element[] = [];
  for (let i = 0; i < container.childNodes.length; i++) {
    const child = container.childNodes[i];
    if (child.nodeType === ELEMENT_NODE && isElement(child as Element, tag)) {
      tracked.push(child as Element);
    }
  }

  if (tracked.length < 2) return 0;

  let i = 0;
  while (i < tracked.length - 1) {
    const curr = tracked[i];
    const nextElem = tracked[i + 1];

    if (canMergeTracked(curr, nextElem)) {
      mergeTrackedContent(curr, nextElem);
      container.removeChild(nextElem);
      tracked.splice(i + 1, 1);
      mergeCount++;
    } else {
      i++;
    }
  }

  return mergeCount;
}

/* ------------------------------------------------------------------ */
/*  Public API: simplifyRedlines                                       */
/* ------------------------------------------------------------------ */

export function simplifyRedlines(inputDir: string): [number, string] {
  const docXml = path.join(inputDir, "word", "document.xml");

  if (!fs.existsSync(docXml)) {
    return [0, `Error: ${docXml} not found`];
  }

  try {
    const content = fs.readFileSync(docXml, "utf-8");
    const parser = new DOMParser();
    const dom = parser.parseFromString(content, "text/xml");
    const root = dom.documentElement;

    let mergeCount = 0;
    const containers = [...findElements(root, "p"), ...findElements(root, "tc")];

    for (const container of containers) {
      mergeCount += mergeTrackedChangesIn(container, "ins");
      mergeCount += mergeTrackedChangesIn(container, "del");
    }

    const serializer = new XMLSerializer();
    const output = serializer.serializeToString(dom);
    fs.writeFileSync(docXml, output, "utf-8");

    return [mergeCount, `Simplified ${mergeCount} tracked changes`];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return [0, `Error: ${msg}`];
  }
}

/* ------------------------------------------------------------------ */
/*  Author tracking utilities (used by redlining validation)           */
/* ------------------------------------------------------------------ */

/**
 * Get tracked change author counts from an unpacked document.xml path.
 */
export function getTrackedChangeAuthors(docXmlPath: string): Record<string, number> {
  if (!fs.existsSync(docXmlPath)) return {};

  try {
    const content = fs.readFileSync(docXmlPath, "utf-8");
    const parser = new DOMParser();
    const dom = parser.parseFromString(content, "text/xml");
    const root = dom.documentElement;

    const authorAttr = `{${WORD_NS}}author`;
    const authors: Record<string, number> = {};

    for (const tag of ["ins", "del"]) {
      for (const elem of findElements(root, tag)) {
        const author = getAuthor(elem);
        if (author) {
          authors[author] = (authors[author] || 0) + 1;
        }
      }
    }

    return authors;
  } catch {
    return {};
  }
}

/**
 * Get tracked change author counts from a packed .docx file.
 */
export function getAuthorsFromDocx(docxPath: string): Record<string, number> {
  // This needs zip reading - delegated to the caller who has zip access
  // For direct use, the caller should unpack and use getTrackedChangeAuthors
  return {};
}

/**
 * Infer which author added new tracked changes by comparing modified vs original.
 */
export function inferAuthor(
  modifiedDir: string,
  originalAuthors: Record<string, number>,
  defaultAuthor: string = "Claude",
): string {
  const modifiedXml = path.join(modifiedDir, "word", "document.xml");
  const modifiedAuthors = getTrackedChangeAuthors(modifiedXml);

  if (Object.keys(modifiedAuthors).length === 0) return defaultAuthor;

  const newChanges: Record<string, number> = {};
  for (const [author, count] of Object.entries(modifiedAuthors)) {
    const originalCount = originalAuthors[author] || 0;
    const diff = count - originalCount;
    if (diff > 0) {
      newChanges[author] = diff;
    }
  }

  if (Object.keys(newChanges).length === 0) return defaultAuthor;

  if (Object.keys(newChanges).length === 1) {
    return Object.keys(newChanges)[0];
  }

  throw new Error(
    `Multiple authors added new changes: ${JSON.stringify(newChanges)}. ` +
    "Cannot infer which author to validate."
  );
}

/* ------------------------------------------------------------------ */
/*  CLI entry point                                                    */
/* ------------------------------------------------------------------ */

if (process.argv[1] && (process.argv[1].endsWith("simplify-redlines.ts") || process.argv[1].endsWith("simplify-redlines.js"))) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: npx tsx simplify-redlines.ts <unpacked_dir>");
    process.exit(1);
  }
  const [count, message] = simplifyRedlines(args[0]);
  console.log(JSON.stringify({ simplifyCount: count, message }));
  if (message.startsWith("Error")) process.exit(1);
}
