#!/usr/bin/env npx tsx
/**
 * image-understanding - Enable AI to understand and analyze images using vision API
 *
 * This script allows users to analyze images by calling vision API (like OpenAI GPT-4 Vision).
 * It can describe image content, extract text, identify objects, and answer questions about images.
 *
 * Usage:
 *   npx tsx main.ts --image path/to/image.jpg
 *   npx tsx main.ts --image https://example.com/image.png --custom-prompt "What objects are in this image?"
 *   npx tsx main.ts --image ./screenshot.png --extract-text
 */

import * as fs from "fs";
import * as path from "path";

function validateImagePath(imagePath: string): string {
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    const lower = imagePath.toLowerCase();
    if (
      ![".png", ".jpg", ".jpeg", ".gif", ".webp"].some((ext) =>
        lower.endsWith(ext)
      )
    ) {
      throw new Error(`Invalid image URL format: ${imagePath}`);
    }
    return imagePath;
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const stat = fs.statSync(imagePath);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${imagePath}`);
  }

  const validExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
  const ext = path.extname(imagePath).toLowerCase();
  if (!validExtensions.has(ext)) {
    throw new Error(
      `Invalid image format: ${ext}. Supported formats: ${[...validExtensions].join(", ")}`
    );
  }

  return path.resolve(imagePath);
}

function encodeImage(imagePath: string): string {
  const data = fs.readFileSync(imagePath);
  return data.toString("base64");
}

interface ApiResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

async function callVisionApi(
  apiKey: string,
  imagePath: string,
  prompt: string,
  model: string
): Promise<ApiResponse> {
  let imageContent: Record<string, unknown>;

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    imageContent = {
      type: "image_url",
      image_url: { url: imagePath },
    };
  } else {
    const base64Image = encodeImage(imagePath);
    imageContent = {
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${base64Image}`,
      },
    };
  }

  const messages = [
    {
      role: "user",
      content: [{ type: "text", text: prompt }, imageContent],
    },
  ];

  const payload = {
    model,
    messages,
    max_tokens: 1000,
  };

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    let errorMsg = `API request failed: ${text}`;
    try {
      const errorData = JSON.parse(text);
      if (errorData.error) {
        errorMsg = `API error: ${errorData.error.message || JSON.stringify(errorData)}`;
      }
    } catch {
      // ignore parse error
    }
    throw new Error(errorMsg);
  }

  return (await response.json()) as ApiResponse;
}

interface AnalysisResult {
  success: boolean;
  image_path: string;
  model: string;
  analysis: {
    description: string | null;
    extracted_text: string | null;
    objects: string | null;
    full_response: string;
  };
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function analyzeImage(
  apiKey: string,
  imagePath: string,
  customPrompt?: string,
  describe: boolean = true,
  extractTextFlag: boolean = false,
  identifyObjectsFlag: boolean = false,
  model: string = "gpt-4-vision-preview"
): Promise<AnalysisResult> {
  const analysisTasks: string[] = [];

  if (describe) {
    analysisTasks.push(
      "Describe the image in detail, including objects, people, scenes, colors, and overall composition"
    );
  }
  if (extractTextFlag) {
    analysisTasks.push("Extract all visible text from the image (OCR)");
  }
  if (identifyObjectsFlag) {
    analysisTasks.push(
      "Identify and list all recognizable objects, people, and elements in the image"
    );
  }

  let prompt: string;
  if (customPrompt) {
    prompt = customPrompt;
  } else if (analysisTasks.length > 0) {
    prompt = `Please analyze this image and provide the following information:
${analysisTasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Please format your response as a structured analysis with clear sections.`;
  } else {
    prompt =
      "Provide a comprehensive description of this image, including all visible objects, people, scenes, text, and any notable details.";
  }

  const response = await callVisionApi(apiKey, imagePath, prompt, model);

  const content =
    response.choices?.[0]?.message?.content || "";
  const usage = response.usage || {};

  return {
    success: true,
    image_path: imagePath,
    model,
    analysis: {
      description: describe ? content : null,
      extracted_text: extractTextFlag ? content : null,
      objects: identifyObjectsFlag ? content : null,
      full_response: content,
    },
    usage: {
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
    },
  };
}

interface ParsedArgs {
  image: string;
  apiKey?: string;
  model: string;
  customPrompt?: string;
  describe: boolean;
  extractText: boolean;
  identifyObjects: boolean;
  compact: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const parsed: ParsedArgs = {
    image: "",
    model: "gpt-4-vision-preview",
    describe: true,
    extractText: false,
    identifyObjects: false,
    compact: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--image":
        parsed.image = args[++i];
        break;
      case "--api-key":
        parsed.apiKey = args[++i];
        break;
      case "--model":
        parsed.model = args[++i];
        break;
      case "--custom-prompt":
      case "-p":
        parsed.customPrompt = args[++i];
        break;
      case "--describe":
        parsed.describe = true;
        break;
      case "--extract-text":
        parsed.extractText = true;
        parsed.describe = false;
        break;
      case "--identify-objects":
        parsed.identifyObjects = true;
        parsed.describe = false;
        break;
      case "--compact":
        parsed.compact = true;
        break;
      case "-h":
      case "--help":
        console.log(`Analyze images using AI vision capabilities (OpenAI GPT-4 Vision)

Usage:
  npx tsx main.ts --image photo.jpg
  npx tsx main.ts --image screenshot.png --extract-text
  npx tsx main.ts --image photo.jpg --identify-objects
  npx tsx main.ts --image photo.jpg -p "What brand is this product?"
  npx tsx main.ts --image "https://example.com/photo.jpg" --describe

Options:
  --image              Path to local image file or URL of image (required)
  --api-key            OpenAI API key (or set OPENAI_API_KEY env var)
  --model              Model to use (default: gpt-4-vision-preview)
  --custom-prompt, -p  Custom prompt for image analysis
  --describe           Describe the image content (default)
  --extract-text       Extract text from the image (OCR)
  --identify-objects   Identify and list objects in the image
  --compact            Output compact JSON

Environment Variables:
  OPENAI_API_KEY       Your OpenAI API key`);
        process.exit(0);
    }
  }

  if (!parsed.image) {
    console.error("Error: --image is required");
    process.exit(1);
  }

  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs();

  // Get API key
  const apiKey = args.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const errorResult = {
      success: false,
      error: {
        type: "validation_error",
        message:
          "API key not provided. Use --api-key or set OPENAI_API_KEY environment variable",
      },
    };
    console.log(JSON.stringify(errorResult, null, 2));
    process.exit(2);
  }

  try {
    const imagePath = validateImagePath(args.image);

    const describe = !(
      args.extractText ||
      args.identifyObjects ||
      args.customPrompt
    );

    const result = await analyzeImage(
      apiKey,
      imagePath,
      args.customPrompt,
      describe,
      args.extractText,
      args.identifyObjects,
      args.model
    );

    const indent = args.compact ? undefined : 2;
    console.log(JSON.stringify(result, null, indent));
    process.exit(0);
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes("not found") ||
        e.message.includes("not a file") ||
        e.message.includes("Invalid image"))
    ) {
      const errorResult = {
        success: false,
        error: {
          type: "validation_error",
          message: e.message,
        },
      };
      console.log(JSON.stringify(errorResult, null, 2));
      process.exit(2);
    } else {
      const errorResult = {
        success: false,
        error: {
          type: "execution_error",
          message: e instanceof Error ? e.message : String(e),
        },
      };
      console.log(JSON.stringify(errorResult, null, 2));
      process.exit(1);
    }
  }
}

main();
