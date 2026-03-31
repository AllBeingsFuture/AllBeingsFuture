#!/usr/bin/env npx tsx
/**
 * Quick validation script for skills - minimal version
 *
 * Usage:
 *   npx tsx quick_validate.ts <skill_directory>
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

// ---------------------------------------------------------------------------
// Simple YAML parser (handles the subset used by SKILL.md frontmatter)
// ---------------------------------------------------------------------------

function parseSimpleYaml(text: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value: string | unknown = trimmed.slice(colonIdx + 1).trim();

    // Handle quoted strings
    if (
      (typeof value === "string" && value.startsWith('"') && value.endsWith('"')) ||
      (typeof value === "string" && value.startsWith("'") && value.endsWith("'"))
    ) {
      value = (value as string).slice(1, -1);
    }

    // Handle arrays (simple inline)
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
    }

    if (key) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateSkill(skillPath: string): [boolean, string] {
  const resolved = nodePath.resolve(skillPath);

  // Check SKILL.md exists
  const skillMdPath = nodePath.join(resolved, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) {
    return [false, "SKILL.md not found"];
  }

  // Read and validate frontmatter
  const content = fs.readFileSync(skillMdPath, "utf-8");
  if (!content.startsWith("---")) {
    return [false, "No YAML frontmatter found"];
  }

  // Extract frontmatter
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return [false, "Invalid frontmatter format"];
  }

  const frontmatterText = match[1];

  // Parse YAML frontmatter
  let frontmatter: Record<string, unknown> | null;
  try {
    frontmatter = parseSimpleYaml(frontmatterText);
    if (!frontmatter || typeof frontmatter !== "object") {
      return [false, "Frontmatter must be a YAML dictionary"];
    }
  } catch (e) {
    return [false, `Invalid YAML in frontmatter: ${(e as Error).message}`];
  }

  // Define allowed properties
  const ALLOWED_PROPERTIES = new Set([
    "name",
    "description",
    "license",
    "allowed-tools",
    "metadata",
    "compatibility",
  ]);

  // Check for unexpected properties
  const unexpectedKeys = Object.keys(frontmatter).filter((k) => !ALLOWED_PROPERTIES.has(k));
  if (unexpectedKeys.length > 0) {
    return [
      false,
      `Unexpected key(s) in SKILL.md frontmatter: ${unexpectedKeys.sort().join(", ")}. ` +
        `Allowed properties are: ${[...ALLOWED_PROPERTIES].sort().join(", ")}`,
    ];
  }

  // Check required fields
  if (!("name" in frontmatter)) {
    return [false, "Missing 'name' in frontmatter"];
  }
  if (!("description" in frontmatter)) {
    return [false, "Missing 'description' in frontmatter"];
  }

  // Validate name
  const name = String(frontmatter.name ?? "").trim();
  if (name) {
    if (!/^[a-z0-9-]+$/.test(name)) {
      return [
        false,
        `Name '${name}' should be kebab-case (lowercase letters, digits, and hyphens only)`,
      ];
    }
    if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
      return [
        false,
        `Name '${name}' cannot start/end with hyphen or contain consecutive hyphens`,
      ];
    }
    if (name.length > 64) {
      return [
        false,
        `Name is too long (${name.length} characters). Maximum is 64 characters.`,
      ];
    }
  }

  // Validate description
  const description = String(frontmatter.description ?? "").trim();
  if (description) {
    if (description.includes("<") || description.includes(">")) {
      return [false, "Description cannot contain angle brackets (< or >)"];
    }
    if (description.length > 1024) {
      return [
        false,
        `Description is too long (${description.length} characters). Maximum is 1024 characters.`,
      ];
    }
  }

  // Validate compatibility field if present
  if ("compatibility" in frontmatter) {
    const compatibility = String(frontmatter.compatibility ?? "").trim();
    if (compatibility && compatibility.length > 500) {
      return [
        false,
        `Compatibility is too long (${compatibility.length} characters). Maximum is 500 characters.`,
      ];
    }
  }

  // Validate agents/openai.yaml if present
  const openaiYamlPath = nodePath.join(resolved, "agents", "openai.yaml");
  if (fs.existsSync(openaiYamlPath)) {
    try {
      const yamlText = fs.readFileSync(openaiYamlPath, "utf-8");
      const yamlContent = parseSimpleYaml(yamlText);
      if (!yamlContent || typeof yamlContent !== "object") {
        return [false, "agents/openai.yaml must be a YAML dictionary"];
      }
      // Check for short_description length in the raw text since our parser is simplified
      const shortDescMatch = yamlText.match(/short_description:\s*"([^"]*)"/);
      if (shortDescMatch) {
        const shortDesc = shortDescMatch[1];
        if (shortDesc.length < 25 || shortDesc.length > 64) {
          return [
            false,
            `agents/openai.yaml: short_description must be 25-64 characters (got ${shortDesc.length})`,
          ];
        }
      }
    } catch (e) {
      return [false, `Invalid YAML in agents/openai.yaml: ${(e as Error).message}`];
    }
  }

  return [true, "Skill is valid!"];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error("Usage: npx tsx quick_validate.ts <skill_directory>");
    process.exit(1);
  }

  const [valid, message] = validateSkill(args[0]);
  console.log(message);
  process.exit(valid ? 0 : 1);
}

main();
