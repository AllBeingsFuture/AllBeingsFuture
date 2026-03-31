#!/usr/bin/env npx tsx
/**
 * Excel Formula Recalculation Script
 * Recalculates all formulas in an Excel file using LibreOffice
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import ExcelJS from "exceljs";

function setupLibreofficeMacro(): boolean {
  const isMac = process.platform === "darwin";
  const macroDir = isMac
    ? path.join(
        os.homedir(),
        "Library/Application Support/LibreOffice/4/user/basic/Standard"
      )
    : path.join(
        os.homedir(),
        ".config/libreoffice/4/user/basic/Standard"
      );

  const macroFile = path.join(macroDir, "Module1.xba");

  if (fs.existsSync(macroFile)) {
    const content = fs.readFileSync(macroFile, "utf-8");
    if (content.includes("RecalculateAndSave")) {
      return true;
    }
  }

  if (!fs.existsSync(macroDir)) {
    try {
      spawnSync("soffice", ["--headless", "--terminate_after_init"], {
        stdio: "pipe",
        timeout: 10000,
      });
    } catch {
      // ignore
    }
    fs.mkdirSync(macroDir, { recursive: true });
  }

  const macroContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">
<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" script:language="StarBasic">
    Sub RecalculateAndSave()
      ThisComponent.calculateAll()
      ThisComponent.store()
      ThisComponent.close(True)
    End Sub
</script:module>`;

  try {
    fs.writeFileSync(macroFile, macroContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function recalc(
  filename: string,
  timeout: number = 30
): Promise<Record<string, unknown>> {
  if (!fs.existsSync(filename)) {
    return { error: `File ${filename} does not exist` };
  }

  const absPath = path.resolve(filename);

  if (!setupLibreofficeMacro()) {
    return { error: "Failed to setup LibreOffice macro" };
  }

  const cmd = [
    "soffice",
    "--headless",
    "--norestore",
    "vnd.sun.star.script:Standard.Module1.RecalculateAndSave?language=Basic&location=application",
    absPath,
  ];

  // Handle timeout command differences between Linux and macOS
  if (process.platform !== "win32") {
    if (process.platform === "linux") {
      cmd.unshift("timeout", String(timeout));
    } else if (process.platform === "darwin") {
      try {
        spawnSync("gtimeout", ["--version"], { stdio: "pipe", timeout: 1000 });
        cmd.unshift("gtimeout", String(timeout));
      } catch {
        // gtimeout not available
      }
    }
  }

  const spawnResult = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (spawnResult.status !== 0 && spawnResult.status !== 124) {
    const errorMsg =
      spawnResult.stderr || "Unknown error during recalculation";
    if (
      errorMsg.includes("Module1") ||
      !errorMsg.includes("RecalculateAndSave")
    ) {
      return { error: "LibreOffice macro not configured properly" };
    }
    return { error: errorMsg };
  }

  // Check for Excel errors in the recalculated file
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filename);

    const excelErrors = [
      "#VALUE!",
      "#DIV/0!",
      "#REF!",
      "#NAME?",
      "#NULL!",
      "#NUM!",
      "#N/A",
    ];
    const errorDetails: Record<string, string[]> = {};
    for (const err of excelErrors) {
      errorDetails[err] = [];
    }
    let totalErrors = 0;

    for (const worksheet of wb.worksheets) {
      const sheetName = worksheet.name;
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell, colNumber) => {
          const value = cell.value;
          if (value !== null && value !== undefined && typeof value === "string") {
            for (const err of excelErrors) {
              if (value.includes(err)) {
                const colLetter = columnToLetter(colNumber);
                const location = `${sheetName}!${colLetter}${rowNumber}`;
                errorDetails[err].push(location);
                totalErrors++;
                break;
              }
            }
          }
        });
      });
    }

    const result: Record<string, unknown> = {
      status: totalErrors === 0 ? "success" : "errors_found",
      total_errors: totalErrors,
      error_summary: {} as Record<string, unknown>,
    };

    const errorSummary: Record<string, unknown> = {};
    for (const [errType, locations] of Object.entries(errorDetails)) {
      if (locations.length > 0) {
        errorSummary[errType] = {
          count: locations.length,
          locations: locations.slice(0, 20),
        };
      }
    }
    result.error_summary = errorSummary;

    // Count formulas
    const wbFormulas = new ExcelJS.Workbook();
    await wbFormulas.xlsx.readFile(filename);
    let formulaCount = 0;
    for (const worksheet of wbFormulas.worksheets) {
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          const value = cell.value;
          if (value && typeof value === "object" && "formula" in value) {
            formulaCount++;
          } else if (
            typeof value === "string" &&
            value.startsWith("=")
          ) {
            formulaCount++;
          }
        });
      });
    }

    result.total_formulas = formulaCount;
    return result;
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function columnToLetter(col: number): string {
  let letter = "";
  let temp = col;
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log("Usage: npx tsx recalc.ts <excel_file> [timeout_seconds]");
    console.log(
      "\nRecalculates all formulas in an Excel file using LibreOffice"
    );
    console.log("\nReturns JSON with error details:");
    console.log("  - status: 'success' or 'errors_found'");
    console.log("  - total_errors: Total number of Excel errors found");
    console.log("  - total_formulas: Number of formulas in the file");
    console.log("  - error_summary: Breakdown by error type with locations");
    console.log("    - #VALUE!, #DIV/0!, #REF!, #NAME?, #NULL!, #NUM!, #N/A");
    process.exit(1);
  }

  const filename = args[0];
  const timeout = args[1] ? parseInt(args[1], 10) : 30;

  const result = await recalc(filename, timeout);
  console.log(JSON.stringify(result, null, 2));
}

main();
