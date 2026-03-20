/**
 * Add comments to DOCX documents.
 *
 * Usage:
 *    npx tsx comment.ts unpacked/ 0 "Comment text"
 *    npx tsx comment.ts unpacked/ 1 "Reply text" --parent 0
 *
 * Text should be pre-escaped XML (e.g., &amp; for &, &#x2019; for smart quotes).
 *
 * After running, add markers to document.xml:
 *   <w:commentRangeStart w:id="0"/>
 *   ... commented content ...
 *   <w:commentRangeEnd w:id="0"/>
 *   <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_DIR = path.join(__dirname, "templates");

const NS: Record<string, string> = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  w14: "http://schemas.microsoft.com/office/word/2010/wordml",
  w15: "http://schemas.microsoft.com/office/word/2012/wordml",
  w16cid: "http://schemas.microsoft.com/office/word/2016/wordml/cid",
  w16cex: "http://schemas.microsoft.com/office/word/2018/wordml/cex",
};

const COMMENT_XML = `<w:comment w:id="{id}" w:author="{author}" w:date="{date}" w:initials="{initials}">
  <w:p w14:paraId="{para_id}" w14:textId="77777777">
    <w:r>
      <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
      <w:annotationRef/>
    </w:r>
    <w:r>
      <w:rPr>
        <w:color w:val="000000"/>
        <w:sz w:val="20"/>
        <w:szCs w:val="20"/>
      </w:rPr>
      <w:t>{text}</w:t>
    </w:r>
  </w:p>
</w:comment>`;

const COMMENT_MARKER_TEMPLATE = `
Add to document.xml (markers must be direct children of w:p, never inside w:r):
  <w:commentRangeStart w:id="{cid}"/>
  <w:r>...</w:r>
  <w:commentRangeEnd w:id="{cid}"/>
  <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="{cid}"/></w:r>`;

const REPLY_MARKER_TEMPLATE = `
Nest markers inside parent {pid}'s markers (markers must be direct children of w:p, never inside w:r):
  <w:commentRangeStart w:id="{pid}"/><w:commentRangeStart w:id="{cid}"/>
  <w:r>...</w:r>
  <w:commentRangeEnd w:id="{cid}"/><w:commentRangeEnd w:id="{pid}"/>
  <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="{pid}"/></w:r>
  <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="{cid}"/></w:r>`;

const SMART_QUOTE_ENTITIES: Record<string, string> = {
  "\u201c": "&#x201C;",
  "\u201d": "&#x201D;",
  "\u2018": "&#x2018;",
  "\u2019": "&#x2019;",
};

function generateHexId(): string {
  return Math.floor(Math.random() * 0x7ffffffe)
    .toString(16)
    .toUpperCase()
    .padStart(8, "0");
}

function encodeSmartQuotes(text: string): string {
  let result = text;
  for (const [char, entity] of Object.entries(SMART_QUOTE_ENTITIES)) {
    result = result.split(char).join(entity);
  }
  return result;
}

function appendXml(
  xmlPath: string,
  rootTag: string,
  content: string
): void {
  const xmlContent = fs.readFileSync(xmlPath, "utf-8");
  const parser = new DOMParser();
  const dom = parser.parseFromString(xmlContent, "text/xml");
  const root = dom.getElementsByTagName(rootTag)[0];

  const nsAttrs = Object.entries(NS)
    .map(([k, v]) => `xmlns:${k}="${v}"`)
    .join(" ");
  const wrapperXml = `<root ${nsAttrs}>${content}</root>`;
  const wrapperDom = parser.parseFromString(wrapperXml, "text/xml");
  const wrapperChildren = wrapperDom.documentElement.childNodes;

  for (let i = 0; i < wrapperChildren.length; i++) {
    const child = wrapperChildren[i];
    if (child.nodeType === 1) {
      // ELEMENT_NODE
      root.appendChild(dom.importNode(child, true));
    }
  }

  const serializer = new XMLSerializer();
  let output = serializer.serializeToString(dom);

  // Ensure XML declaration
  if (!output.startsWith("<?xml")) {
    output = '<?xml version="1.0" encoding="UTF-8"?>' + output;
  }

  output = encodeSmartQuotes(output);
  fs.writeFileSync(xmlPath, output, "utf-8");
}

function findParaId(
  commentsPath: string,
  commentId: number
): string | null {
  const xmlContent = fs.readFileSync(commentsPath, "utf-8");
  const parser = new DOMParser();
  const dom = parser.parseFromString(xmlContent, "text/xml");
  const comments = dom.getElementsByTagName("w:comment");
  for (let i = 0; i < comments.length; i++) {
    if (comments[i].getAttribute("w:id") === String(commentId)) {
      const paragraphs = comments[i].getElementsByTagName("w:p");
      for (let j = 0; j < paragraphs.length; j++) {
        const pid = paragraphs[j].getAttribute("w14:paraId");
        if (pid) return pid;
      }
    }
  }
  return null;
}

function getNextRid(relsPath: string): number {
  const xmlContent = fs.readFileSync(relsPath, "utf-8");
  const parser = new DOMParser();
  const dom = parser.parseFromString(xmlContent, "text/xml");
  let maxRid = 0;
  const rels = dom.getElementsByTagName("Relationship");
  for (let i = 0; i < rels.length; i++) {
    const rid = rels[i].getAttribute("Id");
    if (rid && rid.startsWith("rId")) {
      const num = parseInt(rid.substring(3), 10);
      if (!isNaN(num) && num > maxRid) {
        maxRid = num;
      }
    }
  }
  return maxRid + 1;
}

function hasRelationship(relsPath: string, target: string): boolean {
  const xmlContent = fs.readFileSync(relsPath, "utf-8");
  const parser = new DOMParser();
  const dom = parser.parseFromString(xmlContent, "text/xml");
  const rels = dom.getElementsByTagName("Relationship");
  for (let i = 0; i < rels.length; i++) {
    if (rels[i].getAttribute("Target") === target) return true;
  }
  return false;
}

function hasContentType(ctPath: string, partName: string): boolean {
  const xmlContent = fs.readFileSync(ctPath, "utf-8");
  const parser = new DOMParser();
  const dom = parser.parseFromString(xmlContent, "text/xml");
  const overrides = dom.getElementsByTagName("Override");
  for (let i = 0; i < overrides.length; i++) {
    if (overrides[i].getAttribute("PartName") === partName) return true;
  }
  return false;
}

function ensureCommentRelationships(unpackedDir: string): void {
  const relsPath = path.join(unpackedDir, "word", "_rels", "document.xml.rels");
  if (!fs.existsSync(relsPath)) return;

  if (hasRelationship(relsPath, "comments.xml")) return;

  const xmlContent = fs.readFileSync(relsPath, "utf-8");
  const parser = new DOMParser();
  const dom = parser.parseFromString(xmlContent, "text/xml");
  const root = dom.documentElement;
  let nextRid = getNextRid(relsPath);

  const rels: [string, string][] = [
    [
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
      "comments.xml",
    ],
    [
      "http://schemas.microsoft.com/office/2011/relationships/commentsExtended",
      "commentsExtended.xml",
    ],
    [
      "http://schemas.microsoft.com/office/2016/09/relationships/commentsIds",
      "commentsIds.xml",
    ],
    [
      "http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible",
      "commentsExtensible.xml",
    ],
  ];

  for (const [relType, target] of rels) {
    const rel = dom.createElement("Relationship");
    rel.setAttribute("Id", `rId${nextRid}`);
    rel.setAttribute("Type", relType);
    rel.setAttribute("Target", target);
    root.appendChild(rel);
    nextRid++;
  }

  const serializer = new XMLSerializer();
  let output = serializer.serializeToString(dom);
  if (!output.startsWith("<?xml")) {
    output = '<?xml version="1.0" encoding="UTF-8"?>' + output;
  }
  fs.writeFileSync(relsPath, output, "utf-8");
}

function ensureCommentContentTypes(unpackedDir: string): void {
  const ctPath = path.join(unpackedDir, "[Content_Types].xml");
  if (!fs.existsSync(ctPath)) return;

  if (hasContentType(ctPath, "/word/comments.xml")) return;

  const xmlContent = fs.readFileSync(ctPath, "utf-8");
  const parser = new DOMParser();
  const dom = parser.parseFromString(xmlContent, "text/xml");
  const root = dom.documentElement;

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
    const override = dom.createElement("Override");
    override.setAttribute("PartName", partName);
    override.setAttribute("ContentType", contentType);
    root.appendChild(override);
  }

  const serializer = new XMLSerializer();
  let output = serializer.serializeToString(dom);
  if (!output.startsWith("<?xml")) {
    output = '<?xml version="1.0" encoding="UTF-8"?>' + output;
  }
  fs.writeFileSync(ctPath, output, "utf-8");
}

function formatTemplate(
  template: string,
  replacements: Record<string, string | number>
): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(`{${key}}`).join(String(value));
  }
  return result;
}

export function addComment(
  unpackedDir: string,
  commentId: number,
  text: string,
  author: string = "Claude",
  initials: string = "C",
  parentId: number | null = null
): [string, string] {
  const wordDir = path.join(unpackedDir, "word");
  if (!fs.existsSync(wordDir)) {
    return ["", `Error: ${wordDir} not found`];
  }

  const paraId = generateHexId();
  const durableId = generateHexId();
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const commentsPath = path.join(wordDir, "comments.xml");
  const firstComment = !fs.existsSync(commentsPath);
  if (firstComment) {
    fs.copyFileSync(path.join(TEMPLATE_DIR, "comments.xml"), commentsPath);
    ensureCommentRelationships(unpackedDir);
    ensureCommentContentTypes(unpackedDir);
  }
  appendXml(
    commentsPath,
    "w:comments",
    formatTemplate(COMMENT_XML, {
      id: commentId,
      author,
      date: ts,
      initials,
      para_id: paraId,
      text,
    })
  );

  const extPath = path.join(wordDir, "commentsExtended.xml");
  if (!fs.existsSync(extPath)) {
    fs.copyFileSync(
      path.join(TEMPLATE_DIR, "commentsExtended.xml"),
      extPath
    );
  }
  if (parentId !== null) {
    const parentPara = findParaId(commentsPath, parentId);
    if (!parentPara) {
      return ["", `Error: Parent comment ${parentId} not found`];
    }
    appendXml(
      extPath,
      "w15:commentsEx",
      `<w15:commentEx w15:paraId="${paraId}" w15:paraIdParent="${parentPara}" w15:done="0"/>`
    );
  } else {
    appendXml(
      extPath,
      "w15:commentsEx",
      `<w15:commentEx w15:paraId="${paraId}" w15:done="0"/>`
    );
  }

  const idsPath = path.join(wordDir, "commentsIds.xml");
  if (!fs.existsSync(idsPath)) {
    fs.copyFileSync(path.join(TEMPLATE_DIR, "commentsIds.xml"), idsPath);
  }
  appendXml(
    idsPath,
    "w16cid:commentsIds",
    `<w16cid:commentId w16cid:paraId="${paraId}" w16cid:durableId="${durableId}"/>`
  );

  const extensiblePath = path.join(wordDir, "commentsExtensible.xml");
  if (!fs.existsSync(extensiblePath)) {
    fs.copyFileSync(
      path.join(TEMPLATE_DIR, "commentsExtensible.xml"),
      extensiblePath
    );
  }
  appendXml(
    extensiblePath,
    "w16cex:commentsExtensible",
    `<w16cex:commentExtensible w16cex:durableId="${durableId}" w16cex:dateUtc="${ts}"/>`
  );

  const action = parentId !== null ? "reply" : "comment";
  return [paraId, `Added ${action} ${commentId} (para_id=${paraId})`];
}

function parseArgs(argv: string[]): {
  unpackedDir: string;
  commentId: number;
  text: string;
  author: string;
  initials: string;
  parent: number | null;
} {
  const args = argv.slice(2);
  let author = "Claude";
  let initials = "C";
  let parent: number | null = null;

  // Extract named arguments
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--author" && i + 1 < args.length) {
      author = args[++i];
    } else if (args[i] === "--initials" && i + 1 < args.length) {
      initials = args[++i];
    } else if (args[i] === "--parent" && i + 1 < args.length) {
      parent = parseInt(args[++i], 10);
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(
        "Usage: npx tsx comment.ts <unpacked_dir> <comment_id> <text> [--author NAME] [--initials I] [--parent ID]"
      );
      process.exit(0);
    } else {
      positional.push(args[i]);
    }
  }

  if (positional.length < 3) {
    console.error(
      "Usage: npx tsx comment.ts <unpacked_dir> <comment_id> <text> [--author NAME] [--initials I] [--parent ID]"
    );
    process.exit(1);
  }

  return {
    unpackedDir: positional[0],
    commentId: parseInt(positional[1], 10),
    text: positional[2],
    author,
    initials,
    parent,
  };
}

// CLI entry point - only run when executed directly
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  const parsed = parseArgs(process.argv);
  const [paraId, msg] = addComment(
    parsed.unpackedDir,
    parsed.commentId,
    parsed.text,
    parsed.author,
    parsed.initials,
    parsed.parent
  );
  console.log(msg);

  if (msg.includes("Error")) {
    process.exit(1);
  }

  const cid = parsed.commentId;
  if (parsed.parent !== null) {
    console.log(
      formatTemplate(REPLY_MARKER_TEMPLATE, {
        pid: parsed.parent,
        cid,
      })
    );
  } else {
    console.log(formatTemplate(COMMENT_MARKER_TEMPLATE, { cid }));
  }
}
