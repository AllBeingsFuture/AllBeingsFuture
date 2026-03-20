#!/usr/bin/env npx tsx
/**
 * Image Understanding Core Module
 * Based on OpenAI GPT-4 Vision API for image understanding
 */

import * as fs from "fs";

export class ImageUnderstander {
  private apiKey: string;
  private verbose: boolean;
  private apiUrl: string = "https://api.openai.com/v1/chat/completions";

  constructor(apiKey: string, verbose: boolean = false) {
    this.apiKey = apiKey;
    this.verbose = verbose;
  }

  private encodeImage(imagePath: string): string {
    const data = fs.readFileSync(imagePath);
    return data.toString("base64");
  }

  private async callApi(
    messages: Array<Record<string, unknown>>,
    maxTokens: number = 2000
  ): Promise<string> {
    if (this.verbose) {
      console.log("Calling OpenAI API...");
    }

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API call failed: ${response.status} - ${text}`);
    }

    const result = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return result.choices[0].message.content;
  }

  async describe(imagePath: string): Promise<string> {
    if (this.verbose) {
      console.log("Describing image...");
    }

    const base64Image = this.encodeImage(imagePath);

    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please describe this image in detail, including: scene, people, objects, colors, atmosphere, and all visible elements.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ];

    return this.callApi(messages);
  }

  async extractText(imagePath: string): Promise<string> {
    if (this.verbose) {
      console.log("Extracting text...");
    }

    const base64Image = this.encodeImage(imagePath);

    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please extract all text from this image, including titles, body text, labels, logo text, etc. If there is handwriting, try to recognize it. If the image has no text, please clearly state that.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ];

    return this.callApi(messages, 3000);
  }

  async identifyObjects(imagePath: string): Promise<string> {
    if (this.verbose) {
      console.log("Identifying objects...");
    }

    const base64Image = this.encodeImage(imagePath);

    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please identify all objects and elements in this image and list them. Please output in list format, with a short description for each object.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ];

    return this.callApi(messages);
  }

  async answerQuestion(imagePath: string, question: string): Promise<string> {
    if (this.verbose) {
      console.log(`Answering question: ${question}`);
    }

    const base64Image = this.encodeImage(imagePath);

    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Please answer this question based on the image content: ${question}`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ];

    return this.callApi(messages);
  }

  async analyze(
    imagePath: string,
    analysisType: string = "comprehensive"
  ): Promise<Record<string, unknown>> {
    if (this.verbose) {
      console.log(`Performing ${analysisType} analysis...`);
    }

    const base64Image = this.encodeImage(imagePath);

    let prompt: string;
    if (analysisType === "comprehensive") {
      prompt = `Please provide a comprehensive analysis of this image, including:
1. [Scene Description] What is the overall scene?
2. [Main Objects] List main objects and their positions
3. [Text Content] Extract all visible text
4. [Color & Mood] Main color tones and atmosphere
5. [Inferred Info] Infer possible theme/purpose from content

Please return in JSON format:
{
  "description": "scene description",
  "objects": ["object1", "object2", ...],
  "text": "extracted text",
  "colors": "main colors",
  "mood": "atmosphere description",
  "inference": "possible theme/purpose"
}`;
    } else if (analysisType === "quick") {
      prompt =
        "Please briefly describe what this image is in one sentence.";
    } else {
      prompt = `Please provide a deep analysis of this image, including:
- Detailed scene description
- Precise position and characteristics of each object
- Overall composition and visual hierarchy
- Possible implied meanings or symbolism
- Image quality and technical characteristics

Please answer in detail.`;
    }

    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt.trim(),
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ];

    const resultText = await this.callApi(messages, 3000);

    // Try to parse JSON from the response
    try {
      const startIdx = resultText.indexOf("{");
      const endIdx = resultText.lastIndexOf("}");
      if (startIdx !== -1 && endIdx !== -1) {
        const jsonStr = resultText.substring(startIdx, endIdx + 1);
        return JSON.parse(jsonStr);
      }
    } catch {
      // Not valid JSON, return raw text
    }

    return {
      result: resultText,
      raw_format: true,
    };
  }
}

// CLI entry point
if (require.main === module) {
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Error: Please set OPENAI_API_KEY environment variable");
    process.exit(1);
  }

  const understander = new ImageUnderstander(apiKey);

  (async () => {
    try {
      let result: string;
      switch (mode) {
        case "describe":
          result = await understander.describe(imagePath);
          console.log(result);
          break;
        case "ocr":
          result = await understander.extractText(imagePath);
          console.log(result);
          break;
        case "objects":
          result = await understander.identifyObjects(imagePath);
          console.log(result);
          break;
        case "qa":
          if (question) {
            result = await understander.answerQuestion(imagePath, question);
            console.log(result);
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
