/**
 * Utilities for editing OOXML documents.
 *
 * This module provides XMLEditor, a tool for manipulating XML files with support for
 * line-number-based node finding and DOM manipulation. Each element is automatically
 * annotated with its original line and column position during parsing.
 *
 * Example usage:
 *    const editor = new XMLEditor("document.xml");
 *
 *    // Find node by line number or range
 *    const elem = editor.getNode({ tag: "w:r", lineNumber: 519 });
 *    const elem2 = editor.getNode({ tag: "w:p", lineNumber: { start: 100, end: 200 } });
 *
 *    // Find node by text content
 *    const elem3 = editor.getNode({ tag: "w:p", contains: "specific text" });
 *
 *    // Find node by attributes
 *    const elem4 = editor.getNode({ tag: "w:r", attrs: { "w:id": "target" } });
 *
 *    // Replace, insert, or manipulate
 *    const newNodes = editor.replaceNode(elem, "<w:r><w:t>new text</w:t></w:r>");
 *    editor.insertAfter(newNodes[0], "<w:r><w:t>more</w:t></w:r>");
 *
 *    // Save changes
 *    editor.save();
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

/**
 * Unescape HTML entities to Unicode characters.
 * Handles numeric (&#NNN; &#xHH;) and named entities (&amp; &lt; &gt; &quot; &apos;).
 */
function htmlUnescape(text: string): string {
  return text
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

interface LineRange {
  start: number;
  end: number;
}

interface GetNodeOptions {
  tag: string;
  attrs?: Record<string, string>;
  lineNumber?: number | LineRange;
  contains?: string;
}

/**
 * Recursively extract all text content from an element.
 *
 * Skips text nodes that contain only whitespace (spaces, tabs, newlines),
 * which typically represent XML formatting rather than document content.
 */
function getElementText(elem: Node): string {
  const parts: string[] = [];
  const childNodes = elem.childNodes;
  if (!childNodes) return "";
  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];
    if (node.nodeType === 3) {
      // TEXT_NODE
      const data = node.nodeValue || "";
      if (data.trim()) {
        parts.push(data);
      }
    } else if (node.nodeType === 1) {
      // ELEMENT_NODE
      parts.push(getElementText(node));
    }
  }
  return parts.join("");
}

/**
 * Editor for manipulating OOXML XML files with line-number-based node finding.
 *
 * This class parses XML files and tracks the original line and column position
 * of each element via @xmldom/xmldom's built-in locator support.
 * Elements get lineNumber and columnNumber properties set during parsing.
 */
class XMLEditor {
  xmlPath: string;
  encoding: string;
  dom: Document;

  constructor(xmlPath: string) {
    this.xmlPath = path.resolve(xmlPath);
    if (!fs.existsSync(this.xmlPath)) {
      throw new Error(`XML file not found: ${xmlPath}`);
    }

    const rawBytes = fs.readFileSync(this.xmlPath);
    const header = rawBytes.subarray(0, 200).toString("utf-8");
    this.encoding = header.includes('encoding="ascii"') ? "ascii" : "utf-8";

    const xmlContent = rawBytes.toString("utf-8");

    // Parse with locator to get line/column tracking on elements
    const parser = new DOMParser({ locator: {} } as any);
    this.dom = parser.parseFromString(xmlContent, "text/xml");
  }

  /**
   * Get a DOM element by tag and identifier.
   *
   * Finds an element by either its line number in the original file or by
   * matching attribute values. Exactly one match must be found.
   */
  getNode(options: GetNodeOptions): Element {
    const { tag, attrs, lineNumber, contains } = options;
    const matches: Element[] = [];

    const elements = this.dom.getElementsByTagName(tag);
    for (let i = 0; i < elements.length; i++) {
      const elem = elements[i] as any;

      // Check lineNumber filter
      if (lineNumber !== undefined) {
        const elemLine: number | undefined = elem.lineNumber;

        if (typeof lineNumber === "number") {
          if (elemLine !== lineNumber) continue;
        } else {
          // LineRange
          if (
            elemLine === undefined ||
            elemLine < lineNumber.start ||
            elemLine >= lineNumber.end
          )
            continue;
        }
      }

      // Check attrs filter
      if (attrs !== undefined) {
        let allMatch = true;
        for (const [attrName, attrValue] of Object.entries(attrs)) {
          if (elements[i].getAttribute(attrName) !== attrValue) {
            allMatch = false;
            break;
          }
        }
        if (!allMatch) continue;
      }

      // Check contains filter
      if (contains !== undefined) {
        const elemText = getElementText(elements[i]);
        const normalizedContains = htmlUnescape(contains);
        if (!elemText.includes(normalizedContains)) continue;
      }

      matches.push(elements[i]);
    }

    if (matches.length === 0) {
      const filters: string[] = [];
      if (lineNumber !== undefined) {
        if (typeof lineNumber === "number") {
          filters.push(`at line ${lineNumber}`);
        } else {
          filters.push(`at lines ${lineNumber.start}-${lineNumber.end - 1}`);
        }
      }
      if (attrs !== undefined) {
        filters.push(`with attributes ${JSON.stringify(attrs)}`);
      }
      if (contains !== undefined) {
        filters.push(`containing '${contains}'`);
      }

      const filterDesc = filters.length > 0 ? " " + filters.join(" ") : "";
      const baseMsg = `Node not found: <${tag}>${filterDesc}`.trim();

      let hint: string;
      if (contains) {
        hint =
          "Text may be split across elements or use different wording.";
      } else if (lineNumber) {
        hint = "Line numbers may have changed if document was modified.";
      } else if (attrs) {
        hint = "Verify attribute values are correct.";
      } else {
        hint = "Try adding filters (attrs, lineNumber, or contains).";
      }

      throw new Error(`${baseMsg}. ${hint}`);
    }
    if (matches.length > 1) {
      throw new Error(
        `Multiple nodes found: <${tag}>. ` +
          `Add more filters (attrs, lineNumber, or contains) to narrow the search.`
      );
    }
    return matches[0];
  }

  /**
   * Replace a DOM element with new XML content.
   *
   * Returns all inserted nodes.
   */
  replaceNode(elem: Element, newContent: string): Node[] {
    const parent = elem.parentNode!;
    const nodes = this._parseFragment(newContent);
    for (const node of nodes) {
      parent.insertBefore(node, elem);
    }
    parent.removeChild(elem);
    return nodes;
  }

  /**
   * Insert XML content after a DOM element.
   *
   * Returns all inserted nodes.
   */
  insertAfter(elem: Node, xmlContent: string): Node[] {
    const parent = elem.parentNode!;
    const nextSibling = elem.nextSibling;
    const nodes = this._parseFragment(xmlContent);
    for (const node of nodes) {
      if (nextSibling) {
        parent.insertBefore(node, nextSibling);
      } else {
        parent.appendChild(node);
      }
    }
    return nodes;
  }

  /**
   * Insert XML content before a DOM element.
   *
   * Returns all inserted nodes.
   */
  insertBefore(elem: Node, xmlContent: string): Node[] {
    const parent = elem.parentNode!;
    const nodes = this._parseFragment(xmlContent);
    for (const node of nodes) {
      parent.insertBefore(node, elem);
    }
    return nodes;
  }

  /**
   * Append XML content as a child of a DOM element.
   *
   * Returns all inserted nodes.
   */
  appendTo(elem: Node, xmlContent: string): Node[] {
    const nodes = this._parseFragment(xmlContent);
    for (const node of nodes) {
      elem.appendChild(node);
    }
    return nodes;
  }

  /**
   * Get the next available rId for relationships files.
   */
  getNextRid(): string {
    let maxId = 0;
    const rels = this.dom.getElementsByTagName("Relationship");
    for (let i = 0; i < rels.length; i++) {
      const relId = rels[i].getAttribute("Id");
      if (relId && relId.startsWith("rId")) {
        const num = parseInt(relId.substring(3), 10);
        if (!isNaN(num) && num > maxId) {
          maxId = num;
        }
      }
    }
    return `rId${maxId + 1}`;
  }

  /**
   * Save the edited XML back to the file.
   *
   * Serializes the DOM tree and writes it back to the original file path,
   * preserving the original encoding (ascii or utf-8).
   */
  save(): void {
    const serializer = new XMLSerializer();
    let content = serializer.serializeToString(this.dom);

    // Ensure XML declaration is present with correct encoding
    if (!content.startsWith("<?xml")) {
      const enc = this.encoding === "ascii" ? "ascii" : "utf-8";
      content = `<?xml version="1.0" encoding="${enc}"?>` + content;
    }

    fs.writeFileSync(this.xmlPath, content, "utf-8");
  }

  /**
   * Parse XML fragment and return list of imported nodes.
   *
   * Extracts namespace declarations from the root document element so that
   * namespaced elements in the fragment are correctly resolved.
   */
  _parseFragment(xmlContent: string): Node[] {
    // Extract namespace declarations from the root document element
    const rootElem = this.dom.documentElement;
    const namespaces: string[] = [];
    if (rootElem && rootElem.attributes) {
      for (let i = 0; i < rootElem.attributes.length; i++) {
        const attr = rootElem.attributes[i];
        if (attr.name.startsWith("xmlns")) {
          namespaces.push(`${attr.name}="${attr.value}"`);
        }
      }
    }

    const nsDecl = namespaces.join(" ");
    const wrapper = `<root ${nsDecl}>${xmlContent}</root>`;
    const parser = new DOMParser();
    const fragmentDoc = parser.parseFromString(wrapper, "text/xml");

    const nodes: Node[] = [];
    const childNodes = fragmentDoc.documentElement.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      nodes.push(this.dom.importNode(childNodes[i], true));
    }

    const elements = nodes.filter((n) => n.nodeType === 1); // ELEMENT_NODE
    if (elements.length === 0) {
      throw new Error("Fragment must contain at least one element");
    }
    return nodes;
  }
}

export { XMLEditor, getElementText, htmlUnescape, GetNodeOptions, LineRange };
