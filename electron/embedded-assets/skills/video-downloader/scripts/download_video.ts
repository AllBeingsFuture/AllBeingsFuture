#!/usr/bin/env npx tsx
/**
 * Video Downloader
 * Downloads videos using yt-dlp with customizable quality and format options.
 *
 * Usage:
 *   npx tsx download_video.ts <url> [options]
 *
 * Options:
 *   -o, --output <path>     Output directory (default: ./outputs)
 *   -q, --quality <q>       Video quality: best, 1080p, 720p, 480p, 360p, worst (default: best)
 *   -f, --format <fmt>      Video format: mp4, webm, mkv (default: mp4)
 *   -a, --audio-only        Download only audio as MP3
 */

import { execFileSync, execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  url: string;
  output: string;
  quality: string;
  format: string;
  audioOnly: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = {
    url: "",
    output: "./outputs",
    quality: "best",
    format: "mp4",
    audioOnly: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "-o":
      case "--output":
        result.output = args[++i];
        break;
      case "-q":
      case "--quality":
        result.quality = args[++i];
        break;
      case "-f":
      case "--format":
        result.format = args[++i];
        break;
      case "-a":
      case "--audio-only":
        result.audioOnly = true;
        break;
      default:
        if (!args[i].startsWith("-")) {
          positional.push(args[i]);
        }
    }
  }

  if (positional.length > 0) {
    result.url = positional[0];
  }

  return result;
}

// ---------------------------------------------------------------------------
// yt-dlp helpers
// ---------------------------------------------------------------------------

function checkYtDlp(): void {
  try {
    execFileSync("yt-dlp", ["--version"], { stdio: "pipe" });
  } catch {
    console.log("yt-dlp not found. Attempting to install via pip...");
    try {
      execSync("pip install yt-dlp", { stdio: "inherit" });
    } catch {
      try {
        execSync("pip3 install yt-dlp", { stdio: "inherit" });
      } catch {
        console.error("Failed to install yt-dlp. Please install it manually: pip install yt-dlp");
        process.exit(1);
      }
    }
  }
}

function getVideoInfo(url: string): Record<string, unknown> {
  const result = execFileSync("yt-dlp", ["--dump-json", "--no-playlist", url], {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(result);
}

function downloadVideo(
  url: string,
  outputPath: string,
  quality: string,
  formatType: string,
  audioOnly: boolean,
): boolean {
  checkYtDlp();

  const cmd: string[] = ["yt-dlp"];

  if (audioOnly) {
    cmd.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    let formatString: string;
    if (quality === "best") {
      formatString = "bestvideo+bestaudio/best";
    } else if (quality === "worst") {
      formatString = "worstvideo+worstaudio/worst";
    } else {
      const height = quality.replace("p", "");
      formatString = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
    }
    cmd.push("-f", formatString, "--merge-output-format", formatType);
  }

  cmd.push("-o", `${outputPath}/%(title)s.%(ext)s`, "--no-playlist", url);

  console.log(`Downloading from: ${url}`);
  console.log(`Quality: ${quality}`);
  console.log(`Format: ${audioOnly ? "mp3 (audio only)" : formatType}`);
  console.log(`Output: ${outputPath}\n`);

  try {
    const info = getVideoInfo(url);
    const title = (info.title as string) || "Unknown";
    const duration = (info.duration as number) || 0;
    const uploader = (info.uploader as string) || "Unknown";

    console.log(`Title: ${title}`);
    console.log(`Duration: ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`);
    console.log(`Uploader: ${uploader}\n`);

    execFileSync(cmd[0], cmd.slice(1), { stdio: "inherit" });
    console.log("\nDownload complete!");
    return true;
  } catch (e) {
    console.error(`\nError downloading video: ${(e as Error).message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv);

  if (!args.url) {
    console.error(
      "Usage: npx tsx download_video.ts <url> [options]\n\n" +
        "Options:\n" +
        "  -o, --output <path>     Output directory (default: ./outputs)\n" +
        "  -q, --quality <q>       best, 1080p, 720p, 480p, 360p, worst\n" +
        "  -f, --format <fmt>      mp4, webm, mkv\n" +
        "  -a, --audio-only        Download only audio as MP3",
    );
    process.exit(1);
  }

  const validQualities = ["best", "1080p", "720p", "480p", "360p", "worst"];
  if (!validQualities.includes(args.quality)) {
    console.error(`Invalid quality: ${args.quality}. Choose from: ${validQualities.join(", ")}`);
    process.exit(1);
  }

  const validFormats = ["mp4", "webm", "mkv"];
  if (!validFormats.includes(args.format)) {
    console.error(`Invalid format: ${args.format}. Choose from: ${validFormats.join(", ")}`);
    process.exit(1);
  }

  const success = downloadVideo(args.url, args.output, args.quality, args.format, args.audioOnly);
  process.exit(success ? 0 : 1);
}

main();
