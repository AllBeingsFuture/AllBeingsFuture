/**
 * Merge adjacent runs with identical formatting in DOCX.
 *
 * Merges adjacent <w:r> elements that have identical <w:rPr> properties.
 * Works on runs in paragraphs and inside tracked changes (<w:ins>, <w:del>).
 *
 * Also:
 * - Removes rsid attributes from runs (revision metadata that doesn't affect rendering)
 * - Removes proofErr elements (spell/grammar markers that block merging)
 *
 * Usage:
 *   npx tsx merge-runs.ts <unpacked_dir>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

/* ------------------------------------------------------------------ */
/*  DOM helper utilities                                               */
/* ------------------------------------------------------------------ */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

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

function getChild(parent: Node, tag: string): Element | null {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element;
      const name = el.localName || el.tagName;
      if (name === tag || name.endsWith(`:${tag}`)) {
        return el;
      }
    }
  }
  return null;
}

function getChildren(parent: Node, tag: string): Element[] {
  const results: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element;
      const name = el.localName || el.tagName;
      if (name === tag || name.endsWith(`:${tag}`)) {
        results.push(el);
      }
    }
  }
  return results;
}

function isAdjacent(elem1: Node, elem2: Node): boolean {
  let node = elem1.nextSibling;
  while (node) {
    if (node === elem2) return true;
    if (node.nodeType === ELEMENT_NODE) return false;
    if (node.nodeType === TEXT_NODE && node.nodeValue && node.nodeValue.trim()) {
      return false;
    }
    node = node.nextSibling;
  }
  return false;
}

function isRun(node: Element): boolean {
  const name = node.localName || node.tagName;
  return name === "r" || name.endsWith(":r");
}

function removeElements(root: Node, tag: string): void {
  for (const elem of findElements(root, tag)) {
    if (elem.parentNode) {
      elem.parentNode.removeChild(elem);
    }
  }
}

function stripRunRsidAttrs(root: Node): void {
  for (const run of findElements(root, "r")) {
    const attrsToRemove: string[] = [];
    if (run.attributes) {
      for (let i = 0; i < run.attributes.length; i++) {
        const attr = run.attributes[i];
        if (attr.name.toLowerCase().includes("rsid")) {
          attrsToRemove.push(attr.name);
        }
      }
    }
    for (const attrName of attrsToRemove) {
      run.removeAttribute(attrName);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Merging logic                                                      */
/* ------------------------------------------------------------------ */

function canMerge(run1: Element, run2: Element): boolean {
  const rpr1 = getChild(run1, "rPr");
  const rpr2 = getChild(run2, "rPr");

  if ((rpr1 === null) !== (rpr2 === null)) return false;
  if (rpr1 === null) return true;

  const serializer = new XMLSerializer();
  return serializer.serializeToString(rpr1!) === serializer.serializeToString(rpr2!);
}

function mergeRunContent(target: Element, source: Element): void {
  const children = [];
  for (let i = 0; i < source.childNodes.length; i++) {
    children.push(source.childNodes[i]);
  }
  for (const child of children) {
    if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element;
      const name = el.localName || el.tagName;
      if (name !== "rPr" && !name.endsWith(":rPr")) {
        target.appendChild(child);
      }
    }
  }
}

function nextElementSibling(node: Node): Element | null {
  let sibling = node.nextSibling;
  while (sibling) {
    if (sibling.nodeType === ELEMENT_NODE) return sibling as Element;
    sibling = sibling.nextSibling;
  }
  return null;
}

function nextSiblingRun(node: Node): Element | null {
  let sibling = node.nextSibling;
  while (sibling) {
    if (sibling.nodeType === ELEMENT_NODE) {
      if (isRun(sibling as Element)) return sibling as Element;
    }
    sibling = sibling.nextSibling;
  }
  return null;
}

function firstChildRun(container: Node): Element | null {
  for (let i = 0; i < container.childNodes.length; i++) {
    const child = container.childNodes[i];
    if (child.nodeType === ELEMENT_NODE && isRun(child as Element)) {
      return child as Element;
    }
  }
  return null;
}

function consolidateText(run: Element): void {
  const tElements = getChildren(run, "t");

  for (let i = tElements.length - 1; i > 0; i--) {
    const curr = tElements[i];
    const prev = tElements[i - 1];

    if (isAdjacent(prev, curr)) {
      const prevText = prev.firstChild ? prev.firstChild.nodeValue || "" : "";
      const currText = curr.firstChild ? curr.firstChild.nodeValue || "" : "";
      const merged = prevText + currText;

      if (prev.firstChild) {
        prev.firstChild.nodeValue = merged;
      } else {
        prev.appendChild(run.ownerDocument.createTextNode(merged));
      }

      if (merged.startsWith(" ") || merged.endsWith(" ")) {
        prev.setAttribute("xml:space", "preserve");
      } else if (prev.hasAttribute("xml:space")) {
        prev.removeAttribute("xml:space");
      }

      run.removeChild(curr);
    }
  }
}

function mergeRunsIn(container: Node): number {
  let mergeCount = 0;
  let run = firstChildRun(container);

  while (run) {
    while (true) {
      const nextElem = nextElementSibling(run);
      if (nextElem && isRun(nextElem) && canMerge(run, nextElem)) {
        mergeRunContent(run, nextElem);
        container.removeChild(nextElem);
        mergeCount++;
      } else {
        break;
      }
    }

    consolidateText(run);
    run = nextSiblingRun(run);
  }

  return mergeCount;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function mergeRuns(inputDir: string): [number, string] {
  const docXml = path.join(inputDir, "word", "document.xml");

  if (!fs.existsSync(docXml)) {
    return [0, `Error: ${docXml} not found`];
  }

  try {
    const content = fs.readFileSync(docXml, "utf-8");
    const parser = new DOMParser();
    const dom = parser.parseFromString(content, "text/xml");
    const root = dom.documentElement;

    removeElements(root, "proofErr");
    stripRunRsidAttrs(root);

    const containers = new Set<Node>();
    for (const run of findElements(root, "r")) {
      if (run.parentNode) {
        containers.add(run.parentNode);
      }
    }

    let mergeCount = 0;
    for (const container of containers) {
      mergeCount += mergeRunsIn(container);
    }

    const serializer = new XMLSerializer();
    const output = serializer.serializeToString(dom);
    fs.writeFileSync(docXml, output, "utf-8");

    return [mergeCount, `Merged ${mergeCount} runs`];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return [0, `Error: ${msg}`];
  }
}

/* ------------------------------------------------------------------ */
/*  CLI entry point                                                    */
/* ------------------------------------------------------------------ */

if (process.argv[1] && (process.argv[1].endsWith("merge-runs.ts") || process.argv[1].endsWith("merge-runs.js"))) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: npx tsx merge-runs.ts <unpacked_dir>");
    process.exit(1);
  }
  const [count, message] = mergeRuns(args[0]);
  console.log(JSON.stringify({ mergeCount: count, message }));
  if (message.startsWith("Error")) process.exit(1);
}
