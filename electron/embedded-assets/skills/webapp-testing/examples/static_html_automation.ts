#!/usr/bin/env npx tsx
/**
 * Example: Automating interaction with static HTML files using file:// URLs
 */

import { chromium } from "playwright";
import * as path from "path";

const htmlFilePath = process.argv[2] || path.resolve("path/to/your/file.html");
const outputDir = process.argv[3] || "/tmp";
const fileUrl = `file://${htmlFilePath}`;

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });

  // Navigate to local HTML file
  await page.goto(fileUrl);

  // Take screenshot
  await page.screenshot({
    path: path.join(outputDir, "static_page.png"),
    fullPage: true,
  });

  // Interact with elements
  await page.click("text=Click Me");
  await page.fill("#name", "John Doe");
  await page.fill("#email", "john@example.com");

  // Submit form
  await page.click('button[type="submit"]');
  await page.waitForTimeout(500);

  // Take final screenshot
  await page.screenshot({
    path: path.join(outputDir, "after_submit.png"),
    fullPage: true,
  });

  await browser.close();

  console.log("Static HTML automation completed!");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
