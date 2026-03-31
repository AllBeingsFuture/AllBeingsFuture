/**
 * Command line tool to validate Office document XML files against schemas and tracked changes.
 *
 * Usage:
 *   npx tsx validate.ts <path> [--original <original_file>] [--auto-repair] [--author NAME] [-v]
 *
 * The first argument can be either:
 * - An unpacked directory containing the Office document XML files
 * - A packed Office file (.docx/.pptx/.xlsx) which will be unpacked to a temp directory
 *
 * Auto-repair fixes:
 * - paraId/durableId values that exceed OOXML limits
 * - Missing xml:space="preserve" on w:t elements with whitespace
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { DOCXSchemaValidator } from "./validators/docx.js";
import { PPTXSchemaValidator } from "./validators/pptx.js";
import { RedliningValidator } from "./validators/redlining.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const VALID_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx"]);

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
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface ValidateOptions {
  path: string;
  original?: string | null;
  verbose?: boolean;
  autoRepair?: boolean;
  author?: string;
}

export function validate(opts: ValidateOptions): boolean {
  const targetPath = path.resolve(opts.path);
  const originalFile = opts.original ? path.resolve(opts.original) : null;
  const verbose = opts.verbose ?? false;
  const autoRepair = opts.autoRepair ?? false;
  const author = opts.author ?? "Claude";

  if (!fs.existsSync(targetPath)) {
    throw new Error(`${targetPath} does not exist`);
  }

  if (originalFile) {
    if (!fs.existsSync(originalFile) || !fs.statSync(originalFile).isFile()) {
      throw new Error(`${originalFile} is not a file`);
    }
    const ext = path.extname(originalFile).toLowerCase();
    if (!VALID_EXTENSIONS.has(ext)) {
      throw new Error(`${originalFile} must be a .docx, .pptx, or .xlsx file`);
    }
  }

  // Determine file extension
  const fileExtension = originalFile
    ? path.extname(originalFile).toLowerCase()
    : path.extname(targetPath).toLowerCase();

  if (!VALID_EXTENSIONS.has(fileExtension) && !fs.statSync(targetPath).isDirectory()) {
    throw new Error(`Cannot determine file type from ${targetPath}. Use --original or provide a .docx/.pptx/.xlsx file.`);
  }

  // Determine unpacked directory
  let unpackedDir: string;
  let tempDir: string | null = null;

  const stat = fs.statSync(targetPath);
  if (stat.isFile() && VALID_EXTENSIONS.has(path.extname(targetPath).toLowerCase())) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-"));
    extractZip(targetPath, tempDir);
    unpackedDir = tempDir;
  } else if (stat.isDirectory()) {
    unpackedDir = targetPath;
  } else {
    throw new Error(`${targetPath} is not a directory or Office file`);
  }

  try {
    // Create validators based on file type
    let validators: Array<{ repair(): number; validate(): boolean }> = [];

    switch (fileExtension) {
      case ".docx": {
        validators = [
          new DOCXSchemaValidator({ unpackedDir, originalFile, verbose }),
        ];
        if (originalFile) {
          validators.push(
            new RedliningValidator({ unpackedDir, originalFile, verbose, author })
          );
        }
        break;
      }
      case ".pptx": {
        validators = [
          new PPTXSchemaValidator({ unpackedDir, originalFile, verbose }),
        ];
        break;
      }
      default: {
        console.log(`Error: Validation not supported for file type ${fileExtension}`);
        return false;
      }
    }

    // Auto-repair if requested
    if (autoRepair) {
      let totalRepairs = 0;
      for (const v of validators) {
        totalRepairs += v.repair();
      }
      if (totalRepairs > 0) {
        console.log(`Auto-repaired ${totalRepairs} issue(s)`);
      }
    }

    // Validate
    let success = true;
    for (const v of validators) {
      if (!v.validate()) success = false;
    }

    if (success) {
      console.log("All validations PASSED!");
    }

    return success;
  } finally {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  CLI entry point                                                    */
/* ------------------------------------------------------------------ */

if (process.argv[1] && (process.argv[1].endsWith("validate.ts") || process.argv[1].endsWith("validate.js"))) {
  const args = process.argv.slice(2);

  let targetPath = "";
  let original: string | null = null;
  let verbose = false;
  let autoRepair = false;
  let author = "Claude";

  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--original" && i + 1 < args.length) {
      original = args[++i];
    } else if (args[i] === "-v" || args[i] === "--verbose") {
      verbose = true;
    } else if (args[i] === "--auto-repair") {
      autoRepair = true;
    } else if (args[i] === "--author" && i + 1 < args.length) {
      author = args[++i];
    } else if (!args[i].startsWith("--") && !args[i].startsWith("-")) {
      positional.push(args[i]);
    }
  }

  if (positional.length < 1) {
    console.error(
      "Usage: npx tsx validate.ts <path> [--original <original_file>] [--auto-repair] [--author NAME] [-v]"
    );
    process.exit(1);
  }

  targetPath = positional[0];

  try {
    const success = validate({ path: targetPath, original, verbose, autoRepair, author });
    process.exit(success ? 0 : 1);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}
