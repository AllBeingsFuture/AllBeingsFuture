#!/usr/bin/env npx tsx
/**
 * Example: Capturing console logs during browser automation
 */

import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const url = process.argv[2] || "http://localhost:5173"; // Replace with your URL
const outputPath =
  process.argv[3] || path.join("/tmp", "console.log");

const consoleLogs: string[] = [];

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });

  // Set up console log capture
  page.on("console", (msg) => {
    const entry = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(entry);
    console.log(`Console: ${entry}`);
  });

  // Navigate to page
  await page.goto(url);
  await page.waitForLoadState("networkidle");

  // Interact with the page (triggers console logs)
  await page.click("text=Dashboard");
  await page.waitForTimeout(1000);

  await browser.close();

  // Save console logs to file
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, consoleLogs.join("\n"), "utf-8");

  console.log(`\nCaptured ${consoleLogs.length} console messages`);
  console.log(`Logs saved to: ${outputPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
