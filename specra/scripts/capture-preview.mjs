#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  getPlaywrightInstallCommandText,
  isMissingPlaywrightBrowserError,
} from "./playwright-runner.mjs";

const DEFAULT_VIEWPORT_WIDTH = 1320;
const DEFAULT_VIEWPORT_HEIGHT = 800;
const MAX_STANDARD_VIEWPORT_HEIGHT = 900;

function printUsage() {
  console.error(
    `
Usage:
  bun scripts/capture-preview.mjs --url http://localhost:3000
  bun scripts/capture-preview.mjs --html-file .specra/captures/generated-preview.html

Options:
  --url <url>          Preview URL to capture.
  --html-file <path>   Local HTML file to capture.
  --out <path>         Optional output path. Defaults to .specra/captures/preview-<timestamp>.png
  --width <number>     Viewport width. Defaults to 1320.
  --height <number>    Viewport height. Defaults to 800.
  --scroll-y <number>  Scroll offset in CSS pixels before capture. Defaults to 0.
  --wait-ms <number>   Extra wait time after navigation. Defaults to 1200.
  --allow-tall-viewport
                       Allow viewport heights over ${MAX_STANDARD_VIEWPORT_HEIGHT}px when explicitly matching a user's browser.
  --full-page          Unsupported. Specra captures viewport frames only.
  --help               Show this message.
`.trim(),
  );
}

function parseArgs(argv) {
  const parsed = {
    allowTallViewport: false,
    fullPage: false,
    height: DEFAULT_VIEWPORT_HEIGHT,
    scrollY: 0,
    waitMs: 1200,
    width: DEFAULT_VIEWPORT_WIDTH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--help") {
      printUsage();
      process.exit(0);
    }

    if (value === "--full-page") {
      throw new Error(
        "Specra no longer supports --full-page captures. Capture viewport frames and use --scroll-y for below-the-fold regions.",
      );
    }

    if (value === "--allow-tall-viewport") {
      parsed.allowTallViewport = true;
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

    if (value === "--scroll-y") {
      parsed.scrollY = Number.parseInt(nextValue, 10);
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

function validateNonNegativeNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be zero or a positive number.`);
  }
}

function validateViewportHeight(value, allowTallViewport) {
  if (value <= MAX_STANDARD_VIEWPORT_HEIGHT || allowTallViewport) {
    return;
  }

  throw new Error(
    `Viewport height ${value}px is too tall for standard Specra app evaluation. Use ${DEFAULT_VIEWPORT_WIDTH}x${DEFAULT_VIEWPORT_HEIGHT} or match the user's visible browser viewport; for lower content, keep the viewport height and use --scroll-y. If you are intentionally matching a taller user viewport, pass --allow-tall-viewport.`,
  );
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

async function loadPlaywright() {
  try {
    return {
      error: null,
      module: await import("playwright"),
    };
  } catch (error) {
    return {
      error,
      module: null,
    };
  }
}

async function runCommand(cmd, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stderr,
        stdout,
      });
    });
  });
}

async function runBunBridgeCapture(args, importError) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "specra-capture-"));
  const argsPath = path.join(tempDir, "args.json");
  const bridgePath = path.join(tempDir, "capture.mjs");

  await writeFile(argsPath, JSON.stringify(args), "utf8");
  await writeFile(
    bridgePath,
    `
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const args = JSON.parse(await readFile(process.argv[2], "utf8"));
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    colorScheme: "dark",
    deviceScaleFactor: 1,
    viewport: {
      height: args.viewportHeight,
      width: args.viewportWidth,
    },
  });

  await page.goto(args.input, {
    timeout: 30000,
    waitUntil: "networkidle",
  });

  if (args.scrollY > 0) {
    await page.evaluate((scrollY) => {
      window.scrollTo(0, scrollY);
    }, args.scrollY);
  }

  await page.waitForTimeout(args.waitMs);

  const captureMetadata = await page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    outerHeight: window.outerHeight,
    outerWidth: window.outerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    visualViewport: window.visualViewport
      ? {
          height: window.visualViewport.height,
          scale: window.visualViewport.scale,
          width: window.visualViewport.width,
        }
      : null,
  }));

  await page.screenshot({
    fullPage: false,
    path: args.outputPath,
  });

  console.log(JSON.stringify(captureMetadata));
} finally {
  await browser?.close();
}
`.trimStart(),
    "utf8",
  );

  const result = await runCommand("bun", [bridgePath, argsPath]);

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
      [
        "Playwright capture failed.",
        combinedOutput,
        importError instanceof Error
          ? `Direct import also failed: ${importError.message}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return JSON.parse(result.stdout);
}

async function captureViewportDirect(args, playwright) {
  const { chromium } = playwright;
  let browser;

  try {
    browser = await chromium.launch();
    const page = await browser.newPage({
      colorScheme: "dark",
      deviceScaleFactor: 1,
      viewport: {
        height: args.viewportHeight,
        width: args.viewportWidth,
      },
    });

    await page.goto(args.input, {
      timeout: 30000,
      waitUntil: "networkidle",
    });

    if (args.scrollY > 0) {
      await page.evaluate((scrollY) => {
        window.scrollTo(0, scrollY);
      }, args.scrollY);
    }

    await page.waitForTimeout(args.waitMs);

    const captureMetadata = await page.evaluate(() => ({
      devicePixelRatio: window.devicePixelRatio,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      outerHeight: window.outerHeight,
      outerWidth: window.outerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      visualViewport: window.visualViewport
        ? {
            height: window.visualViewport.height,
            scale: window.visualViewport.scale,
            width: window.visualViewport.width,
          }
        : null,
    }));

    await page.screenshot({
      fullPage: false,
      path: args.outputPath,
    });

    return captureMetadata;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isMissingPlaywrightBrowserError(message)) {
      throw new Error(
        `Playwright Chromium is not installed on this machine. Run ${getPlaywrightInstallCommandText()}, then retry.`,
      );
    }

    throw error;
  } finally {
    await browser?.close();
  }
}

async function captureViewport(args) {
  const loaded = await loadPlaywright();

  if (loaded.module) {
    return await captureViewportDirect(args, loaded.module);
  }

  return await runBunBridgeCapture(args, loaded.error);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const target = await resolveCaptureTarget(parsed);

  validateNumber(parsed.width, "Viewport width");
  validateNumber(parsed.height, "Viewport height");
  validateNumber(parsed.waitMs, "Wait time");
  validateNonNegativeNumber(parsed.scrollY, "Scroll Y");
  validateViewportHeight(parsed.height, parsed.allowTallViewport);

  const outputPath = resolveOutputPath(parsed.outPath);

  await mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  const captureMetadata = await captureViewport({
    input: target.input,
    outputPath,
    scrollY: parsed.scrollY,
    viewportHeight: parsed.height,
    viewportWidth: parsed.width,
    waitMs: parsed.waitMs,
  });

  console.log(
    JSON.stringify(
      {
        fullPage: false,
        htmlFile:
          target.sourceType === "html-file" ? target.sourcePath : undefined,
        outputPath,
        scroll: {
          requestedY: parsed.scrollY,
          x: captureMetadata.scrollX,
          y: captureMetadata.scrollY,
        },
        sourceType: target.sourceType,
        url: target.sourceType === "url" ? target.input : undefined,
        viewport: {
          devicePixelRatio: captureMetadata.devicePixelRatio,
          height: parsed.height,
          innerHeight: captureMetadata.innerHeight,
          innerWidth: captureMetadata.innerWidth,
          visualViewport: captureMetadata.visualViewport,
          width: parsed.width,
        },
        page: {
          scrollHeight: captureMetadata.scrollHeight,
          scrollWidth: captureMetadata.scrollWidth,
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
