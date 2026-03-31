#!/usr/bin/env npx tsx
/**
 * Example: Discovering buttons and other elements on a page
 */

import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173";
const screenshotPath = process.argv[3] || "/tmp/page_discovery.png";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Navigate to page and wait for it to fully load
  await page.goto(url);
  await page.waitForLoadState("networkidle");

  // Discover all buttons on the page
  const buttons = await page.locator("button").all();
  console.log(`Found ${buttons.length} buttons:`);
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    const visible = await button.isVisible();
    const text = visible ? await button.innerText() : "[hidden]";
    console.log(`  [${i}] ${text}`);
  }

  // Discover links
  const links = await page.locator("a[href]").all();
  console.log(`\nFound ${links.length} links:`);
  const linksToShow = links.slice(0, 5); // Show first 5
  for (const link of linksToShow) {
    const text = (await link.innerText()).trim();
    const href = await link.getAttribute("href");
    console.log(`  - ${text} -> ${href}`);
  }

  // Discover input fields
  const inputs = await page.locator("input, textarea, select").all();
  console.log(`\nFound ${inputs.length} input fields:`);
  for (const inputElem of inputs) {
    const name =
      (await inputElem.getAttribute("name")) ||
      (await inputElem.getAttribute("id")) ||
      "[unnamed]";
    const inputType =
      (await inputElem.getAttribute("type")) || "text";
    console.log(`  - ${name} (${inputType})`);
  }

  // Take screenshot for visual reference
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`\nScreenshot saved to ${screenshotPath}`);

  await browser.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
