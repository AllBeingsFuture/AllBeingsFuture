/**
 * Pack a directory into a DOCX, PPTX, or XLSX file.
 *
 * Validates with auto-repair, condenses XML formatting, and creates the Office file.
 *
 * Usage:
 *   npx tsx pack.ts <input_directory> <output_file> [--original <file>] [--validate true|false]
 *
 * Examples:
 *   npx tsx pack.ts unpacked/ output.docx --original input.docx
 *   npx tsx pack.ts unpacked/ output.pptx --validate false
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import archiver from "archiver";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { DOCXSchemaValidator } from "./validators/docx.js";
import { PPTXSchemaValidator } from "./validators/pptx.js";
import { RedliningValidator } from "./validators/redlining.js";
import { inferAuthor, getTrackedChangeAuthors } from "./helpers/simplify-redlines.js";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) {
        const ext = path.extname(entry).toLowerCase();
        if (ext === ".xml" || ext === ".rels") results.push(full);
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
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) results.push(full);
    }
  }
  walk(dir);
  return results;
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function condenseXml(xmlFile: string): void {
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
    if (errors.length > 0) throw new Error(errors.join("; "));

    // Process each element to remove whitespace and comments
    const elements = dom.getElementsByTagName("*");
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];

      // Skip w:t elements (preserve their text content)
      if (element.tagName.endsWith(":t")) continue;

      // Remove whitespace-only text nodes and comment nodes
      const toRemove: Node[] = [];
      for (let j = 0; j < element.childNodes.length; j++) {
        const child = element.childNodes[j];
        if (
          (child.nodeType === 3 /* TEXT_NODE */ &&
            child.nodeValue &&
            child.nodeValue.trim() === "") ||
          child.nodeType === 8 /* COMMENT_NODE */
        ) {
          toRemove.push(child);
        }
      }
      for (const node of toRemove) {
        element.removeChild(node);
      }
    }

    const serializer = new XMLSerializer();
    const output = serializer.serializeToString(dom);
    fs.writeFileSync(xmlFile, output, "utf-8");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`ERROR: Failed to parse ${path.basename(xmlFile)}: ${msg}`);
    throw e;
  }
}

function getOriginalAuthors(originalFile: string): Record<string, number> {
  // Extract original and get authors
  const { execSync } = require("node:child_process");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-orig-"));
  try {
    const script = `
      const yauzl = require('yauzl');
      const fs = require('fs');
      const path = require('path');
      yauzl.open(${JSON.stringify(originalFile)}, {lazyEntries: true}, (err, zf) => {
        if (err) { process.stderr.write(err.message); process.exit(1); }
        zf.readEntry();
        zf.on('entry', (entry) => {
          const fp = path.join(${JSON.stringify(tmpDir)}, entry.fileName);
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

    const docXml = path.join(tmpDir, "word", "document.xml");
    return getTrackedChangeAuthors(docXml);
  } catch {
    return {};
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/*  Zip creation using archiver                                        */
/* ------------------------------------------------------------------ */

function createZipSync(sourceDir: string, outputFile: string): void {
  // Use a synchronous approach: spawn node with archiver
  const { execSync } = require("node:child_process");
  const script = `
    const archiver = require('archiver');
    const fs = require('fs');
    const path = require('path');

    const output = fs.createWriteStream(${JSON.stringify(outputFile)});
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => process.exit(0));
    archive.on('error', (err) => { process.stderr.write(err.message); process.exit(1); });

    archive.pipe(output);

    function addDir(dir, prefix) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        const rel = prefix ? prefix + '/' + entry : entry;
        if (stat.isDirectory()) {
          addDir(full, rel);
        } else {
          archive.file(full, { name: rel });
        }
      }
    }

    addDir(${JSON.stringify(sourceDir)}, '');
    archive.finalize();
  `;
  execSync(`node -e ${JSON.stringify(script)}`, { stdio: ["pipe", "pipe", "pipe"] });
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

function runValidation(
  unpackedDir: string,
  originalFile: string,
  suffix: string,
  infer: boolean = true,
): [boolean, string | null] {
  const outputLines: string[] = [];

  let validators: Array<{ repair(): number; validate(): boolean }> = [];

  if (suffix === ".docx") {
    let author = "Claude";
    if (infer) {
      try {
        const originalAuthors = getOriginalAuthors(originalFile);
        author = inferAuthor(unpackedDir, originalAuthors);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Warning: ${msg} Using default author 'Claude'.`);
      }
    }

    validators = [
      new DOCXSchemaValidator({ unpackedDir, originalFile }),
      new RedliningValidator({ unpackedDir, originalFile, author }),
    ];
  } else if (suffix === ".pptx") {
    validators = [
      new PPTXSchemaValidator({ unpackedDir, originalFile }),
    ];
  }

  if (validators.length === 0) return [true, null];

  let totalRepairs = 0;
  for (const v of validators) {
    totalRepairs += v.repair();
  }
  if (totalRepairs > 0) {
    outputLines.push(`Auto-repaired ${totalRepairs} issue(s)`);
  }

  let success = true;
  for (const v of validators) {
    if (!v.validate()) success = false;
  }

  if (success) {
    outputLines.push("All validations PASSED!");
  }

  return [success, outputLines.length > 0 ? outputLines.join("\n") : null];
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function pack(
  inputDirectory: string,
  outputFile: string,
  options: {
    originalFile?: string | null;
    validate?: boolean;
  } = {},
): [null, string] {
  const validate = options.validate ?? true;
  const originalFile = options.originalFile ?? null;

  const inputDir = path.resolve(inputDirectory);
  const outputPath = path.resolve(outputFile);
  const suffix = path.extname(outputPath).toLowerCase();

  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    return [null, `Error: ${inputDir} is not a directory`];
  }

  if (!VALID_EXTENSIONS.has(suffix)) {
    return [null, `Error: ${outputFile} must be a .docx, .pptx, or .xlsx file`];
  }

  // Validate if requested
  if (validate && originalFile) {
    if (fs.existsSync(originalFile)) {
      const [success, output] = runValidation(inputDir, originalFile, suffix);
      if (output) console.log(output);
      if (!success) {
        return [null, `Error: Validation failed for ${inputDir}`];
      }
    }
  }

  // Work in a temp directory to avoid modifying the original
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-"));
  try {
    const tmpContentDir = path.join(tmpDir, "content");
    copyDirSync(inputDir, tmpContentDir);

    // Condense XML formatting
    const xmlFiles = globXml(tmpContentDir);
    for (const xmlFile of xmlFiles) {
      condenseXml(xmlFile);
    }

    // Create output directory if needed
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create ZIP (Office file)
    createZipSync(tmpContentDir, outputPath);

    return [null, `Successfully packed ${inputDir} to ${outputFile}`];
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/*  CLI entry point                                                    */
/* ------------------------------------------------------------------ */

if (process.argv[1] && (process.argv[1].endsWith("pack.ts") || process.argv[1].endsWith("pack.js"))) {
  const args = process.argv.slice(2);

  let inputDirectory = "";
  let outputFile = "";
  let originalFile: string | null = null;
  let validateFlag = true;

  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--original" && i + 1 < args.length) {
      originalFile = args[++i];
    } else if (args[i] === "--validate" && i + 1 < args.length) {
      validateFlag = args[++i].toLowerCase() === "true";
    } else if (!args[i].startsWith("--")) {
      positional.push(args[i]);
    }
  }

  if (positional.length < 2) {
    console.error("Usage: npx tsx pack.ts <input_directory> <output_file> [--original <file>] [--validate true|false]");
    process.exit(1);
  }

  inputDirectory = positional[0];
  outputFile = positional[1];

  const [, message] = pack(inputDirectory, outputFile, {
    originalFile,
    validate: validateFlag,
  });

  console.log(message);
  if (message.includes("Error")) process.exit(1);
}
