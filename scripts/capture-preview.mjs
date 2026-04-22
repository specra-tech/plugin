#!/usr/bin/env node

import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import {
  getPlaywrightInstallCommandText,
  isMissingPlaywrightBrowserError,
  runPlaywrightCli,
} from "./playwright-runner.mjs";

function printUsage() {
  console.error(`
Usage:
  node scripts/capture-preview.mjs --url http://localhost:3000
  node scripts/capture-preview.mjs --html-file .specra/captures/generated-preview.html

Options:
  --url <url>          Preview URL to capture.
  --html-file <path>   Local HTML file to capture.
  --out <path>         Optional output path. Defaults to .specra/captures/preview-<timestamp>.png
  --width <number>     Viewport width. Defaults to 1440.
  --height <number>    Viewport height. Defaults to 1200.
  --wait-ms <number>   Extra wait time after navigation. Defaults to 1200.
  --full-page          Capture the full page instead of the viewport.
  --help               Show this message.
`.trim());
}

function parseArgs(argv) {
  const parsed = {
    fullPage: false,
    height: 1200,
    waitMs: 1200,
    width: 1440,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--help") {
      printUsage();
      process.exit(0);
    }

    if (value === "--full-page") {
      parsed.fullPage = true;
      continue;
    }

    const nextValue = argv[index + 1];

    if (!nextValue) {
      throw new Error(`Missing value for ${value}.`);
    }

    if (value === "--url") {
      parsed.url = nextValue;
      index += 1;
      continue;
    }

    if (value === "--html-file") {
      parsed.htmlFile = nextValue;
      index += 1;
      continue;
    }

    if (value === "--out") {
      parsed.outPath = nextValue;
      index += 1;
      continue;
    }

    if (value === "--width") {
      parsed.width = Number.parseInt(nextValue, 10);
      index += 1;
      continue;
    }

    if (value === "--height") {
      parsed.height = Number.parseInt(nextValue, 10);
      index += 1;
      continue;
    }

    if (value === "--wait-ms") {
      parsed.waitMs = Number.parseInt(nextValue, 10);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  return parsed;
}

function resolveOutputPath(outPath) {
  if (outPath) {
    return path.resolve(process.cwd(), outPath);
  }

  return path.resolve(
    process.cwd(),
    ".specra",
    "captures",
    `preview-${Date.now()}.png`,
  );
}

function validateNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

async function resolveCaptureTarget(parsed) {
  if (parsed.url && parsed.htmlFile) {
    throw new Error("Pass either `--url` or `--html-file`, not both.");
  }

  if (!parsed.url && !parsed.htmlFile) {
    throw new Error("Either `--url` or `--html-file` is required.");
  }

  if (parsed.url) {
    const url = new URL(parsed.url);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Preview URL must use http or https.");
    }

    return {
      input: url.toString(),
      sourceType: "url",
    };
  }

  const resolvedHtmlFile = path.resolve(process.cwd(), parsed.htmlFile);

  await access(resolvedHtmlFile).catch(() => {
    throw new Error(`HTML file does not exist: ${resolvedHtmlFile}`);
  });

  return {
    input: `file://${resolvedHtmlFile}`,
    sourcePath: resolvedHtmlFile,
    sourceType: "html-file",
  };
}

function buildPlaywrightArgs(args) {
  const commandArgs = [
    "screenshot",
    "--browser",
    "chromium",
    "--color-scheme",
    "dark",
    "--timeout",
    "30000",
    "--wait-for-timeout",
    String(args.waitMs),
    "--viewport-size",
    `${args.viewportWidth},${args.viewportHeight}`,
  ];

  if (args.fullPage) {
    commandArgs.push("--full-page");
  }

  commandArgs.push(args.input, args.outputPath);

  return commandArgs;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const target = await resolveCaptureTarget(parsed);

  validateNumber(parsed.width, "Viewport width");
  validateNumber(parsed.height, "Viewport height");
  validateNumber(parsed.waitMs, "Wait time");

  const outputPath = resolveOutputPath(parsed.outPath);

  await mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  const result = await runPlaywrightCli(
    buildPlaywrightArgs({
      fullPage: parsed.fullPage,
      input: target.input,
      outputPath,
      viewportHeight: parsed.height,
      viewportWidth: parsed.width,
      waitMs: parsed.waitMs,
    }),
  );

  if (result.exitCode !== 0) {
    const combinedOutput = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    if (isMissingPlaywrightBrowserError(combinedOutput)) {
      throw new Error(
        `Playwright Chromium is not installed on this machine. Run ${getPlaywrightInstallCommandText()}, then retry.`,
      );
    }

    throw new Error(
      combinedOutput.length > 0
        ? combinedOutput
        : "Playwright screenshot capture failed.",
    );
  }

  console.log(
    JSON.stringify(
      {
        fullPage: parsed.fullPage,
        htmlFile: target.sourceType === "html-file" ? target.sourcePath : undefined,
        outputPath,
        sourceType: target.sourceType,
        url: target.sourceType === "url" ? target.input : undefined,
        viewport: {
          height: parsed.height,
          width: parsed.width,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
