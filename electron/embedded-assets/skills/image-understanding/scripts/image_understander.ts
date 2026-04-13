#!/usr/bin/env npx tsx
/**
 * Image Understanding Module - Uses Dashscope Qwen-VL model
 */

import * as fs from "fs";

// Configuration
const API_KEY = process.env.DASHSCOPE_API_KEY || "";
const BASE_URL =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

function encodeImage(imagePath: string): string {
  const data = fs.readFileSync(imagePath);
  return data.toString("base64");
}

interface DashscopeResponse {
  output?: {
    choices?: Array<{
      message: {
        content: string;
      };
    }>;
  };
  [key: string]: unknown;
}

async function callDashscope(
  messages: Array<Record<string, unknown>>,
  model: string = "qwen-vl-plus",
  maxTokens: number = 1000
): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };

  const payload = {
    model,
    input: {
      messages,
    },
    parameters: {
      max_tokens: maxTokens,
    },
  };

  const response = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const result = (await response.json()) as DashscopeResponse;

  if (result.output?.choices?.[0]?.message?.content) {
    return result.output.choices[0].message.content;
  }
  return `Error: ${JSON.stringify(result, null, 2)}`;
}

export async function describeImage(
  imagePath: string,
  model: string = "qwen-vl-plus"
): Promise<string> {
  const imageB64 = encodeImage(imagePath);

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Please describe this image in detail, including the scene, people, objects, colors, and all details.",
        },
        {
          type: "image",
          image: `data:image/jpeg;base64,${imageB64}`,
        },
      ],
    },
  ];

  return callDashscope(messages, model, 1000);
}

export async function extractText(
  imagePath: string,
  model: string = "qwen-vl-plus"
): Promise<string> {
  const imageB64 = encodeImage(imagePath);

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Please extract all text from this image, keeping the original format. Do not omit anything.",
        },
        {
          type: "image",
          image: `data:image/jpeg;base64,${imageB64}`,
        },
      ],
    },
  ];

  return callDashscope(messages, model, 2000);
}

export async function identifyObjects(
  imagePath: string,
  model: string = "qwen-vl-plus"
): Promise<string> {
  const imageB64 = encodeImage(imagePath);

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Please list all objects, people, and elements in this image in a clear list format.",
        },
        {
          type: "image",
          image: `data:image/jpeg;base64,${imageB64}`,
        },
      ],
    },
  ];

  return callDashscope(messages, model, 500);
}

export async function answerQuestion(
  imagePath: string,
  question: string,
  model: string = "qwen-vl-plus"
): Promise<string> {
  const imageB64 = encodeImage(imagePath);

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: question,
        },
        {
          type: "image",
          image: `data:image/jpeg;base64,${imageB64}`,
        },
      ],
    },
  ];

  return callDashscope(messages, model, 500);
}

// CLI entry point
if (require.main === module) {
  if (!API_KEY) {
    console.error("Error: Please set DASHSCOPE_API_KEY environment variable");
    process.exit(1);
  }

  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage:");
    console.log(
      "  npx tsx image_understander.ts -i <image_path> -m describe   # Describe image"
    );
    console.log(
      "  npx tsx image_understander.ts -i <image_path> -m ocr        # Extract text"
    );
    console.log(
      "  npx tsx image_understander.ts -i <image_path> -m objects    # Identify objects"
    );
    console.log(
      "  npx tsx image_understander.ts -i <image_path> -m qa -q 'question'  # Image Q&A"
    );
    process.exit(1);
  }

  // Simple arg parsing
  let imagePath = "";
  let mode = "describe";
  let question: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-i" && i + 1 < args.length) {
      imagePath = args[++i];
    } else if (args[i] === "-m" && i + 1 < args.length) {
      mode = args[++i];
    } else if (args[i] === "-q" && i + 1 < args.length) {
      question = args[++i];
    }
  }

  (async () => {
    try {
      switch (mode) {
        case "describe":
          console.log(await describeImage(imagePath));
          break;
        case "ocr":
          console.log(await extractText(imagePath));
          break;
        case "objects":
          console.log(await identifyObjects(imagePath));
          break;
        case "qa":
          if (question) {
            console.log(await answerQuestion(imagePath, question));
          } else {
            console.error("Error: Please use -q to specify a question");
          }
          break;
        default:
          console.error(`Unknown mode: ${mode}`);
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  })();
}
