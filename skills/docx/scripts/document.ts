/**
 * Library for working with Word documents: comments, tracked changes, and editing.
 *
 * Usage:
 *    import { DocxDocument } from "./document";
 *
 *    // Initialize
 *    const doc = new DocxDocument("workspace/unpacked");
 *    const doc2 = new DocxDocument("workspace/unpacked", { author: "John Doe", initials: "JD" });
 *
 *    // Find nodes
 *    const node = doc.getEditor("word/document.xml").getNode({ tag: "w:del", attrs: { "w:id": "1" } });
 *    const node2 = doc.getEditor("word/document.xml").getNode({ tag: "w:p", lineNumber: 10 });
 *
 *    // Add comments
 *    doc.addComment(node, node, "Comment text");
 *    doc.replyToComment(0, "Reply text");
 *
 *    // Suggest tracked changes
 *    doc.getEditor("word/document.xml").suggestDeletion(node);  // Delete content
 *    doc.getEditor("word/document.xml").revertInsertion(insNode);  // Reject insertion
 *    doc.getEditor("word/document.xml").revertDeletion(delNode);  // Reject deletion
 *
 *    // Save
 *    doc.save();
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { XMLEditor } from "./utilities";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to template files
const TEMPLATE_DIR = path.join(__dirname, "templates");

/**
 * Generate random 8-character hex ID for para/durable IDs.
 *
 * Values are constrained to be less than 0x7FFFFFFF per OOXML spec.
 */
function generateHexId(): string {
  return (Math.floor(Math.random() * 0x7ffffffe) + 1)
    .toString(16)
    .toUpperCase()
    .padStart(8, "0");
}

/**
 * Generate random 8-character hex RSID.
 */
function generateRsid(): string {
  const chars = "0123456789ABCDEF";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Escape HTML special characters for safe XML embedding.
 */
function htmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Copy a directory recursively.
 */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * XMLEditor that automatically applies RSID, author, and date to new elements.
 *
 * Automatically adds attributes to elements that support them when inserting new content:
 * - w:rsidR, w:rsidRDefault, w:rsidP (for w:p and w:r elements)
 * - w:author and w:date (for w:ins, w:del, w:comment elements)
 * - w:id (for w:ins and w:del elements)
 */
class DocxXMLEditor extends XMLEditor {
  rsid: string;
  author: string;
  initials: string;

  constructor(
    xmlPath: string,
    rsid: string,
    author: string = "Claude",
    initials: string = "C"
  ) {
    super(xmlPath);
    this.rsid = rsid;
    this.author = author;
    this.initials = initials;
  }

  /**
   * Get the next available change ID by checking all tracked change elements.
   */
  private _getNextChangeId(): number {
    let maxId = -1;
    for (const tag of ["w:ins", "w:del"]) {
      const elements = this.dom.getElementsByTagName(tag);
      for (let i = 0; i < elements.length; i++) {
        const changeId = elements[i].getAttribute("w:id");
        if (changeId) {
          const num = parseInt(changeId, 10);
          if (!isNaN(num) && num > maxId) {
            maxId = num;
          }
        }
      }
    }
    return maxId + 1;
  }

  /**
   * Ensure w16du namespace is declared on the root element.
   */
  private _ensureW16duNamespace(): void {
    const root = this.dom.documentElement;
    if (!root.hasAttribute("xmlns:w16du")) {
      root.setAttribute(
        "xmlns:w16du",
        "http://schemas.microsoft.com/office/word/2023/wordml/word16du"
      );
    }
  }

  /**
   * Ensure w16cex namespace is declared on the root element.
   */
  private _ensureW16cexNamespace(): void {
    const root = this.dom.documentElement;
    if (!root.hasAttribute("xmlns:w16cex")) {
      root.setAttribute(
        "xmlns:w16cex",
        "http://schemas.microsoft.com/office/word/2018/wordml/cex"
      );
    }
  }

  /**
   * Ensure w14 namespace is declared on the root element.
   */
  private _ensureW14Namespace(): void {
    const root = this.dom.documentElement;
    if (!root.hasAttribute("xmlns:w14")) {
      root.setAttribute(
        "xmlns:w14",
        "http://schemas.microsoft.com/office/word/2010/wordml"
      );
    }
  }

  /**
   * Inject RSID, author, and date attributes into DOM nodes where applicable.
   */
  private _injectAttributesToNodes(nodes: Node[]): void {
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    const isInsideDeletion = (elem: Node): boolean => {
      let parent = elem.parentNode;
      while (parent) {
        if (
          parent.nodeType === 1 &&
          (parent as Element).tagName === "w:del"
        ) {
          return true;
        }
        parent = parent.parentNode;
      }
      return false;
    };

    const addRsidToP = (elem: Element): void => {
      if (!elem.hasAttribute("w:rsidR")) {
        elem.setAttribute("w:rsidR", this.rsid);
      }
      if (!elem.hasAttribute("w:rsidRDefault")) {
        elem.setAttribute("w:rsidRDefault", this.rsid);
      }
      if (!elem.hasAttribute("w:rsidP")) {
        elem.setAttribute("w:rsidP", this.rsid);
      }
      if (!elem.hasAttribute("w14:paraId")) {
        this._ensureW14Namespace();
        elem.setAttribute("w14:paraId", generateHexId());
      }
      if (!elem.hasAttribute("w14:textId")) {
        this._ensureW14Namespace();
        elem.setAttribute("w14:textId", generateHexId());
      }
    };

    const addRsidToR = (elem: Element): void => {
      if (isInsideDeletion(elem)) {
        if (!elem.hasAttribute("w:rsidDel")) {
          elem.setAttribute("w:rsidDel", this.rsid);
        }
      } else {
        if (!elem.hasAttribute("w:rsidR")) {
          elem.setAttribute("w:rsidR", this.rsid);
        }
      }
    };

    const addTrackedChangeAttrs = (elem: Element): void => {
      if (!elem.hasAttribute("w:id")) {
        elem.setAttribute("w:id", String(this._getNextChangeId()));
      }
      if (!elem.hasAttribute("w:author")) {
        elem.setAttribute("w:author", this.author);
      }
      if (!elem.hasAttribute("w:date")) {
        elem.setAttribute("w:date", timestamp);
      }
      if (
        (elem.tagName === "w:ins" || elem.tagName === "w:del") &&
        !elem.hasAttribute("w16du:dateUtc")
      ) {
        this._ensureW16duNamespace();
        elem.setAttribute("w16du:dateUtc", timestamp);
      }
    };

    const addCommentAttrs = (elem: Element): void => {
      if (!elem.hasAttribute("w:author")) {
        elem.setAttribute("w:author", this.author);
      }
      if (!elem.hasAttribute("w:date")) {
        elem.setAttribute("w:date", timestamp);
      }
      if (!elem.hasAttribute("w:initials")) {
        elem.setAttribute("w:initials", this.initials);
      }
    };

    const addCommentExtensibleDate = (elem: Element): void => {
      if (!elem.hasAttribute("w16cex:dateUtc")) {
        this._ensureW16cexNamespace();
        elem.setAttribute("w16cex:dateUtc", timestamp);
      }
    };

    const addXmlSpaceToT = (elem: Element): void => {
      if (
        elem.firstChild &&
        elem.firstChild.nodeType === 3 // TEXT_NODE
      ) {
        const text = elem.firstChild.nodeValue || "";
        if (text && (text[0] === " " || text[0] === "\t" || text[0] === "\n" ||
                     text[text.length - 1] === " " || text[text.length - 1] === "\t" || text[text.length - 1] === "\n")) {
          if (!elem.hasAttribute("xml:space")) {
            elem.setAttribute("xml:space", "preserve");
          }
        }
      }
    };

    const processElement = (elem: Element): void => {
      if (elem.tagName === "w:p") addRsidToP(elem);
      else if (elem.tagName === "w:r") addRsidToR(elem);
      else if (elem.tagName === "w:t") addXmlSpaceToT(elem);
      else if (elem.tagName === "w:ins" || elem.tagName === "w:del")
        addTrackedChangeAttrs(elem);
      else if (elem.tagName === "w:comment") addCommentAttrs(elem);
      else if (elem.tagName === "w16cex:commentExtensible")
        addCommentExtensibleDate(elem);
    };

    const processDescendants = (node: Element): void => {
      for (const tag of ["w:p", "w:r", "w:t", "w:ins", "w:del", "w:comment", "w16cex:commentExtensible"]) {
        const elems = node.getElementsByTagName(tag);
        for (let i = 0; i < elems.length; i++) {
          if (tag === "w:p") addRsidToP(elems[i]);
          else if (tag === "w:r") addRsidToR(elems[i]);
          else if (tag === "w:t") addXmlSpaceToT(elems[i]);
          else if (tag === "w:ins" || tag === "w:del") addTrackedChangeAttrs(elems[i]);
          else if (tag === "w:comment") addCommentAttrs(elems[i]);
          else if (tag === "w16cex:commentExtensible") addCommentExtensibleDate(elems[i]);
        }
      }
    };

    for (const node of nodes) {
      if (node.nodeType !== 1) continue;
      const elem = node as Element;
      processElement(elem);
      processDescendants(elem);
    }
  }

  replaceNode(elem: Element, newContent: string): Node[] {
    const nodes = super.replaceNode(elem, newContent);
    this._injectAttributesToNodes(nodes);
    return nodes;
  }

  insertAfter(elem: Node, xmlContent: string): Node[] {
    const nodes = super.insertAfter(elem, xmlContent);
    this._injectAttributesToNodes(nodes);
    return nodes;
  }

  insertBefore(elem: Node, xmlContent: string): Node[] {
    const nodes = super.insertBefore(elem, xmlContent);
    this._injectAttributesToNodes(nodes);
    return nodes;
  }

  appendTo(elem: Node, xmlContent: string): Node[] {
    const nodes = super.appendTo(elem, xmlContent);
    this._injectAttributesToNodes(nodes);
    return nodes;
  }

  /**
   * Reject an insertion by wrapping its content in a deletion.
   *
   * Wraps all runs inside w:ins in w:del, converting w:t to w:delText.
   * Can process a single w:ins element or a container element with multiple w:ins.
   */
  revertInsertion(elem: Element): Element[] {
    // Collect insertions
    const insElements: Element[] = [];
    if (elem.tagName === "w:ins") {
      insElements.push(elem);
    } else {
      const insList = elem.getElementsByTagName("w:ins");
      for (let i = 0; i < insList.length; i++) {
        insElements.push(insList[i]);
      }
    }

    if (insElements.length === 0) {
      throw new Error(
        `revertInsertion requires w:ins elements. ` +
          `The provided element <${elem.tagName}> contains no insertions.`
      );
    }

    for (const insElem of insElements) {
      const runs = insElem.getElementsByTagName("w:r");
      const runList: Element[] = [];
      for (let i = 0; i < runs.length; i++) {
        runList.push(runs[i]);
      }
      if (runList.length === 0) continue;

      const delWrapper = this.dom.createElement("w:del");

      for (const run of runList) {
        // Convert w:t -> w:delText and w:rsidR -> w:rsidDel
        if (run.hasAttribute("w:rsidR")) {
          run.setAttribute("w:rsidDel", run.getAttribute("w:rsidR")!);
          run.removeAttribute("w:rsidR");
        } else if (!run.hasAttribute("w:rsidDel")) {
          run.setAttribute("w:rsidDel", this.rsid);
        }

        const tElems = run.getElementsByTagName("w:t");
        const tList: Element[] = [];
        for (let i = 0; i < tElems.length; i++) {
          tList.push(tElems[i]);
        }
        for (const tElem of tList) {
          const delText = this.dom.createElement("w:delText");
          while (tElem.firstChild) {
            delText.appendChild(tElem.firstChild);
          }
          for (let i = 0; i < tElem.attributes.length; i++) {
            const attr = tElem.attributes[i];
            delText.setAttribute(attr.name, attr.value);
          }
          tElem.parentNode!.replaceChild(delText, tElem);
        }
      }

      // Move all children from ins to del wrapper
      while (insElem.firstChild) {
        delWrapper.appendChild(insElem.firstChild);
      }

      insElem.appendChild(delWrapper);
      this._injectAttributesToNodes([delWrapper]);
    }

    return [elem];
  }

  /**
   * Reject a deletion by re-inserting the deleted content.
   *
   * Creates w:ins elements after each w:del, copying deleted content and
   * converting w:delText back to w:t.
   */
  revertDeletion(elem: Element): Element[] {
    const delElements: Element[] = [];
    const isSingleDel = elem.tagName === "w:del";

    if (isSingleDel) {
      delElements.push(elem);
    } else {
      const delList = elem.getElementsByTagName("w:del");
      for (let i = 0; i < delList.length; i++) {
        delElements.push(delList[i]);
      }
    }

    if (delElements.length === 0) {
      throw new Error(
        `revertDeletion requires w:del elements. ` +
          `The provided element <${elem.tagName}> contains no deletions.`
      );
    }

    let createdInsertion: Node | null = null;

    for (const delElem of delElements) {
      const runs = delElem.getElementsByTagName("w:r");
      const runList: Element[] = [];
      for (let i = 0; i < runs.length; i++) {
        runList.push(runs[i]);
      }
      if (runList.length === 0) continue;

      const insElem = this.dom.createElement("w:ins");

      for (const run of runList) {
        const newRun = run.cloneNode(true) as Element;

        // Convert w:delText -> w:t
        const delTexts = newRun.getElementsByTagName("w:delText");
        const dtList: Element[] = [];
        for (let i = 0; i < delTexts.length; i++) {
          dtList.push(delTexts[i]);
        }
        for (const delText of dtList) {
          const tElem = this.dom.createElement("w:t");
          while (delText.firstChild) {
            tElem.appendChild(delText.firstChild);
          }
          for (let i = 0; i < delText.attributes.length; i++) {
            const attr = delText.attributes[i];
            tElem.setAttribute(attr.name, attr.value);
          }
          delText.parentNode!.replaceChild(tElem, delText);
        }

        // Update run attributes: w:rsidDel -> w:rsidR
        if (newRun.hasAttribute("w:rsidDel")) {
          newRun.setAttribute("w:rsidR", newRun.getAttribute("w:rsidDel")!);
          newRun.removeAttribute("w:rsidDel");
        } else if (!newRun.hasAttribute("w:rsidR")) {
          newRun.setAttribute("w:rsidR", this.rsid);
        }

        insElem.appendChild(newRun);
      }

      const serializer = new XMLSerializer();
      const insXml = serializer.serializeToString(insElem);
      const nodes = this.insertAfter(delElem, insXml);

      if (isSingleDel && nodes.length > 0) {
        createdInsertion = nodes[0];
      }
    }

    if (isSingleDel && createdInsertion) {
      return [elem, createdInsertion as Element];
    }
    return [elem];
  }

  /**
   * Transform paragraph XML to add tracked change wrapping for insertion.
   *
   * Wraps runs in <w:ins> and adds <w:ins/> to w:rPr in w:pPr for numbered lists.
   */
  static suggestParagraph(xmlContent: string): string {
    const wrapper = `<root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${xmlContent}</root>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(wrapper, "text/xml");
    const para = doc.getElementsByTagName("w:p")[0];

    // Ensure w:pPr exists
    let pPr: Element;
    const pPrList = para.getElementsByTagName("w:pPr");
    if (pPrList.length === 0) {
      pPr = doc.createElement("w:pPr");
      if (para.firstChild) {
        para.insertBefore(pPr, para.firstChild);
      } else {
        para.appendChild(pPr);
      }
    } else {
      pPr = pPrList[0];
    }

    // Ensure w:rPr exists in w:pPr
    let rPr: Element;
    const rPrList = pPr.getElementsByTagName("w:rPr");
    if (rPrList.length === 0) {
      rPr = doc.createElement("w:rPr");
      pPr.appendChild(rPr);
    } else {
      rPr = rPrList[0];
    }

    // Add <w:ins/> to w:rPr
    const insMarker = doc.createElement("w:ins");
    if (rPr.firstChild) {
      rPr.insertBefore(insMarker, rPr.firstChild);
    } else {
      rPr.appendChild(insMarker);
    }

    // Wrap all non-pPr children in <w:ins>
    const insWrapper = doc.createElement("w:ins");
    const children: Node[] = [];
    for (let i = 0; i < para.childNodes.length; i++) {
      const child = para.childNodes[i];
      if (child.nodeType === 1 && (child as Element).tagName === "w:pPr")
        continue;
      children.push(child);
    }
    for (const child of children) {
      para.removeChild(child);
      insWrapper.appendChild(child);
    }
    para.appendChild(insWrapper);

    const serializer = new XMLSerializer();
    return serializer.serializeToString(para);
  }

  /**
   * Mark a w:r or w:p element as deleted with tracked changes (in-place DOM manipulation).
   */
  suggestDeletion(elem: Element): Element {
    if (elem.tagName === "w:r") {
      // Check for existing w:delText
      if (elem.getElementsByTagName("w:delText").length > 0) {
        throw new Error("w:r element already contains w:delText");
      }

      // Convert w:t -> w:delText
      const tElems = elem.getElementsByTagName("w:t");
      const tList: Element[] = [];
      for (let i = 0; i < tElems.length; i++) {
        tList.push(tElems[i]);
      }
      for (const tElem of tList) {
        const delText = this.dom.createElement("w:delText");
        while (tElem.firstChild) {
          delText.appendChild(tElem.firstChild);
        }
        for (let i = 0; i < tElem.attributes.length; i++) {
          const attr = tElem.attributes[i];
          delText.setAttribute(attr.name, attr.value);
        }
        tElem.parentNode!.replaceChild(delText, tElem);
      }

      // Update run attributes: w:rsidR -> w:rsidDel
      if (elem.hasAttribute("w:rsidR")) {
        elem.setAttribute("w:rsidDel", elem.getAttribute("w:rsidR")!);
        elem.removeAttribute("w:rsidR");
      } else if (!elem.hasAttribute("w:rsidDel")) {
        elem.setAttribute("w:rsidDel", this.rsid);
      }

      // Wrap in w:del
      const delWrapper = this.dom.createElement("w:del");
      const parent = elem.parentNode!;
      parent.insertBefore(delWrapper, elem);
      parent.removeChild(elem);
      delWrapper.appendChild(elem);

      this._injectAttributesToNodes([delWrapper]);
      return delWrapper;
    } else if (elem.tagName === "w:p") {
      // Check for existing tracked changes
      if (
        elem.getElementsByTagName("w:ins").length > 0 ||
        elem.getElementsByTagName("w:del").length > 0
      ) {
        throw new Error("w:p element already contains tracked changes");
      }

      // Check if it's a numbered list item
      const pPrList = elem.getElementsByTagName("w:pPr");
      const isNumbered =
        pPrList.length > 0 &&
        pPrList[0].getElementsByTagName("w:numPr").length > 0;

      if (isNumbered) {
        const pPr = pPrList[0];
        let rPr: Element;
        const rPrList = pPr.getElementsByTagName("w:rPr");
        if (rPrList.length === 0) {
          rPr = this.dom.createElement("w:rPr");
          pPr.appendChild(rPr);
        } else {
          rPr = rPrList[0];
        }

        const delMarker = this.dom.createElement("w:del");
        if (rPr.firstChild) {
          rPr.insertBefore(delMarker, rPr.firstChild);
        } else {
          rPr.appendChild(delMarker);
        }
      }

      // Convert w:t -> w:delText in all runs
      const tElems = elem.getElementsByTagName("w:t");
      const tList: Element[] = [];
      for (let i = 0; i < tElems.length; i++) {
        tList.push(tElems[i]);
      }
      for (const tElem of tList) {
        const delText = this.dom.createElement("w:delText");
        while (tElem.firstChild) {
          delText.appendChild(tElem.firstChild);
        }
        for (let i = 0; i < tElem.attributes.length; i++) {
          const attr = tElem.attributes[i];
          delText.setAttribute(attr.name, attr.value);
        }
        tElem.parentNode!.replaceChild(delText, tElem);
      }

      // Update run attributes: w:rsidR -> w:rsidDel
      const runs = elem.getElementsByTagName("w:r");
      for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        if (run.hasAttribute("w:rsidR")) {
          run.setAttribute("w:rsidDel", run.getAttribute("w:rsidR")!);
          run.removeAttribute("w:rsidR");
        } else if (!run.hasAttribute("w:rsidDel")) {
          run.setAttribute("w:rsidDel", this.rsid);
        }
      }

      // Wrap all non-pPr children in <w:del>
      const delWrapper = this.dom.createElement("w:del");
      const children: Node[] = [];
      for (let i = 0; i < elem.childNodes.length; i++) {
        const child = elem.childNodes[i];
        if (child.nodeType === 1 && (child as Element).tagName === "w:pPr")
          continue;
        children.push(child);
      }
      for (const child of children) {
        elem.removeChild(child);
        delWrapper.appendChild(child);
      }
      elem.appendChild(delWrapper);

      this._injectAttributesToNodes([delWrapper]);
      return elem;
    } else {
      throw new Error(`Element must be w:r or w:p, got ${elem.tagName}`);
    }
  }
}

/**
 * Manages comments and tracked changes in unpacked Word documents.
 */
class DocxDocument {
  originalPath: string;
  tempDir: string;
  unpackedPath: string;
  originalDocx: string;
  wordPath: string;
  rsid: string;
  author: string;
  initials: string;
  private _editors: Map<string, DocxXMLEditor>;
  commentsPath: string;
  commentsExtendedPath: string;
  commentsIdsPath: string;
  commentsExtensiblePath: string;
  existingComments: Map<number, { paraId: string }>;
  nextCommentId: number;
  private _document: DocxXMLEditor;

  constructor(
    unpackedDir: string,
    options: {
      rsid?: string;
      trackRevisions?: boolean;
      author?: string;
      initials?: string;
    } = {}
  ) {
    const {
      rsid,
      trackRevisions = false,
      author = "Claude",
      initials = "C",
    } = options;

    this.originalPath = path.resolve(unpackedDir);

    if (
      !fs.existsSync(this.originalPath) ||
      !fs.statSync(this.originalPath).isDirectory()
    ) {
      throw new Error(`Directory not found: ${unpackedDir}`);
    }

    // Create temporary directory with subdirectories for unpacked content and baseline
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docx_"));
    this.unpackedPath = path.join(this.tempDir, "unpacked");
    copyDirSync(this.originalPath, this.unpackedPath);

    // Pack original directory into temporary .docx for validation baseline
    this.originalDocx = path.join(this.tempDir, "original.docx");
    this._packOriginal();

    this.wordPath = path.join(this.unpackedPath, "word");

    this.rsid = rsid || generateRsid();
    console.log(`Using RSID: ${this.rsid}`);

    this.author = author;
    this.initials = initials;

    this._editors = new Map();

    // Comment file paths
    this.commentsPath = path.join(this.wordPath, "comments.xml");
    this.commentsExtendedPath = path.join(this.wordPath, "commentsExtended.xml");
    this.commentsIdsPath = path.join(this.wordPath, "commentsIds.xml");
    this.commentsExtensiblePath = path.join(this.wordPath, "commentsExtensible.xml");

    // Load existing comments and determine next ID
    this.existingComments = this._loadExistingComments();
    this.nextCommentId = this._getNextCommentId();

    // Convenient access to document.xml editor
    this._document = this.getEditor("word/document.xml");

    // Setup tracked changes infrastructure
    this._setupTracking(trackRevisions);

    // Add author to people.xml
    this._addAuthorToPeople(author);
  }

  /**
   * Pack the original directory using the Python pack script.
   */
  private _packOriginal(): void {
    try {
      const packScript = path.join(__dirname, "office", "pack.py");
      execFileSync(
        "python",
        [packScript, this.originalPath, this.originalDocx, "--validate", "false"],
        { stdio: "pipe", timeout: 30000 }
      );
    } catch {
      // If python pack fails, try to continue without validation baseline
    }
  }

  /**
   * Get or create a DocxXMLEditor for the specified XML file.
   */
  getEditor(xmlPath: string): DocxXMLEditor {
    if (!this._editors.has(xmlPath)) {
      const filePath = path.join(this.unpackedPath, xmlPath);
      if (!fs.existsSync(filePath)) {
        throw new Error(`XML file not found: ${xmlPath}`);
      }
      this._editors.set(
        xmlPath,
        new DocxXMLEditor(filePath, this.rsid, this.author, this.initials)
      );
    }
    return this._editors.get(xmlPath)!;
  }

  /**
   * Add a comment spanning from one element to another.
   *
   * Returns the comment ID that was created.
   */
  addComment(start: Element, end: Element, text: string): number {
    const commentId = this.nextCommentId;
    const paraId = generateHexId();
    const durableId = generateHexId();
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    // Add comment ranges to document.xml
    this._document.insertBefore(
      start,
      this._commentRangeStartXml(commentId)
    );

    if (end.tagName === "w:p") {
      this._document.appendTo(end, this._commentRangeEndXml(commentId));
    } else {
      this._document.insertAfter(end, this._commentRangeEndXml(commentId));
    }

    // Add to comments.xml
    this._addToCommentsXml(commentId, paraId, text, this.author, this.initials, timestamp);

    // Add to commentsExtended.xml
    this._addToCommentsExtendedXml(paraId, null);

    // Add to commentsIds.xml
    this._addToCommentsIdsXml(paraId, durableId);

    // Add to commentsExtensible.xml
    this._addToCommentsExtensibleXml(durableId);

    // Update existing_comments so replies work
    this.existingComments.set(commentId, { paraId });

    this.nextCommentId++;
    return commentId;
  }

  /**
   * Add a reply to an existing comment.
   *
   * Returns the comment ID that was created for the reply.
   */
  replyToComment(parentCommentId: number, text: string): number {
    if (!this.existingComments.has(parentCommentId)) {
      throw new Error(
        `Parent comment with id=${parentCommentId} not found`
      );
    }

    const parentInfo = this.existingComments.get(parentCommentId)!;
    const commentId = this.nextCommentId;
    const paraId = generateHexId();
    const durableId = generateHexId();
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    // Add comment ranges to document.xml
    const parentStartElem = this._document.getNode({
      tag: "w:commentRangeStart",
      attrs: { "w:id": String(parentCommentId) },
    });
    const parentRefElem = this._document.getNode({
      tag: "w:commentReference",
      attrs: { "w:id": String(parentCommentId) },
    });

    this._document.insertAfter(
      parentStartElem,
      this._commentRangeStartXml(commentId)
    );
    const parentRefRun = parentRefElem.parentNode!;
    this._document.insertAfter(
      parentRefRun,
      `<w:commentRangeEnd w:id="${commentId}"/>`
    );
    this._document.insertAfter(
      parentRefRun,
      this._commentRefRunXml(commentId)
    );

    // Add to comments.xml
    this._addToCommentsXml(commentId, paraId, text, this.author, this.initials, timestamp);

    // Add to commentsExtended.xml (with parent)
    this._addToCommentsExtendedXml(paraId, parentInfo.paraId);

    // Add to commentsIds.xml
    this._addToCommentsIdsXml(paraId, durableId);

    // Add to commentsExtensible.xml
    this._addToCommentsExtensibleXml(durableId);

    this.existingComments.set(commentId, { paraId });

    this.nextCommentId++;
    return commentId;
  }

  /**
   * Validate the document against XSD schema and redlining rules.
   * Calls the Python validation scripts.
   */
  validate(): void {
    const docxValidatorScript = path.join(
      __dirname,
      "..",
      "ooxml",
      "scripts",
      "validation",
      "docx.py"
    );
    const redliningValidatorScript = path.join(
      __dirname,
      "..",
      "ooxml",
      "scripts",
      "validation",
      "redlining.py"
    );

    try {
      execFileSync(
        "python",
        [docxValidatorScript, this.unpackedPath, this.originalDocx],
        { stdio: "pipe", timeout: 60000 }
      );
    } catch {
      throw new Error("Schema validation failed");
    }

    try {
      execFileSync(
        "python",
        [redliningValidatorScript, this.unpackedPath, this.originalDocx],
        { stdio: "pipe", timeout: 60000 }
      );
    } catch {
      throw new Error("Redlining validation failed");
    }
  }

  /**
   * Save all modified XML files to disk and copy to destination directory.
   */
  save(destination?: string, validate: boolean = true): void {
    // Only ensure comment relationships and content types if comment files exist
    if (fs.existsSync(this.commentsPath)) {
      this._ensureCommentRelationships();
      this._ensureCommentContentTypes();
    }

    // Save all modified XML files in temp directory
    for (const editor of this._editors.values()) {
      editor.save();
    }

    // Validate by default
    if (validate) {
      this.validate();
    }

    // Copy contents from temp directory to destination (or original directory)
    const targetPath = destination
      ? path.resolve(destination)
      : this.originalPath;
    copyDirSync(this.unpackedPath, targetPath);
  }

  /**
   * Clean up temporary directory.
   */
  cleanup(): void {
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    }
  }

  // ==================== Private: Initialization ====================

  private _getNextCommentId(): number {
    if (!fs.existsSync(this.commentsPath)) return 0;

    const editor = this.getEditor("word/comments.xml");
    let maxId = -1;
    const comments = editor.dom.getElementsByTagName("w:comment");
    for (let i = 0; i < comments.length; i++) {
      const commentId = comments[i].getAttribute("w:id");
      if (commentId) {
        const num = parseInt(commentId, 10);
        if (!isNaN(num) && num > maxId) {
          maxId = num;
        }
      }
    }
    return maxId + 1;
  }

  private _loadExistingComments(): Map<number, { paraId: string }> {
    if (!fs.existsSync(this.commentsPath)) return new Map();

    const editor = this.getEditor("word/comments.xml");
    const existing = new Map<number, { paraId: string }>();

    const comments = editor.dom.getElementsByTagName("w:comment");
    for (let i = 0; i < comments.length; i++) {
      const commentId = comments[i].getAttribute("w:id");
      if (!commentId) continue;

      let paraId: string | null = null;
      const paragraphs = comments[i].getElementsByTagName("w:p");
      for (let j = 0; j < paragraphs.length; j++) {
        paraId = paragraphs[j].getAttribute("w14:paraId");
        if (paraId) break;
      }

      if (!paraId) continue;
      existing.set(parseInt(commentId, 10), { paraId });
    }

    return existing;
  }

  // ==================== Private: Setup Methods ====================

  private _setupTracking(trackRevisions: boolean): void {
    // Create or update word/people.xml
    const peoplePath = path.join(this.wordPath, "people.xml");
    if (!fs.existsSync(peoplePath)) {
      fs.copyFileSync(path.join(TEMPLATE_DIR, "people.xml"), peoplePath);
    }

    // Update XML files
    this._addContentTypeForPeople();
    this._addRelationshipForPeople();

    // Always add RSID to settings.xml, optionally enable trackRevisions
    this._updateSettings(trackRevisions);
  }

  private _addContentTypeForPeople(): void {
    const editor = this.getEditor("[Content_Types].xml");

    if (this._hasOverride(editor, "/word/people.xml")) return;

    const root = editor.dom.documentElement;
    const overrideXml =
      '<Override PartName="/word/people.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml"/>';
    editor.appendTo(root, overrideXml);
  }

  private _addRelationshipForPeople(): void {
    const editor = this.getEditor("word/_rels/document.xml.rels");

    if (this._hasRelationship(editor, "people.xml")) return;

    const root = editor.dom.documentElement;
    const rootTag = root.tagName;
    const prefix = rootTag.includes(":") ? rootTag.split(":")[0] + ":" : "";
    const nextRid = editor.getNextRid();

    const relXml = `<${prefix}Relationship Id="${nextRid}" Type="http://schemas.microsoft.com/office/2011/relationships/people" Target="people.xml"/>`;
    editor.appendTo(root, relXml);
  }

  private _updateSettings(trackRevisions: boolean): void {
    const editor = this.getEditor("word/settings.xml");
    const root = editor.getNode({ tag: "w:settings" });
    const rootTag = root.tagName;
    const prefix = rootTag.includes(":") ? rootTag.split(":")[0] : "w";

    // Conditionally add trackRevisions if requested
    if (trackRevisions) {
      const trackRevisionsElements = editor.dom.getElementsByTagName(
        `${prefix}:trackRevisions`
      );
      if (trackRevisionsElements.length === 0) {
        const trackRevXml = `<${prefix}:trackRevisions/>`;
        let inserted = false;
        for (const tag of [
          `${prefix}:documentProtection`,
          `${prefix}:defaultTabStop`,
        ]) {
          const elements = editor.dom.getElementsByTagName(tag);
          if (elements.length > 0) {
            editor.insertBefore(elements[0], trackRevXml);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          if (root.firstChild) {
            editor.insertBefore(root.firstChild, trackRevXml);
          } else {
            editor.appendTo(root, trackRevXml);
          }
        }
      }
    }

    // Always check if rsids section exists
    const rsidsElements = editor.dom.getElementsByTagName(
      `${prefix}:rsids`
    );

    if (rsidsElements.length === 0) {
      const rsidsXml = `<${prefix}:rsids>
  <${prefix}:rsidRoot ${prefix}:val="${this.rsid}"/>
  <${prefix}:rsid ${prefix}:val="${this.rsid}"/>
</${prefix}:rsids>`;

      let inserted = false;
      const compatElements = editor.dom.getElementsByTagName(
        `${prefix}:compat`
      );
      if (compatElements.length > 0) {
        editor.insertAfter(compatElements[0], rsidsXml);
        inserted = true;
      }

      if (!inserted) {
        const clrElements = editor.dom.getElementsByTagName(
          `${prefix}:clrSchemeMapping`
        );
        if (clrElements.length > 0) {
          editor.insertBefore(clrElements[0], rsidsXml);
          inserted = true;
        }
      }

      if (!inserted) {
        editor.appendTo(root, rsidsXml);
      }
    } else {
      const rsidsElem = rsidsElements[0];
      const rsidElements = rsidsElem.getElementsByTagName(`${prefix}:rsid`);
      let rsidExists = false;
      for (let i = 0; i < rsidElements.length; i++) {
        if (rsidElements[i].getAttribute(`${prefix}:val`) === this.rsid) {
          rsidExists = true;
          break;
        }
      }

      if (!rsidExists) {
        const rsidXml = `<${prefix}:rsid ${prefix}:val="${this.rsid}"/>`;
        editor.appendTo(rsidsElem, rsidXml);
      }
    }
  }

  // ==================== Private: XML File Creation ====================

  private _addToCommentsXml(
    commentId: number,
    paraId: string,
    text: string,
    author: string,
    initials: string,
    timestamp: string
  ): void {
    if (!fs.existsSync(this.commentsPath)) {
      fs.copyFileSync(
        path.join(TEMPLATE_DIR, "comments.xml"),
        this.commentsPath
      );
    }

    const editor = this.getEditor("word/comments.xml");
    const root = editor.getNode({ tag: "w:comments" });

    const escapedText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const commentXml = `<w:comment w:id="${commentId}">
  <w:p w14:paraId="${paraId}" w14:textId="77777777">
    <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>
    <w:r><w:rPr><w:color w:val="000000"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${escapedText}</w:t></w:r>
  </w:p>
</w:comment>`;
    editor.appendTo(root, commentXml);
  }

  private _addToCommentsExtendedXml(
    paraId: string,
    parentParaId: string | null
  ): void {
    if (!fs.existsSync(this.commentsExtendedPath)) {
      fs.copyFileSync(
        path.join(TEMPLATE_DIR, "commentsExtended.xml"),
        this.commentsExtendedPath
      );
    }

    const editor = this.getEditor("word/commentsExtended.xml");
    const root = editor.getNode({ tag: "w15:commentsEx" });

    let xml: string;
    if (parentParaId) {
      xml = `<w15:commentEx w15:paraId="${paraId}" w15:paraIdParent="${parentParaId}" w15:done="0"/>`;
    } else {
      xml = `<w15:commentEx w15:paraId="${paraId}" w15:done="0"/>`;
    }
    editor.appendTo(root, xml);
  }

  private _addToCommentsIdsXml(paraId: string, durableId: string): void {
    if (!fs.existsSync(this.commentsIdsPath)) {
      fs.copyFileSync(
        path.join(TEMPLATE_DIR, "commentsIds.xml"),
        this.commentsIdsPath
      );
    }

    const editor = this.getEditor("word/commentsIds.xml");
    const root = editor.getNode({ tag: "w16cid:commentsIds" });

    const xml = `<w16cid:commentId w16cid:paraId="${paraId}" w16cid:durableId="${durableId}"/>`;
    editor.appendTo(root, xml);
  }

  private _addToCommentsExtensibleXml(durableId: string): void {
    if (!fs.existsSync(this.commentsExtensiblePath)) {
      fs.copyFileSync(
        path.join(TEMPLATE_DIR, "commentsExtensible.xml"),
        this.commentsExtensiblePath
      );
    }

    const editor = this.getEditor("word/commentsExtensible.xml");
    const root = editor.getNode({ tag: "w16cex:commentsExtensible" });

    const xml = `<w16cex:commentExtensible w16cex:durableId="${durableId}"/>`;
    editor.appendTo(root, xml);
  }

  // ==================== Private: XML Fragments ====================

  private _commentRangeStartXml(commentId: number): string {
    return `<w:commentRangeStart w:id="${commentId}"/>`;
  }

  private _commentRangeEndXml(commentId: number): string {
    return `<w:commentRangeEnd w:id="${commentId}"/>
<w:r>
  <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
  <w:commentReference w:id="${commentId}"/>
</w:r>`;
  }

  private _commentRefRunXml(commentId: number): string {
    return `<w:r>
  <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
  <w:commentReference w:id="${commentId}"/>
</w:r>`;
  }

  // ==================== Private: Metadata Updates ====================

  private _hasRelationship(editor: DocxXMLEditor, target: string): boolean {
    const rels = editor.dom.getElementsByTagName("Relationship");
    for (let i = 0; i < rels.length; i++) {
      if (rels[i].getAttribute("Target") === target) return true;
    }
    return false;
  }

  private _hasOverride(editor: DocxXMLEditor, partName: string): boolean {
    const overrides = editor.dom.getElementsByTagName("Override");
    for (let i = 0; i < overrides.length; i++) {
      if (overrides[i].getAttribute("PartName") === partName) return true;
    }
    return false;
  }

  private _hasAuthor(editor: DocxXMLEditor, author: string): boolean {
    const people = editor.dom.getElementsByTagName("w15:person");
    for (let i = 0; i < people.length; i++) {
      if (people[i].getAttribute("w15:author") === author) return true;
    }
    return false;
  }

  private _addAuthorToPeople(author: string): void {
    const peoplePath = path.join(this.wordPath, "people.xml");

    if (!fs.existsSync(peoplePath)) {
      throw new Error("people.xml should exist after _setupTracking");
    }

    const editor = this.getEditor("word/people.xml");
    const root = editor.getNode({ tag: "w15:people" });

    if (this._hasAuthor(editor, author)) return;

    const escapedAuthor = htmlEscape(author);
    const personXml = `<w15:person w15:author="${escapedAuthor}">
  <w15:presenceInfo w15:providerId="None" w15:userId="${escapedAuthor}"/>
</w15:person>`;
    editor.appendTo(root, personXml);
  }

  private _ensureCommentRelationships(): void {
    const editor = this.getEditor("word/_rels/document.xml.rels");

    if (this._hasRelationship(editor, "comments.xml")) return;

    const root = editor.dom.documentElement;
    const rootTag = root.tagName;
    const prefix = rootTag.includes(":") ? rootTag.split(":")[0] + ":" : "";
    const nextRidNum = parseInt(editor.getNextRid().substring(3), 10);

    const rels: [number, string, string][] = [
      [
        nextRidNum,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
        "comments.xml",
      ],
      [
        nextRidNum + 1,
        "http://schemas.microsoft.com/office/2011/relationships/commentsExtended",
        "commentsExtended.xml",
      ],
      [
        nextRidNum + 2,
        "http://schemas.microsoft.com/office/2016/09/relationships/commentsIds",
        "commentsIds.xml",
      ],
      [
        nextRidNum + 3,
        "http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible",
        "commentsExtensible.xml",
      ],
    ];

    for (const [relId, relType, target] of rels) {
      const relXml = `<${prefix}Relationship Id="rId${relId}" Type="${relType}" Target="${target}"/>`;
      editor.appendTo(root, relXml);
    }
  }

  private _ensureCommentContentTypes(): void {
    const editor = this.getEditor("[Content_Types].xml");

    if (this._hasOverride(editor, "/word/comments.xml")) return;

    const root = editor.dom.documentElement;

    const overrides: [string, string][] = [
      [
        "/word/comments.xml",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
      ],
      [
        "/word/commentsExtended.xml",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml",
      ],
      [
        "/word/commentsIds.xml",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml",
      ],
      [
        "/word/commentsExtensible.xml",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml",
      ],
    ];

    for (const [partName, contentType] of overrides) {
      const overrideXml = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
      editor.appendTo(root, overrideXml);
    }
  }
}

export {
  DocxDocument,
  DocxXMLEditor,
  generateHexId,
  generateRsid,
};
