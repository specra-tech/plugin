#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

function getLocalPlaywrightBinary() {
  return path.resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "playwright.cmd" : "playwright",
  );
}

async function canAccess(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectPreferredLaunchers() {
  const cwd = process.cwd();
  const preferenceChecks = [
    {
      exists: await canAccess(path.join(cwd, "pnpm-lock.yaml")),
      launchers: [
        ["pnpm", "dlx"],
        ["npm", "exec", "--"],
        ["npx"],
        ["yarn", "dlx"],
        ["bunx"],
      ],
    },
    {
      exists: await canAccess(path.join(cwd, "yarn.lock")),
      launchers: [
        ["yarn", "dlx"],
        ["npm", "exec", "--"],
        ["npx"],
        ["pnpm", "dlx"],
        ["bunx"],
      ],
    },
    {
      exists:
        (await canAccess(path.join(cwd, "bun.lock"))) ||
        (await canAccess(path.join(cwd, "bun.lockb"))),
      launchers: [
        ["bunx"],
        ["pnpm", "dlx"],
        ["yarn", "dlx"],
        ["npm", "exec", "--"],
        ["npx"],
      ],
    },
    {
      exists:
        (await canAccess(path.join(cwd, "package-lock.json"))) ||
        (await canAccess(path.join(cwd, "npm-shrinkwrap.json"))),
      launchers: [
        ["npm", "exec", "--"],
        ["npx"],
        ["pnpm", "dlx"],
        ["yarn", "dlx"],
        ["bunx"],
      ],
    },
  ];

  return (
    preferenceChecks.find((entry) => entry.exists)?.launchers ?? [
      ["npm", "exec", "--"],
      ["npx"],
      ["pnpm", "dlx"],
      ["yarn", "dlx"],
      ["bunx"],
    ]
  );
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

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stderr,
        stdout,
      });
    });
  });
}

export function getPlaywrightInstallCommandText() {
  return [
    "`npx playwright install chromium`",
    "`pnpm dlx playwright install chromium`",
    "`bunx playwright install chromium`",
    "`yarn dlx playwright install chromium`",
  ].join(", ");
}

export function isMissingPlaywrightBrowserError(message) {
  return (
    message.includes("Executable doesn't exist") ||
    message.includes("Please run the following command to download new browsers") ||
    message.includes("browserType.launch")
  );
}

export async function runPlaywrightCli(args, options = {}) {
  const localBinary = getLocalPlaywrightBinary();
  const candidates = [];
  const preferredLaunchers = await detectPreferredLaunchers();

  if (await canAccess(localBinary)) {
    candidates.push([localBinary, ...args]);
  }

  for (const launcher of preferredLaunchers) {
    candidates.push([...launcher, "playwright", ...args]);
  }

  let lastError = null;

  for (const [command, ...commandArgs] of candidates) {
    try {
      return await runCommand(command, commandArgs, options);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        lastError = error;
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    [
      "Unable to find a Playwright launcher in this environment.",
      "Install Playwright locally or use a package runner such as",
      `${getPlaywrightInstallCommandText()}.`,
      lastError instanceof Error ? `Last error: ${lastError.message}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}
