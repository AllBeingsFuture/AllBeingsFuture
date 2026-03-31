#!/usr/bin/env npx tsx
/**
 * File Manager - File operations utility
 *
 * Usage:
 *   npx tsx file_ops.ts <command> [options]
 *
 * Commands:
 *   list    List directory contents
 *   read    Read file
 *   write   Write file
 *   copy    Copy file/directory
 *   move    Move/rename file/directory
 *   delete  Delete file or directory
 *   search  Search files
 *   info    Get file/directory info
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(size: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let s = size;
  for (const unit of units) {
    if (s < 1024) return `${s.toFixed(2)} ${unit}`;
    s /= 1024;
  }
  return `${s.toFixed(2)} PB`;
}

/**
 * Simple recursive glob using fs.readdirSync.
 * Supports basic `*` and `**` patterns.
 */
function globMatch(name: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<DOUBLESTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<DOUBLESTAR>>/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regexStr}$`).test(name);
}

function walkDir(dir: string, recursive: boolean, pattern?: string): { files: string[]; directories: string[] } {
  const files: string[] = [];
  const directories: string[] = [];

  function walk(currentDir: string, relativeBase: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relativePath = relativeBase ? path.join(relativeBase, entry.name) : entry.name;

      if (entry.isFile()) {
        if (!pattern || globMatch(entry.name, pattern) || globMatch(relativePath, pattern)) {
          files.push(relativePath);
        }
      } else if (entry.isDirectory()) {
        if (!pattern || globMatch(entry.name, pattern) || globMatch(relativePath, pattern)) {
          directories.push(relativePath);
        }
        if (recursive) {
          walk(path.join(currentDir, entry.name), relativePath);
        }
      }
    }
  }

  walk(dir, "");
  return { files, directories };
}

function copyDirRecursive(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function listDirectory(
  dirPath: string,
  recursive: boolean,
  pattern?: string,
): Record<string, unknown> {
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved)) {
    return { success: false, error: `Path not found: ${dirPath}` };
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    return { success: false, error: `Not a directory: ${dirPath}` };
  }

  const { files, directories } = walkDir(resolved, recursive, pattern);

  return {
    success: true,
    operation: "list",
    path: resolved,
    data: {
      files: files.sort(),
      directories: directories.sort(),
      file_count: files.length,
      dir_count: directories.length,
    },
  };
}

function readFile(
  filePath: string,
  encoding: BufferEncoding = "utf-8",
): Record<string, unknown> {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { success: false, error: `File not found: ${filePath}` };
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return { success: false, error: `Not a file: ${filePath}` };
  }

  try {
    const content = fs.readFileSync(resolved, encoding);
    return {
      success: true,
      operation: "read",
      path: resolved,
      data: {
        content,
        size: content.length,
        lines: content.split("\n").length,
      },
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

function writeFile(
  filePath: string,
  content: string,
  append: boolean,
  encoding: BufferEncoding = "utf-8",
): Record<string, unknown> {
  const resolved = path.resolve(filePath);

  try {
    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(resolved), { recursive: true });

    if (append) {
      fs.appendFileSync(resolved, content, encoding);
    } else {
      fs.writeFileSync(resolved, content, encoding);
    }

    return {
      success: true,
      operation: "write",
      path: resolved,
      data: {
        bytes_written: Buffer.byteLength(content, encoding),
        append,
      },
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

function copyFile(source: string, destination: string): Record<string, unknown> {
  const srcResolved = path.resolve(source);
  const dstResolved = path.resolve(destination);

  if (!fs.existsSync(srcResolved)) {
    return { success: false, error: `Source not found: ${source}` };
  }

  try {
    const stat = fs.statSync(srcResolved);
    if (stat.isDirectory()) {
      copyDirRecursive(srcResolved, dstResolved);
    } else {
      fs.mkdirSync(path.dirname(dstResolved), { recursive: true });
      fs.copyFileSync(srcResolved, dstResolved);
    }

    return {
      success: true,
      operation: "copy",
      data: {
        source: srcResolved,
        destination: dstResolved,
      },
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

function moveFile(source: string, destination: string): Record<string, unknown> {
  const srcResolved = path.resolve(source);
  const dstResolved = path.resolve(destination);

  if (!fs.existsSync(srcResolved)) {
    return { success: false, error: `Source not found: ${source}` };
  }

  try {
    fs.mkdirSync(path.dirname(dstResolved), { recursive: true });
    fs.renameSync(srcResolved, dstResolved);

    return {
      success: true,
      operation: "move",
      data: {
        source: srcResolved,
        destination: dstResolved,
      },
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

function deletePath(
  targetPath: string,
  recursive: boolean,
): Record<string, unknown> {
  const resolved = path.resolve(targetPath);

  if (!fs.existsSync(resolved)) {
    return { success: false, error: `Path not found: ${targetPath}` };
  }

  try {
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      if (recursive) {
        fs.rmSync(resolved, { recursive: true, force: true });
      } else {
        fs.rmdirSync(resolved); // only works on empty directories
      }
    } else {
      fs.unlinkSync(resolved);
    }

    return {
      success: true,
      operation: "delete",
      data: {
        path: resolved,
        was_directory: stat.isDirectory(),
      },
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

function searchFiles(
  directory: string,
  pattern: string,
  contentSearch?: string,
): Record<string, unknown> {
  const resolved = path.resolve(directory);

  if (!fs.existsSync(resolved)) {
    return { success: false, error: `Directory not found: ${directory}` };
  }

  const { files } = walkDir(resolved, true, pattern);
  const matches: Array<Record<string, unknown>> = [];

  for (const relPath of files) {
    const fullPath = path.join(resolved, relPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    const matchInfo: Record<string, unknown> = {
      path: relPath,
      size: stat.size,
    };

    if (contentSearch) {
      try {
        const text = fs.readFileSync(fullPath, "utf-8");
        const lower = contentSearch.toLowerCase();
        if (text.toLowerCase().includes(lower)) {
          const lines: Array<{ line: number; content: string }> = [];
          const textLines = text.split("\n");
          for (let i = 0; i < textLines.length && lines.length < 10; i++) {
            if (textLines[i].toLowerCase().includes(lower)) {
              lines.push({
                line: i + 1,
                content: textLines[i].trim().slice(0, 100),
              });
            }
          }
          matchInfo.matches = lines;
          matches.push(matchInfo);
        }
      } catch {
        // skip files that can't be read
      }
    } else {
      matches.push(matchInfo);
    }
  }

  return {
    success: true,
    operation: "search",
    data: {
      directory: resolved,
      pattern,
      content_search: contentSearch ?? null,
      matches,
      count: matches.length,
    },
  };
}

function getInfo(targetPath: string): Record<string, unknown> {
  const resolved = path.resolve(targetPath);

  if (!fs.existsSync(resolved)) {
    return { success: false, error: `Path not found: ${targetPath}` };
  }

  const stat = fs.statSync(resolved);

  const info: Record<string, unknown> = {
    path: resolved,
    name: path.basename(resolved),
    is_file: stat.isFile(),
    is_directory: stat.isDirectory(),
    size: stat.size,
    size_formatted: formatSize(stat.size),
    created: new Date(stat.birthtimeMs).toISOString(),
    modified: new Date(stat.mtimeMs).toISOString(),
    accessed: new Date(stat.atimeMs).toISOString(),
  };

  if (stat.isFile()) {
    info.extension = path.extname(resolved);
  } else if (stat.isDirectory()) {
    const items = fs.readdirSync(resolved, { withFileTypes: true });
    info.item_count = items.length;
    info.file_count = items.filter((i) => i.isFile()).length;
    info.dir_count = items.filter((i) => i.isDirectory()).length;
  }

  return {
    success: true,
    operation: "info",
    data: info,
  };
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseCliArgs(): {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error(
      "Usage: npx tsx file_ops.ts <command> [options]\n" +
        "Commands: list, read, write, copy, move, delete, search, info",
    );
    process.exit(1);
  }

  const command = argv[0];
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith("--") || argv[i].startsWith("-")) {
      const key = argv[i].replace(/^-+/, "");
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(argv[i]);
    }
  }

  return { command, positional, flags };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const { command, positional, flags } = parseCliArgs();

  let result: Record<string, unknown>;

  switch (command) {
    case "list":
      result = listDirectory(
        positional[0] || ".",
        flags["recursive"] === true || flags["r"] === true,
        (flags["pattern"] as string) || (flags["p"] as string) || undefined,
      );
      break;

    case "read":
      result = readFile(
        positional[0] || "",
        ((flags["encoding"] as string) || (flags["e"] as string) || "utf-8") as BufferEncoding,
      );
      break;

    case "write":
      result = writeFile(
        positional[0] || "",
        (flags["content"] as string) || (flags["c"] as string) || "",
        flags["append"] === true || flags["a"] === true,
        ((flags["encoding"] as string) || (flags["e"] as string) || "utf-8") as BufferEncoding,
      );
      break;

    case "copy":
      result = copyFile(positional[0] || "", positional[1] || "");
      break;

    case "move":
      result = moveFile(positional[0] || "", positional[1] || "");
      break;

    case "delete":
      result = deletePath(
        positional[0] || "",
        flags["recursive"] === true || flags["r"] === true,
      );
      break;

    case "search":
      result = searchFiles(
        positional[0] || ".",
        (flags["pattern"] as string) || (flags["p"] as string) || "*",
        (flags["content"] as string) || (flags["c"] as string) || undefined,
      );
      break;

    case "info":
      result = getInfo(positional[0] || ".");
      break;

    default:
      result = { success: false, error: `Unknown command: ${command}` };
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
