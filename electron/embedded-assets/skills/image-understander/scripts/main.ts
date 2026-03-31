#!/usr/bin/env npx tsx
/**
 * Image Understanding Main Entry Script
 * Supports image description, OCR text extraction, object identification, image Q&A
 */

import * as fs from "fs";
import * as path from "path";
import { ImageUnderstander } from "./image_understander";

interface ParsedArgs {
  image: string;
  mode: "describe" | "ocr" | "objects" | "qa";
  apiKey?: string;
  prompt: string;
  output?: string;
  verbose: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const parsed: ParsedArgs = {
    image: "",
    mode: "describe",
    prompt: "Please describe this image in detail",
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "-i":
      case "--image":
        parsed.image = args[++i];
        break;
      case "-m":
      case "--mode":
        parsed.mode = args[++i] as ParsedArgs["mode"];
        break;
      case "-a":
      case "--api-key":
        parsed.apiKey = args[++i];
        break;
      case "-q":
      case "--prompt":
        parsed.prompt = args[++i];
        break;
      case "-o":
      case "--output":
        parsed.output = args[++i];
        break;
      case "-v":
      case "--verbose":
        parsed.verbose = true;
        break;
      case "-h":
      case "--help":
        console.log(`Image Understanding Tool - Based on OpenAI GPT-4 Vision

Usage:
  npx tsx main.ts -i photo.jpg -m describe
  npx tsx main.ts -i screenshot.png -m ocr
  npx tsx main.ts -i photo.jpg -m objects
  npx tsx main.ts -i photo.jpg -m qa -q "What is in this image?"

Options:
  -i, --image     Image path (required)
  -m, --mode      Understanding mode: describe, ocr, objects, qa (default: describe)
  -a, --api-key   OpenAI API Key
  -q, --prompt    Question for Q&A mode (default: Please describe this image in detail)
  -o, --output    Output file path (JSON format)
  -v, --verbose   Verbose output
  -h, --help      Show help`);
        process.exit(0);
    }
  }

  if (!parsed.image) {
    console.error("Error: Image path is required. Use -i <image_path>");
    process.exit(1);
  }

  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs();

  // Check image file
  if (!fs.existsSync(args.image)) {
    console.error(`Error: Image file does not exist: ${args.image}`);
    process.exit(1);
  }

  // Get API Key
  const apiKey = args.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Error: Please set OpenAI API Key");
    console.error("  Usage:");
    console.error("  1. Environment variable: set OPENAI_API_KEY=sk-your-key");
    console.error(
      "  2. Command line argument: npx tsx main.ts -a sk-your-key -i photo.jpg"
    );
    process.exit(1);
  }

  // Initialize understander
  const understander = new ImageUnderstander(apiKey, args.verbose);

  // Run based on mode
  console.log(`Analyzing image: ${args.image}`);
  console.log(`Mode: ${args.mode}`);
  console.log("-".repeat(50));

  let result: string;
  switch (args.mode) {
    case "describe":
      result = await understander.describe(args.image);
      console.log(result);
      break;
    case "ocr":
      result = await understander.extractText(args.image);
      console.log(result);
      break;
    case "objects":
      result = await understander.identifyObjects(args.image);
      console.log(result);
      break;
    case "qa":
      result = await understander.answerQuestion(args.image, args.prompt);
      console.log(result);
      break;
    default:
      console.error(`Unknown mode: ${args.mode}`);
      process.exit(1);
  }

  // Save results
  if (args.output) {
    const outputData = {
      mode: args.mode,
      image: args.image,
      result,
    };
    fs.writeFileSync(args.output, JSON.stringify(outputData, null, 2), "utf-8");
    console.log(`\nResults saved to: ${args.output}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
