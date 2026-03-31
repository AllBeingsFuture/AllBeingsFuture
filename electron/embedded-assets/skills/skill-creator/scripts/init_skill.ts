#!/usr/bin/env npx tsx
/**
 * Skill Initializer - Creates a new skill from template
 *
 * Usage:
 *   npx tsx init_skill.ts <skill-name> --path <path> [--resources scripts,references,assets] [--examples]
 *
 * Examples:
 *   npx tsx init_skill.ts my-new-skill --path skills/public
 *   npx tsx init_skill.ts my-new-skill --path skills/public --resources scripts,references
 *   npx tsx init_skill.ts my-api-helper --path skills/private --resources scripts --examples
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

const MAX_SKILL_NAME_LENGTH = 64;
const ALLOWED_RESOURCES = new Set(["scripts", "references", "assets"]);
const ALLBEINGSFUTURE_ENV = process.env["ALLBEINGSFUTURE"] === "1";

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const SKILL_TEMPLATE = (skillName: string, skillTitle: string) => `---
name: ${skillName}
description: [TODO: Complete and informative explanation of what the skill does and when to use it. Include WHEN to use this skill - specific scenarios, file types, or tasks that trigger it.]
---

# ${skillTitle}

## Overview

[TODO: 1-2 sentences explaining what this skill enables]

## Structuring This Skill

[TODO: Choose the structure that best fits this skill's purpose. Common patterns:

**1. Workflow-Based** (best for sequential processes)
- Works well when there are clear step-by-step procedures
- Example: DOCX skill with "Workflow Decision Tree" -> "Reading" -> "Creating" -> "Editing"
- Structure: ## Overview -> ## Workflow Decision Tree -> ## Step 1 -> ## Step 2...

**2. Task-Based** (best for tool collections)
- Works well when the skill offers different operations/capabilities
- Example: PDF skill with "Quick Start" -> "Merge PDFs" -> "Split PDFs" -> "Extract Text"
- Structure: ## Overview -> ## Quick Start -> ## Task Category 1 -> ## Task Category 2...

**3. Reference/Guidelines** (best for standards or specifications)
- Works well for brand guidelines, coding standards, or requirements
- Example: Brand styling with "Brand Guidelines" -> "Colors" -> "Typography" -> "Features"
- Structure: ## Overview -> ## Guidelines -> ## Specifications -> ## Usage...

**4. Capabilities-Based** (best for integrated systems)
- Works well when the skill provides multiple interrelated features
- Example: Product Management with "Core Capabilities" -> numbered capability list
- Structure: ## Overview -> ## Core Capabilities -> ### 1. Feature -> ### 2. Feature...

Patterns can be mixed and matched as needed. Most skills combine patterns (e.g., start with task-based, add workflow for complex operations).

Delete this entire "Structuring This Skill" section when done - it's just guidance.]

## [TODO: Replace with the first main section based on chosen structure]

[TODO: Add content here. See examples in existing skills:
- Code samples for technical skills
- Decision trees for complex workflows
- Concrete examples with realistic user requests
- References to scripts/templates/references as needed]

## Resources

This skill includes example resource directories that demonstrate how to organize different types of bundled resources:

### scripts/
Executable code (Python/Bash/etc.) that can be run directly to perform specific operations.

**Examples from other skills:**
- PDF skill: \`fill_fillable_fields.py\`, \`extract_form_field_info.py\` - utilities for PDF manipulation
- DOCX skill: \`document.py\`, \`utilities.py\` - Python modules for document processing

**Appropriate for:** Python scripts, shell scripts, or any executable code that performs automation, data processing, or specific operations.

**Note:** Scripts may be executed without loading into context, but can still be read by Claude for patching or environment adjustments.

### references/
Documentation and reference material intended to be loaded into context to inform Claude's process and thinking.

**Examples from other skills:**
- Product management: \`communication.md\`, \`context_building.md\` - detailed workflow guides
- BigQuery: API reference documentation and query examples
- Finance: Schema documentation, company policies

**Appropriate for:** In-depth documentation, API references, database schemas, comprehensive guides, or any detailed information that Claude should reference while working.

### assets/
Files not intended to be loaded into context, but rather used within the output Claude produces.

**Examples from other skills:**
- Brand styling: PowerPoint template files (.pptx), logo files
- Frontend builder: HTML/React boilerplate project directories
- Typography: Font files (.ttf, .woff2)

**Appropriate for:** Templates, boilerplate code, document templates, images, icons, fonts, or any files meant to be copied or used in the final output.

---

**Any unneeded directories can be deleted.** Not every skill requires all three types of resources.
`;

const EXAMPLE_SCRIPT = (skillName: string) => `#!/usr/bin/env python3
"""
Example helper script for ${skillName}

This is a placeholder script that can be executed directly.
Replace with actual implementation or delete if not needed.

Example real scripts from other skills:
- pdf/scripts/fill_fillable_fields.py - Fills PDF form fields
- pdf/scripts/convert_pdf_to_images.py - Converts PDF pages to images
"""

def main():
    print("This is an example script for ${skillName}")
    # TODO: Add actual script logic here
    # This could be data processing, file conversion, API calls, etc.

if __name__ == "__main__":
    main()
`;

const EXAMPLE_REFERENCE = (skillTitle: string) => `# Reference Documentation for ${skillTitle}

This is a placeholder for detailed reference documentation.
Replace with actual reference content or delete if not needed.

Example real reference docs from other skills:
- product-management/references/communication.md - Comprehensive guide for status updates
- product-management/references/context_building.md - Deep-dive on gathering context
- bigquery/references/ - API references and query examples

## When Reference Docs Are Useful

Reference docs are ideal for:
- Comprehensive API documentation
- Detailed workflow guides
- Complex multi-step processes
- Information too lengthy for main SKILL.md
- Content that's only needed for specific use cases

## Structure Suggestions

### API Reference Example
- Overview
- Authentication
- Endpoints with examples
- Error codes
- Rate limits

### Workflow Guide Example
- Prerequisites
- Step-by-step instructions
- Common patterns
- Troubleshooting
- Best practices
`;

const EXAMPLE_ASSET = `# Example Asset File

This placeholder represents where asset files would be stored.
Replace with actual asset files (templates, images, fonts, etc.) or delete if not needed.

Asset files are NOT intended to be loaded into context, but rather used within
the output Claude produces.

Example asset files from other skills:
- Brand guidelines: logo.png, slides_template.pptx
- Frontend builder: hello-world/ directory with HTML/React boilerplate
- Typography: custom-font.ttf, font-family.woff2
- Data: sample_data.csv, test_dataset.json

## Common Asset Types

- Templates: .pptx, .docx, boilerplate directories
- Images: .png, .jpg, .svg, .gif
- Fonts: .ttf, .otf, .woff, .woff2
- Boilerplate code: Project directories, starter files
- Icons: .ico, .svg
- Data files: .csv, .json, .xml, .yaml

Note: This is a text placeholder. Actual assets can be any file type.
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeSkillName(skillName: string): string {
  let normalized = skillName.trim().toLowerCase();
  normalized = normalized.replace(/[^a-z0-9]+/g, "-");
  normalized = normalized.replace(/^-+|-+$/g, "");
  normalized = normalized.replace(/-{2,}/g, "-");
  return normalized;
}

function titleCaseSkillName(skillName: string): string {
  return skillName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function yamlQuote(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
  return `"${escaped}"`;
}

function generateShortDescription(displayName: string): string {
  let description = `Help with ${displayName} tasks`;
  if (description.length < 25) description = `Help with ${displayName} tasks and workflows`;
  if (description.length > 64) description = `Help with ${displayName}`;
  if (description.length > 64) description = `${displayName} helper`;
  if (description.length > 64) description = description.slice(0, 64).trimEnd();
  if (description.length < 25) {
    description = `${description} workflows`;
    if (description.length > 64) description = description.slice(0, 64).trimEnd();
  }
  return description;
}

function writeOpenaiYaml(
  skillDir: string,
  skillName: string,
  displayName?: string,
  shortDescription?: string,
): string {
  if (!displayName) displayName = titleCaseSkillName(skillName);
  if (!shortDescription) shortDescription = generateShortDescription(displayName);

  const lines: string[] = [
    "interface:",
    `  display_name: ${yamlQuote(displayName)}`,
    `  short_description: ${yamlQuote(shortDescription)}`,
    `  default_prompt: ${yamlQuote(`Use $${skillName} to help me with this task`)}`,
  ];

  if (ALLBEINGSFUTURE_ENV) {
    lines.push(
      "",
      "i18n:",
      "  zh:",
      '    name: "[TODO: Chinese skill name (2-6 chars)]"',
      '    description: "[TODO: Chinese description of the skill]"',
    );
  }

  const agentsDir = nodePath.join(skillDir, "agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  const outputPath = nodePath.join(agentsDir, "openai.yaml");
  fs.writeFileSync(outputPath, lines.join("\n") + "\n");
  console.log("[OK] Created agents/openai.yaml");
  return outputPath;
}

function parseResources(rawResources: string): string[] {
  if (!rawResources) return [];
  const resources = rawResources
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const invalid = resources.filter((r) => !ALLOWED_RESOURCES.has(r)).sort();
  if (invalid.length > 0) {
    const allowed = [...ALLOWED_RESOURCES].sort().join(", ");
    console.error(`[ERROR] Unknown resource type(s): ${invalid.join(", ")}`);
    console.error(`        Allowed: ${allowed}`);
    process.exit(1);
  }

  // Deduplicate preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const r of resources) {
    if (!seen.has(r)) {
      deduped.push(r);
      seen.add(r);
    }
  }
  return deduped;
}

function createResourceDirs(
  skillDir: string,
  skillName: string,
  skillTitle: string,
  resources: string[],
  includeExamples: boolean,
): void {
  for (const resource of resources) {
    const resourceDir = nodePath.join(skillDir, resource);
    fs.mkdirSync(resourceDir, { recursive: true });

    if (resource === "scripts") {
      if (includeExamples) {
        fs.writeFileSync(nodePath.join(resourceDir, "example.py"), EXAMPLE_SCRIPT(skillName));
        console.log("[OK] Created scripts/example.py");
      } else {
        console.log("[OK] Created scripts/");
      }
    } else if (resource === "references") {
      if (includeExamples) {
        fs.writeFileSync(
          nodePath.join(resourceDir, "api_reference.md"),
          EXAMPLE_REFERENCE(skillTitle),
        );
        console.log("[OK] Created references/api_reference.md");
      } else {
        console.log("[OK] Created references/");
      }
    } else if (resource === "assets") {
      if (includeExamples) {
        fs.writeFileSync(nodePath.join(resourceDir, "example_asset.txt"), EXAMPLE_ASSET);
        console.log("[OK] Created assets/example_asset.txt");
      } else {
        console.log("[OK] Created assets/");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

function initSkill(
  skillName: string,
  targetPath: string,
  resources: string[],
  includeExamples: boolean,
): string | null {
  const skillDir = nodePath.resolve(targetPath, skillName);

  if (fs.existsSync(skillDir)) {
    console.error(`[ERROR] Skill directory already exists: ${skillDir}`);
    return null;
  }

  try {
    fs.mkdirSync(skillDir, { recursive: true });
    console.log(`[OK] Created skill directory: ${skillDir}`);
  } catch (e) {
    console.error(`[ERROR] Error creating directory: ${(e as Error).message}`);
    return null;
  }

  const skillTitle = titleCaseSkillName(skillName);
  const skillContent = SKILL_TEMPLATE(skillName, skillTitle);

  const skillMdPath = nodePath.join(skillDir, "SKILL.md");
  try {
    fs.writeFileSync(skillMdPath, skillContent);
    console.log("[OK] Created SKILL.md");
  } catch (e) {
    console.error(`[ERROR] Error creating SKILL.md: ${(e as Error).message}`);
    return null;
  }

  try {
    writeOpenaiYaml(skillDir, skillName);
  } catch (e) {
    console.error(`[ERROR] Error creating agents/openai.yaml: ${(e as Error).message}`);
    return null;
  }

  if (resources.length > 0) {
    try {
      createResourceDirs(skillDir, skillName, skillTitle, resources, includeExamples);
    } catch (e) {
      console.error(`[ERROR] Error creating resource directories: ${(e as Error).message}`);
      return null;
    }
  }

  console.log(`\n[OK] Skill '${skillName}' initialized successfully at ${skillDir}`);
  console.log("\nNext steps:");
  console.log("1. Edit SKILL.md to complete the TODO items and update the description");
  console.log(
    "2. Update agents/openai.yaml with display metadata" +
      (ALLBEINGSFUTURE_ENV ? " and i18n" : ""),
  );
  if (resources.length > 0) {
    if (includeExamples) {
      console.log("3. Customize or delete the example files in resource directories");
    } else {
      console.log("3. Add resources to your resource directories as needed");
    }
  } else {
    console.log(
      "3. Create resource directories only if needed (scripts/, references/, assets/)",
    );
  }
  console.log("4. Run the validator when ready to check the skill structure");

  return skillDir;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  skillName: string;
  path: string;
  resources: string;
  examples: boolean;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = {
    skillName: "",
    path: "",
    resources: "",
    examples: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--path":
        result.path = args[++i];
        break;
      case "--resources":
        result.resources = args[++i];
        break;
      case "--examples":
        result.examples = true;
        break;
      default:
        if (!args[i].startsWith("-")) {
          positional.push(args[i]);
        }
    }
  }

  if (positional.length > 0) {
    result.skillName = positional[0];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseCliArgs(process.argv);

  if (!args.skillName || !args.path) {
    console.error(
      "Usage: npx tsx init_skill.ts <skill-name> --path <path> [--resources scripts,references,assets] [--examples]",
    );
    process.exit(1);
  }

  const rawSkillName = args.skillName;
  const skillName = normalizeSkillName(rawSkillName);

  if (!skillName) {
    console.error("[ERROR] Skill name must include at least one letter or digit.");
    process.exit(1);
  }
  if (skillName.length > MAX_SKILL_NAME_LENGTH) {
    console.error(
      `[ERROR] Skill name '${skillName}' is too long (${skillName.length} characters). ` +
        `Maximum is ${MAX_SKILL_NAME_LENGTH} characters.`,
    );
    process.exit(1);
  }
  if (skillName !== rawSkillName) {
    console.log(`Note: Normalized skill name from '${rawSkillName}' to '${skillName}'.`);
  }

  const resources = parseResources(args.resources);

  if (args.examples && resources.length === 0) {
    console.error("[ERROR] --examples requires --resources to be set.");
    process.exit(1);
  }

  console.log(`Initializing skill: ${skillName}`);
  console.log(`   Location: ${args.path}`);
  if (resources.length > 0) {
    console.log(`   Resources: ${resources.join(", ")}`);
    if (args.examples) {
      console.log("   Examples: enabled");
    }
  } else {
    console.log("   Resources: none (create as needed)");
  }
  console.log();

  const result = initSkill(skillName, args.path, resources, args.examples);
  process.exit(result ? 0 : 1);
}

main();
