#!/usr/bin/env npx tsx
/**
 * Skill Packager - Creates a distributable .skill file of a skill folder
 *
 * Usage:
 *   npx tsx package_skill.ts <path/to/skill-folder> [output-directory]
 *
 * Example:
 *   npx tsx package_skill.ts skills/public/my-skill
 *   npx tsx package_skill.ts skills/public/my-skill ./dist
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as zlib from "node:zlib";

import { validateSkill } from "./quick_validate.js";

// Patterns to exclude when packaging skills
const EXCLUDE_DIRS = new Set(["__pycache__", "node_modules"]);
const EXCLUDE_GLOBS = ["*.pyc"];
const EXCLUDE_FILES = new Set([".DS_Store"]);
// Directories excluded only at the skill root (not when nested deeper)
const ROOT_EXCLUDE_DIRS = new Set(["evals"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function globMatch(name: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regexStr}$`).test(name);
}

function shouldExclude(relParts: string[]): boolean {
  // Check any path component against EXCLUDE_DIRS
  if (relParts.some((part) => EXCLUDE_DIRS.has(part))) return true;

  // relParts[0] is the skill folder name, relParts[1] would be root subdirectory
  if (relParts.length > 1 && ROOT_EXCLUDE_DIRS.has(relParts[1])) return true;

  const name = relParts[relParts.length - 1];
  if (EXCLUDE_FILES.has(name)) return true;
  if (EXCLUDE_GLOBS.some((pat) => globMatch(name, pat))) return true;

  return false;
}

/**
 * Collect all files recursively from a directory.
 */
function collectFiles(dir: string): string[] {
  const result: string[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = nodePath.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }

  walk(dir);
  return result;
}

// ---------------------------------------------------------------------------
// Zip creation using raw zip format (no external dependencies)
// ---------------------------------------------------------------------------

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  const year = date.getFullYear() - 1980;
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: (year << 9) | (month << 5) | day,
  };
}

interface ZipEntry {
  name: string;
  data: Buffer;
  compressed: Buffer;
  crc: number;
  offset: number;
}

function createZipBuffer(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  let offset = 0;

  // Local file headers + data
  for (const entry of entries) {
    entry.offset = offset;
    const nameBuffer = Buffer.from(entry.name, "utf-8");
    const dt = dosDateTime(new Date());

    // Local file header
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4); // Version needed
    localHeader.writeUInt16LE(0, 6); // Flags
    localHeader.writeUInt16LE(8, 8); // Compression: deflate
    localHeader.writeUInt16LE(dt.time, 10);
    localHeader.writeUInt16LE(dt.date, 12);
    localHeader.writeUInt32LE(entry.crc, 14);
    localHeader.writeUInt32LE(entry.compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // Extra field length

    parts.push(localHeader, nameBuffer, entry.compressed);
    offset += localHeader.length + nameBuffer.length + entry.compressed.length;
  }

  const centralDirOffset = offset;

  // Central directory headers
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf-8");
    const dt = dosDateTime(new Date());

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0, 8); // Flags
    centralHeader.writeUInt16LE(8, 10); // Compression: deflate
    centralHeader.writeUInt16LE(dt.time, 12);
    centralHeader.writeUInt16LE(dt.date, 14);
    centralHeader.writeUInt32LE(entry.crc, 16);
    centralHeader.writeUInt32LE(entry.compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // Comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal attrs
    centralHeader.writeUInt32LE(0, 38); // External attrs
    centralHeader.writeUInt32LE(entry.offset, 42); // Local header offset

    parts.push(centralHeader, nameBuffer);
    offset += centralHeader.length + nameBuffer.length;
  }

  const centralDirSize = offset - centralDirOffset;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Central dir disk
  eocd.writeUInt16LE(entries.length, 8); // Entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // Comment length

  parts.push(eocd);

  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Core packaging logic
// ---------------------------------------------------------------------------

function packageSkill(skillPath: string, outputDir?: string): string | null {
  const resolved = nodePath.resolve(skillPath);

  if (!fs.existsSync(resolved)) {
    console.error(`Error: Skill folder not found: ${resolved}`);
    return null;
  }

  if (!fs.statSync(resolved).isDirectory()) {
    console.error(`Error: Path is not a directory: ${resolved}`);
    return null;
  }

  const skillMd = nodePath.join(resolved, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    console.error(`Error: SKILL.md not found in ${resolved}`);
    return null;
  }

  // Run validation before packaging
  console.log("Validating skill...");
  const [valid, message] = validateSkill(resolved);
  if (!valid) {
    console.error(`Validation failed: ${message}`);
    console.error("   Please fix the validation errors before packaging.");
    return null;
  }
  console.log(`${message}\n`);

  // Determine output location
  const skillName = nodePath.basename(resolved);
  let outputPath: string;
  if (outputDir) {
    outputPath = nodePath.resolve(outputDir);
    fs.mkdirSync(outputPath, { recursive: true });
  } else {
    outputPath = process.cwd();
  }

  const skillFilename = nodePath.join(outputPath, `${skillName}.skill`);

  try {
    const allFiles = collectFiles(resolved);
    const parentDir = nodePath.dirname(resolved);
    const zipEntries: ZipEntry[] = [];

    for (const filePath of allFiles) {
      const relPath = nodePath.relative(parentDir, filePath);
      const relParts = relPath.split(nodePath.sep);

      if (shouldExclude(relParts)) {
        console.log(`  Skipped: ${relPath}`);
        continue;
      }

      const data = fs.readFileSync(filePath);
      const compressed = zlib.deflateRawSync(data);

      zipEntries.push({
        name: relParts.join("/"), // Use forward slashes in zip
        data,
        compressed,
        crc: crc32(data),
        offset: 0,
      });

      console.log(`  Added: ${relPath}`);
    }

    const zipBuffer = createZipBuffer(zipEntries);
    fs.writeFileSync(skillFilename, zipBuffer);

    console.log(`\nSuccessfully packaged skill to: ${skillFilename}`);
    return skillFilename;
  } catch (e) {
    console.error(`Error creating .skill file: ${(e as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("Usage: npx tsx package_skill.ts <path/to/skill-folder> [output-directory]");
    console.error("\nExample:");
    console.error("  npx tsx package_skill.ts skills/public/my-skill");
    console.error("  npx tsx package_skill.ts skills/public/my-skill ./dist");
    process.exit(1);
  }

  const skillPath = args[0];
  const outputDir = args.length > 1 ? args[1] : undefined;

  console.log(`Packaging skill: ${skillPath}`);
  if (outputDir) {
    console.log(`   Output directory: ${outputDir}`);
  }
  console.log();

  const result = packageSkill(skillPath, outputDir);
  process.exit(result ? 0 : 1);
}

main();
