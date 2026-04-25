#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

function getLocalPlaywrightBinary(cwd = process.cwd()) {
  return path.resolve(
    cwd,
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
  return "`./node_modules/.bin/playwright install chromium` after installing `playwright` as a local dev dependency";
}

export function isMissingPlaywrightBrowserError(message) {
  return (
    message.includes("Executable doesn't exist") ||
    message.includes(
      "Please run the following command to download new browsers",
    ) ||
    message.includes("browserType.launch")
  );
}

export async function runPlaywrightCli(args, options = {}) {
  const localBinary = getLocalPlaywrightBinary(options.cwd ?? process.cwd());

  if (await canAccess(localBinary)) {
    return await runCommand(localBinary, args, options);
  }

  throw new Error(
    [
      "Unable to find a Playwright launcher in this environment.",
      "Install Playwright locally in the target repo and run",
      `${getPlaywrightInstallCommandText()}.`,
    ]
      .filter(Boolean)
      .join(" "),
  );
}
