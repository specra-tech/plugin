#!/usr/bin/env node

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getPlaywrightInstallCommandText,
  isMissingPlaywrightBrowserError,
  runPlaywrightCli,
} from "./playwright-runner.mjs";

function printUsage() {
  console.error(`
Usage:
  node scripts/inspect-preview.mjs --url http://localhost:3000
  node scripts/inspect-preview.mjs --html-file .specra/captures/generated-preview.html
  node scripts/inspect-preview.mjs --url http://localhost:3000 --point 412,264
  node scripts/inspect-preview.mjs --url http://localhost:3000 --bbox 384,228,88,88

Options:
  --url <url>            Preview URL to inspect.
  --html-file <path>     Local HTML file to inspect.
  --out <path>           Optional output path. Defaults to .specra/captures/inspection-<timestamp>.json
  --point <x,y>          Optional selected point in viewport CSS pixels.
  --bbox <x,y,w,h>       Optional selected bounding box in viewport CSS pixels.
  --width <number>       Viewport width. Defaults to 1440.
  --height <number>      Viewport height. Defaults to 1200.
  --wait-ms <number>     Extra wait time after navigation. Defaults to 1200.
  --help                 Show this message.
`.trim());
}

function parsePoint(value) {
  const [xText, yText] = value.split(",");
  const x = Number.parseFloat(xText ?? "");
  const y = Number.parseFloat(yText ?? "");

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("`--point` must be formatted as x,y using numeric values.");
  }

  return { x, y };
}

function parseBbox(value) {
  const [xText, yText, widthText, heightText] = value.split(",");
  const x = Number.parseFloat(xText ?? "");
  const y = Number.parseFloat(yText ?? "");
  const width = Number.parseFloat(widthText ?? "");
  const height = Number.parseFloat(heightText ?? "");

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      "`--bbox` must be formatted as x,y,width,height using numeric values.",
    );
  }

  return { height, width, x, y };
}

function parseArgs(argv) {
  const parsed = {
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

    if (value === "--point") {
      parsed.selectionPoint = parsePoint(nextValue);
      index += 1;
      continue;
    }

    if (value === "--bbox") {
      parsed.selectionBbox = parseBbox(nextValue);
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

function validateNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function resolveOutputPath(outPath) {
  if (outPath) {
    return path.resolve(process.cwd(), outPath);
  }

  return path.resolve(
    process.cwd(),
    ".specra",
    "captures",
    `inspection-${Date.now()}.json`,
  );
}

async function resolveInspectionTarget(parsed) {
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

async function createTemporaryPlaywrightHarness(params) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "specra-inspect-"));
  const configPath = path.join(tempDir, "playwright.config.mjs");
  const specPath = path.join(tempDir, "inspect-preview.spec.mjs");

  await writeFile(
    configPath,
    `
export default {
  reporter: [["line"]],
  timeout: 45000,
  use: {
    colorScheme: "dark",
    viewport: { width: ${params.viewportWidth}, height: ${params.viewportHeight} }
  },
  workers: 1
};
`.trim(),
    "utf8",
  );

  await writeFile(
    specPath,
    `
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";

const targetUrl = process.env.SPECRA_INSPECT_TARGET_URL;
const outputPath = process.env.SPECRA_INSPECT_OUTPUT_PATH;
const waitMs = Number.parseInt(process.env.SPECRA_INSPECT_WAIT_MS ?? "1200", 10);
const sourceType = process.env.SPECRA_INSPECT_SOURCE_TYPE ?? "url";
const sourcePath = process.env.SPECRA_INSPECT_SOURCE_PATH ?? undefined;
const selectionPoint = process.env.SPECRA_INSPECT_SELECTION_POINT
  ? JSON.parse(process.env.SPECRA_INSPECT_SELECTION_POINT)
  : null;
const selectionBbox = process.env.SPECRA_INSPECT_SELECTION_BBOX
  ? JSON.parse(process.env.SPECRA_INSPECT_SELECTION_BBOX)
  : null;

function isVisibleElement(element) {
  const rect = element.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const style = window.getComputedStyle(element);

  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number.parseFloat(style.opacity || "1") === 0
  ) {
    return false;
  }

  return true;
}

function normalizeText(value) {
  return value.replace(/\\s+/g, " ").trim().slice(0, 240);
}

function overlapArea(a, b) {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  if (right <= left || bottom <= top) {
    return 0;
  }

  return (right - left) * (bottom - top);
}

function findNearestSelection(elements) {
  if (selectionPoint) {
    const containing = elements
      .filter((element) => {
        const { bbox } = element;
        return (
          selectionPoint.x >= bbox.x &&
          selectionPoint.x <= bbox.x + bbox.width &&
          selectionPoint.y >= bbox.y &&
          selectionPoint.y <= bbox.y + bbox.height
        );
      })
      .sort((left, right) => left.area - right.area);

    if (containing[0]) {
      return containing[0];
    }
  }

  if (selectionBbox) {
    const overlapping = elements
      .map((element) => ({
        element,
        overlap: overlapArea(element.bbox, selectionBbox),
      }))
      .filter((entry) => entry.overlap > 0)
      .sort((left, right) => right.overlap - left.overlap);

    if (overlapping[0]) {
      return overlapping[0].element;
    }
  }

  const selectionCenter = selectionPoint
    ? selectionPoint
    : selectionBbox
      ? {
          x: selectionBbox.x + selectionBbox.width / 2,
          y: selectionBbox.y + selectionBbox.height / 2,
        }
      : null;

  if (!selectionCenter) {
    return null;
  }

  return [...elements]
    .map((element) => ({
      distance: Math.hypot(
        element.center.x - selectionCenter.x,
        element.center.y - selectionCenter.y,
      ),
      element,
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.element ?? null;
}

test("inspect preview", async ({ page }) => {
  if (!targetUrl || !outputPath) {
    throw new Error("Missing required inspection environment variables.");
  }

  await page.goto(targetUrl, {
    timeout: 30000,
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(waitMs);
  await page.waitForLoadState("networkidle", {
    timeout: 5000,
  }).catch(() => undefined);

  const result = await page.evaluate(
    ({ selectionBbox: runtimeSelectionBbox, selectionPoint: runtimeSelectionPoint }) => {
      const elements = Array.from(document.querySelectorAll("[data-specra-id]"))
        .filter((element) => isVisibleElement(element))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const specraId = element.getAttribute("data-specra-id");

          if (!specraId) {
            return null;
          }

          return {
            area: rect.width * rect.height,
            bbox: {
              height: rect.height,
              width: rect.width,
              x: rect.x,
              y: rect.y,
            },
            center: {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
            },
            specraId,
            tagName: element.tagName.toLowerCase(),
            text: normalizeText(element.textContent ?? ""),
          };
        })
        .filter(Boolean);

      const nearestElement = findNearestSelection(elements);

      return {
        elements,
        inspectedAt: new Date().toISOString(),
        selection: {
          bbox: runtimeSelectionBbox,
          nearestElement,
          nearestSpecraId: nearestElement?.specraId ?? null,
          point: runtimeSelectionPoint,
        },
        viewport: {
          height: window.innerHeight,
          width: window.innerWidth,
        },
      };
    },
    {
      selectionBbox,
      selectionPoint,
    },
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        ...result,
        htmlFile: sourceType === "html-file" ? sourcePath : undefined,
        sourceType,
        url: sourceType === "url" ? targetUrl : undefined,
      },
      null,
      2,
    ),
    "utf8",
  );
});
`.trim(),
    "utf8",
  );

  return {
    cleanup: async () => {
      await rm(tempDir, {
        force: true,
        recursive: true,
      });
    },
    configPath,
    specPath,
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const target = await resolveInspectionTarget(parsed);

  validateNumber(parsed.width, "Viewport width");
  validateNumber(parsed.height, "Viewport height");
  validateNumber(parsed.waitMs, "Wait time");

  const outputPath = resolveOutputPath(parsed.outPath);

  await mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  const harness = await createTemporaryPlaywrightHarness({
    outputPath,
    selectionBbox: parsed.selectionBbox,
    selectionPoint: parsed.selectionPoint,
    sourceInput: target.input,
    viewportHeight: parsed.height,
    viewportWidth: parsed.width,
    waitMs: parsed.waitMs,
  });

  try {
    const result = await runPlaywrightCli(
      [
        "test",
        harness.specPath,
        "--config",
        harness.configPath,
        "--workers",
        "1",
      ],
      {
        env: {
          ...process.env,
          SPECRA_INSPECT_OUTPUT_PATH: outputPath,
          SPECRA_INSPECT_SELECTION_BBOX: parsed.selectionBbox
            ? JSON.stringify(parsed.selectionBbox)
            : "",
          SPECRA_INSPECT_SELECTION_POINT: parsed.selectionPoint
            ? JSON.stringify(parsed.selectionPoint)
            : "",
          SPECRA_INSPECT_SOURCE_PATH:
            target.sourceType === "html-file" ? target.sourcePath : "",
          SPECRA_INSPECT_SOURCE_TYPE: target.sourceType,
          SPECRA_INSPECT_TARGET_URL: target.input,
          SPECRA_INSPECT_WAIT_MS: String(parsed.waitMs),
        },
      },
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
          : "Playwright DOM inspection failed.",
      );
    }

    console.log(
      JSON.stringify(
        {
          htmlFile: target.sourceType === "html-file" ? target.sourcePath : undefined,
          outputPath,
          selectionBbox: parsed.selectionBbox,
          selectionPoint: parsed.selectionPoint,
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
  } finally {
    await harness.cleanup();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
