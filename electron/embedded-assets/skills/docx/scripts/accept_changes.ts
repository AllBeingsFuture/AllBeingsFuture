/**
 * Accept all tracked changes in a DOCX file using LibreOffice.
 *
 * Requires LibreOffice (soffice) to be installed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import * as os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIBREOFFICE_PROFILE =
  os.platform() === "win32"
    ? path.join(os.tmpdir(), "libreoffice_docx_profile")
    : "/tmp/libreoffice_docx_profile";

const MACRO_DIR = path.join(LIBREOFFICE_PROFILE, "user", "basic", "Standard");

const ACCEPT_CHANGES_MACRO = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">
<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" script:language="StarBasic">
    Sub AcceptAllTrackedChanges()
        Dim document As Object
        Dim dispatcher As Object

        document = ThisComponent.CurrentController.Frame
        dispatcher = createUnoService("com.sun.star.frame.DispatchHelper")

        dispatcher.executeDispatch(document, ".uno:AcceptAllTrackedChanges", "", 0, Array())
        ThisComponent.store()
        ThisComponent.close(True)
    End Sub
</script:module>`;

function getSofficeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  env["SAL_USE_VCLPLUGIN"] = "svp";
  return env;
}

function setupLibreofficeMacro(): boolean {
  const macroFile = path.join(MACRO_DIR, "Module1.xba");

  if (
    fs.existsSync(macroFile) &&
    fs.readFileSync(macroFile, "utf-8").includes("AcceptAllTrackedChanges")
  ) {
    return true;
  }

  if (!fs.existsSync(MACRO_DIR)) {
    try {
      const profileUri =
        os.platform() === "win32"
          ? `file:///${LIBREOFFICE_PROFILE.replace(/\\/g, "/")}`
          : `file://${LIBREOFFICE_PROFILE}`;
      execFileSync(
        "soffice",
        [
          "--headless",
          `-env:UserInstallation=${profileUri}`,
          "--terminate_after_init",
        ],
        {
          timeout: 10000,
          stdio: "pipe",
          env: getSofficeEnv(),
        }
      );
    } catch {
      // Ignore errors during profile initialization
    }
    fs.mkdirSync(MACRO_DIR, { recursive: true });
  }

  try {
    fs.writeFileSync(macroFile, ACCEPT_CHANGES_MACRO, "utf-8");
    return true;
  } catch (e) {
    console.error(`Failed to setup LibreOffice macro: ${e}`);
    return false;
  }
}

export function acceptChanges(
  inputFile: string,
  outputFile: string
): [null, string] {
  const inputPath = path.resolve(inputFile);
  const outputPath = path.resolve(outputFile);

  if (!fs.existsSync(inputPath)) {
    return [null, `Error: Input file not found: ${inputFile}`];
  }

  if (!inputPath.toLowerCase().endsWith(".docx")) {
    return [null, `Error: Input file is not a DOCX file: ${inputFile}`];
  }

  try {
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.copyFileSync(inputPath, outputPath);
  } catch (e) {
    return [
      null,
      `Error: Failed to copy input file to output location: ${e}`,
    ];
  }

  if (!setupLibreofficeMacro()) {
    return [null, "Error: Failed to setup LibreOffice macro"];
  }

  const profileUri =
    os.platform() === "win32"
      ? `file:///${LIBREOFFICE_PROFILE.replace(/\\/g, "/")}`
      : `file://${LIBREOFFICE_PROFILE}`;

  const cmd = [
    "soffice",
    "--headless",
    `-env:UserInstallation=${profileUri}`,
    "--norestore",
    "vnd.sun.star.script:Standard.Module1.AcceptAllTrackedChanges?language=Basic&location=application",
    outputPath,
  ];

  try {
    execFileSync(cmd[0], cmd.slice(1), {
      timeout: 30000,
      stdio: "pipe",
      env: getSofficeEnv(),
    });
  } catch (e: any) {
    // TimeoutExpired equivalent: timeout kills the process but changes may have been applied
    if (e.killed || (e.code && e.code === "ETIMEDOUT")) {
      return [
        null,
        `Successfully accepted all tracked changes: ${inputFile} -> ${outputFile}`,
      ];
    }
    // Check exit code
    if (e.status && e.status !== 0) {
      const stderr = e.stderr ? e.stderr.toString() : "unknown error";
      return [null, `Error: LibreOffice failed: ${stderr}`];
    }
  }

  return [
    null,
    `Successfully accepted all tracked changes: ${inputFile} -> ${outputFile}`,
  ];
}

function parseArgs(argv: string[]): {
  inputFile: string;
  outputFile: string;
} {
  const args = argv.slice(2);

  if (
    args.length < 2 ||
    args.includes("--help") ||
    args.includes("-h")
  ) {
    console.log(
      "Usage: npx tsx accept_changes.ts <input_file> <output_file>"
    );
    console.log(
      "\nAccept all tracked changes in a DOCX file using LibreOffice."
    );
    process.exit(args.includes("--help") || args.includes("-h") ? 0 : 1);
  }

  return {
    inputFile: args[0],
    outputFile: args[1],
  };
}

// CLI entry point - only run when executed directly
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  const parsed = parseArgs(process.argv);
  const [, message] = acceptChanges(parsed.inputFile, parsed.outputFile);
  console.log(message);

  if (message.includes("Error")) {
    process.exit(1);
  }
}
