#!/usr/bin/env npx tsx
/**
 * Image Understanding using Dashscope (Qwen Vision Models)
 *
 * This script enables AI to understand and analyze images using Dashscope's
 * vision API models (qwen-vl-plus, qwen-vl-max).
 *
 * Usage:
 *   npx tsx image_understanding.ts --image path/to/image.jpg
 *   npx tsx image_understanding.ts --image https://example.com/image.png --custom-prompt "What is in the image?"
 *   npx tsx image_understanding.ts --image ./screenshot.png --extract-text
 */

import * as fs from "fs";
import * as path from "path";

// Dashscope configuration
const DASHSCOPE_API_BASE =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-vl-plus";

function validateImagePath(imagePath: string): string {
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    const lower = imagePath.toLowerCase();
    if (
      ![".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].some((ext) =>
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

  const validExtensions = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
  ]);
  const ext = path.extname(imagePath).toLowerCase();
  if (!validExtensions.has(ext)) {
    throw new Error(
      `Invalid image format: ${ext}. Supported: ${[...validExtensions].join(", ")}`
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
  error?: {
    message?: string;
  };
}

async function callDashscopeApi(
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
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = "image/jpeg";
    if (ext === ".png") mimeType = "image/png";
    else if (ext === ".gif") mimeType = "image/gif";
    else if (ext === ".webp") mimeType = "image/webp";

    imageContent = {
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64Image}`,
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
    max_tokens: 1500,
    temperature: 0.1,
  };

  const response = await fetch(`${DASHSCOPE_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  });

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
  api_provider: string;
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
  model: string = DEFAULT_MODEL
): Promise<AnalysisResult> {
  let prompt: string;

  if (customPrompt) {
    prompt = customPrompt;
  } else {
    const tasks: string[] = [];
    if (describe) {
      tasks.push(
        "Describe this image in detail, including objects, people, scene, colors, and overall composition"
      );
    }
    if (extractTextFlag) {
      tasks.push("Extract all visible text from the image (OCR)");
    }
    if (identifyObjectsFlag) {
      tasks.push(
        "Identify and list all recognizable objects, people, and elements in the image"
      );
    }

    if (tasks.length > 0) {
      prompt = `Please analyze this image and provide the following information:\n${tasks.join(";\n")}\n\nPlease answer in clearly separated paragraphs.`;
    } else {
      prompt =
        "Please provide a comprehensive detailed description of this image, including all visible objects, people, scenes, text, and any notable details.";
    }
  }

  const response = await callDashscopeApi(apiKey, imagePath, prompt, model);

  const content =
    response.choices?.[0]?.message?.content || "";
  const usage = response.usage || {};

  return {
    success: true,
    image_path: imagePath,
    model,
    api_provider: "dashscope",
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
    model: DEFAULT_MODEL,
    describe: true,
    extractText: false,
    identifyObjects: false,
    compact: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--image":
      case "-i":
        parsed.image = args[++i];
        break;
      case "--api-key":
        parsed.apiKey = args[++i];
        break;
      case "--model":
      case "-m":
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
      case "-e":
        parsed.extractText = true;
        parsed.describe = false;
        break;
      case "--identify-objects":
      case "-o":
        parsed.identifyObjects = true;
        parsed.describe = false;
        break;
      case "--compact":
        parsed.compact = true;
        break;
      case "-h":
      case "--help":
        console.log(`Image Understanding using Dashscope (Qwen Vision Models)

Usage:
  npx tsx image_understanding.ts --image photo.jpg
  npx tsx image_understanding.ts --image screenshot.png --extract-text
  npx tsx image_understanding.ts --image photo.jpg --identify-objects
  npx tsx image_understanding.ts --image photo.jpg -p "How much does this product cost?"
  npx tsx image_understanding.ts --image photo.jpg --model qwen-vl-max

Options:
  --image, -i             Local image path or image URL (required)
  --api-key               Dashscope API key (or set DASHSCOPE_API_KEY env var)
  --model, -m             Model to use: qwen-vl-plus, qwen-vl-max (default: ${DEFAULT_MODEL})
  --custom-prompt, -p     Custom analysis prompt
  --describe              Describe image content (default)
  --extract-text, -e      Extract text from image (OCR)
  --identify-objects, -o  Identify objects in image
  --compact               Output compact JSON

Environment Variables:
  DASHSCOPE_API_KEY       Your Dashscope API key
  OPENAI_API_KEY          Also supported (compatibility)`);
        process.exit(0);
    }
  }

  if (!parsed.image) {
    console.error("Error: --image is required");
    process.exit(1);
  }

  return parsed;
}

async function execute(
  args: ParsedArgs
): Promise<AnalysisResult> {
  const apiKey =
    args.apiKey ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "API key not provided. Use --api-key or set DASHSCOPE_API_KEY environment variable"
    );
  }

  const imagePath = validateImagePath(args.image);

  const describe = !(
    args.extractText ||
    args.identifyObjects ||
    args.customPrompt
  );

  return analyzeImage(
    apiKey,
    imagePath,
    args.customPrompt,
    describe,
    args.extractText,
    args.identifyObjects,
    args.model
  );
}

async function main(): Promise<void> {
  const args = parseArgs();

  try {
    const result = await execute(args);
    const indent = args.compact ? undefined : 2;
    console.log(JSON.stringify(result, null, indent));
    process.exit(0);
  } catch (e) {
    if (e instanceof Error && e.message.includes("not provided")) {
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
