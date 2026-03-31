/**
 * Unpack Office files (DOCX, PPTX, XLSX) for editing.
 *
 * Extracts the ZIP archive, pretty-prints XML files, and optionally:
 * - Merges adjacent runs with identical formatting (DOCX only)
 * - Simplifies adjacent tracked changes from same author (DOCX only)
 * - Escapes smart quotes as XML entities
 *
 * Usage:
 *   npx tsx unpack.ts <office_file> <output_dir> [--merge-runs true|false] [--simplify-redlines true|false]
 *
 * Examples:
 *   npx tsx unpack.ts document.docx unpacked/
 *   npx tsx unpack.ts presentation.pptx unpacked/
 *   npx tsx unpack.ts document.docx unpacked/ --merge-runs false
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { mergeRuns as doMergeRuns } from "./helpers/merge-runs.js";
import { simplifyRedlines as doSimplifyRedlines } from "./helpers/simplify-redlines.js";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SMART_QUOTE_REPLACEMENTS: Record<string, string> = {
  "\u201C": "&#x201C;", // left double
  "\u201D": "&#x201D;", // right double
  "\u2018": "&#x2018;", // left single
  "\u2019": "&#x2019;", // right single
};

const VALID_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx"]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function globXml(dir: string): string[] {
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
        if (ext === ".xml" || ext === ".rels") {
          results.push(full);
        }
      }
    }
  }
  walk(dir);
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

function prettyPrintXml(xmlFile: string): void {
  try {
    const content = fs.readFileSync(xmlFile, "utf-8");
    const errors: string[] = [];
    const parser = new DOMParser({
      errorHandler: {
        warning: () => {},
        error: (msg: string) => { errors.push(msg); },
        fatalError: (msg: string) => { errors.push(msg); },
      },
    });
    const dom = parser.parseFromString(content, "text/xml");
    if (errors.length > 0) return; // skip malformed files

    // Use a simple pretty-print approach: serialize and re-indent
    const serializer = new XMLSerializer();
    let xml = serializer.serializeToString(dom);

    // Simple pretty-printing: add newlines after close tags and indent
    // We use a lightweight approach that mimics minidom.toprettyxml
    xml = prettyFormat(xml);

    fs.writeFileSync(xmlFile, xml, "utf-8");
  } catch {
    // skip files that cannot be parsed
  }
}

/**
 * Simple XML pretty-formatter that adds indentation.
 */
function prettyFormat(xml: string): string {
  // Remove existing whitespace between tags
  let formatted = xml.replace(/>\s*</g, "><");

  const lines: string[] = [];
  let indent = 0;
  const indentStr = "  ";

  // Split on tag boundaries
  const tokens = formatted.match(/<[^>]+>|[^<]+/g);
  if (!tokens) return xml;

  for (const token of tokens) {
    if (token.startsWith("<?")) {
      // Processing instruction
      lines.push(indentStr.repeat(indent) + token);
    } else if (token.startsWith("</")) {
      // Closing tag
      indent = Math.max(0, indent - 1);
      lines.push(indentStr.repeat(indent) + token);
    } else if (token.startsWith("<") && token.endsWith("/>")) {
      // Self-closing tag
      lines.push(indentStr.repeat(indent) + token);
    } else if (token.startsWith("<")) {
      // Opening tag
      lines.push(indentStr.repeat(indent) + token);
      indent++;
    } else {
      // Text content - append to previous line
      if (lines.length > 0) {
        lines[lines.length - 1] += token;
      } else {
        lines.push(token);
      }
    }
  }

  // Fix: merge text nodes with their parent tags (e.g., <w:t>text</w:t>)
  const merged: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // If next line is a closing tag and current ends with text, merge
    if (i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      const current = line.trim();
      // If this is an opening tag followed by text followed by closing tag
      if (current.startsWith("<") && !current.startsWith("</") && !current.endsWith("/>")) {
        // Check if the content between this and next close tag is text
        if (next.startsWith("</")) {
          // Check if there's text content embedded
          const tagMatch = current.match(/^<([^\s/>]+)/);
          const closeMatch = next.match(/^<\/([^\s>]+)/);
          if (tagMatch && closeMatch && tagMatch[1].split(":").pop() === closeMatch[1].split(":").pop()) {
            merged.push(line + next.trim());
            i++; // skip next
            continue;
          }
        }
      }
    }
    merged.push(line);
  }

  return merged.join("\n");
}

function escapeSmartQuotes(xmlFile: string): void {
  try {
    let content = fs.readFileSync(xmlFile, "utf-8");
    for (const [char, entity] of Object.entries(SMART_QUOTE_REPLACEMENTS)) {
      content = content.split(char).join(entity);
    }
    fs.writeFileSync(xmlFile, content, "utf-8");
  } catch {
    // skip
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function unpack(
  inputFile: string,
  outputDirectory: string,
  options: { mergeRuns?: boolean; simplifyRedlines?: boolean } = {},
): [null, string] {
  const mergeRunsOpt = options.mergeRuns ?? true;
  const simplifyRedlinesOpt = options.simplifyRedlines ?? true;

  const inputPath = path.resolve(inputFile);
  const outputPath = path.resolve(outputDirectory);
  const suffix = path.extname(inputPath).toLowerCase();

  if (!fs.existsSync(inputPath)) {
    return [null, `Error: ${inputFile} does not exist`];
  }

  if (!VALID_EXTENSIONS.has(suffix)) {
    return [null, `Error: ${inputFile} must be a .docx, .pptx, or .xlsx file`];
  }

  try {
    fs.mkdirSync(outputPath, { recursive: true });

    // Extract zip
    extractZip(inputPath, outputPath);

    // Pretty-print all XML files
    const xmlFiles = globXml(outputPath);
    for (const xmlFile of xmlFiles) {
      prettyPrintXml(xmlFile);
    }

    let message = `Unpacked ${inputFile} (${xmlFiles.length} XML files)`;

    // DOCX-specific processing
    if (suffix === ".docx") {
      if (simplifyRedlinesOpt) {
        const [simplifyCount] = doSimplifyRedlines(outputPath);
        message += `, simplified ${simplifyCount} tracked changes`;
      }

      if (mergeRunsOpt) {
        const [mergeCount] = doMergeRuns(outputPath);
        message += `, merged ${mergeCount} runs`;
      }
    }

    // Escape smart quotes in all XML files
    for (const xmlFile of xmlFiles) {
      escapeSmartQuotes(xmlFile);
    }

    return [null, message];
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("Bad")) {
      return [null, `Error: ${inputFile} is not a valid Office file`];
    }
    const msg = e instanceof Error ? e.message : String(e);
    return [null, `Error unpacking: ${msg}`];
  }
}

/* ------------------------------------------------------------------ */
/*  CLI entry point                                                    */
/* ------------------------------------------------------------------ */

if (process.argv[1] && (process.argv[1].endsWith("unpack.ts") || process.argv[1].endsWith("unpack.js"))) {
  const args = process.argv.slice(2);

  // Parse arguments
  let inputFile = "";
  let outputDir = "";
  let mergeRunsFlag = true;
  let simplifyRedlinesFlag = true;

  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--merge-runs" && i + 1 < args.length) {
      mergeRunsFlag = args[++i].toLowerCase() === "true";
    } else if (args[i] === "--simplify-redlines" && i + 1 < args.length) {
      simplifyRedlinesFlag = args[++i].toLowerCase() === "true";
    } else if (!args[i].startsWith("--")) {
      positional.push(args[i]);
    }
  }

  if (positional.length < 2) {
    console.error("Usage: npx tsx unpack.ts <office_file> <output_dir> [--merge-runs true|false] [--simplify-redlines true|false]");
    process.exit(1);
  }

  inputFile = positional[0];
  outputDir = positional[1];

  const [, message] = unpack(inputFile, outputDir, {
    mergeRuns: mergeRunsFlag,
    simplifyRedlines: simplifyRedlinesFlag,
  });

  console.log(message);
  if (message.includes("Error")) process.exit(1);
}
