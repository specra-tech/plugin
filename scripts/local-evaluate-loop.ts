#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { IterationContext } from "./local-evaluate-core";
import {
  buildMicroPolishIterationGuidance,
  buildPreviewIterationGuidance,
  getLocalEvalStatusPath,
  writeLocalEvalStatusArtifact,
} from "./local-evaluate-core";

const embeddedRuntimeSystemMd = `
You are the runtime Specra implementation contract.

Rules:
- TailwindCSS and shadcn/ui are required implementation dependencies.
- Prefer semantic Tailwind utilities and the project theme contract over hard-coded colors and arbitrary values.
- Use the current DESIGN.md and theme.css artifacts as the source of truth.
- Do not claim that a UI is aligned to the Specra handoff unless a current local Specra screenshot evaluation artifact permits that claim.
`.trim();

const artifactTypes = ["design-md", "theme-css"] as const;

type ArtifactType = (typeof artifactTypes)[number];
type SpecraConfig = {
  outputs?: Partial<Record<ArtifactType, string>>;
  outputsDir?: string;
  projectId?: string;
  projectName?: string;
  referencesDir?: string;
};

const supportedReferenceExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

const defaultIterationContext = {
  bestQualityScore: null,
  broadRound: 0,
  microRound: 0,
  nonImprovingBroadStreak: 0,
  previousQualityScore: null,
} satisfies IterationContext;

const defaultViewport = {
  height: 800,
  waitMs: 1200,
  width: 1320,
} as const;

const broadEvaluationPrompt = `
You evaluate a live UI screenshot against a Specra project's current analysis artifacts.

Rules:
- Return only the requested structured JSON.
- Use the screenshot as the execution surface.
- Use DESIGN.md and theme.css as the design source of truth.
- Use the task description as the primary source of truth for what kind of screen the user asked for.
- Treat the references primarily as design-system input: theme, density, spacing, surfaces, component language, and interaction tone.
- If layout or theme semantics are unavailable in local artifact-only mode, rely more heavily on the artifact prose and the screenshot itself.
- When a \`preview-dom-style-summary\` block is present, treat it as the computed-style reality of the implementation. Use it to distinguish foundation tokens from one-off state fills.
- Judge shell structure, hierarchy, spacing rhythm, typography, component choice, extracted surface model, extracted chrome character, extracted accent discipline, and overall visual discipline.
- Judge header archetype explicitly: quiet utility bar, stacked section header, or hero/masthead. Treat the wrong header mode as real structure drift, not mere styling preference.
- Judge module archetypes and visual payload as first-class structure cues. Icon-led or thumbnail-led tile rows, embedded library lists, queue or table modules, text-heavy hero panels, and stacked support cards are not interchangeable just because they fit inside the same shell.
- Treat oversized hero-like \`h1\` treatments, display/editorial header typography, or a two-row stacked masthead in a utility-bar system as a material structure defect.
- Treat copied brand names, logos, workspace names, avatar initials, product names, or screenshot-specific microcopy from the references as a defect unless the user explicitly asked to recreate that exact branded product.
- Treat slash-opacity color utilities such as \`bg-*/60\`, \`text-*/70\`, or \`border-*/50\` as drift unless translucency is clearly part of the extracted system or a narrow local exception.
- Treat radius as a system, not decoration. Buttons and controls should usually stay on the default control radius, and nested surfaces should usually step down one radius bucket from their parent instead of improvising unrelated contours.
- Score structure, theme, and cohesion separately.
- Classify each finding as one of:
  - \`structure\`: shell, region hierarchy, emphasis order, module composition
  - \`theme\`: semantic surfaces, token usage, contrast, accent discipline
  - \`cohesion\`: surface weight, density rhythm, chrome competition, unnecessary modules, or overall visual coherence
- Treat screen-type mismatch as a hard failure only when it contradicts the explicit task or requested structure.
- If the requested screen type is correct but the visual language drifts, report that as surface-model, chrome, density, accent, or typography drift instead of calling it the wrong archetype.
- If the shell is roughly right but the repeated modules shift the screen into a different product mode, such as content-first or creative references becoming an internal review, approval, or KPI dashboard, treat that as real structure or cohesion drift.
- Be especially alert for drift away from the extracted cues, such as the wrong surface attachment, the wrong chrome thickness, the wrong accent intensity, the wrong density, or the wrong typography posture.
- Treat replacing a lightweight tile row, thumbnail-led surface, or embedded library list with a dominant text hero card, approval queue, or stacked ops cards as a material defect when the artifacts imply the former.
- Treat direct reuse of reference-brand copy as a material defect even when the surrounding shell and surfaces look close.
- Treat unnecessary translucency on semantic colors as a real defect, especially on major surfaces, selected states, text, and borders.
- Detached panels, composers, prompt blocks, or control groups are valid when the references or artifacts support that posture. Only flag detachment when it breaks hierarchy, reading flow, or the extracted surface discipline.
- Treat gradients on backgrounds, panels, controls, or text as a defect unless the references clearly support them.
- Treat tracked uppercase eyebrow labels such as \`uppercase tracking-[0.18em]\` as typography/cohesion drift unless the references clearly support that pattern.
- Treat ornamental clutter as a meaningful defect. Call out decorative eyebrow labels, vibe-setting pills, summary cards that merely restate surrounding content, and filler modules with weak workflow value.
- Prefer findings that remove unnecessary UI over findings that merely restyle unnecessary UI.
- Return only the highest-leverage findings first.
- Before the findings list, name the biggest mismatch explicitly in product terms.
- Return these broad diagnosis fields:
  - \`primary_mismatch\`: one sentence naming the dominant drift
  - \`header_assessment\`: \`matches | drifted\` plus a short reason
  - \`module_system_assessment\`: \`matches | drifted\` plus a short reason
  - \`first_glance_hierarchy_assessment\`: \`matches | drifted\` plus a short reason
  - \`product_mode_assessment\`: \`matches | drifted\` plus a short reason
- Use the diagnosis fields to say exactly what is off, not just that the screen feels different.
- If the shell is close but the screen still reads like the wrong product type, say that explicitly in \`primary_mismatch\` and \`product_mode_assessment\`.
- Keep \`issue\` terse and concrete.
- Keep \`recommendation\` terse, imperative, and low-ambiguity.
- Each finding should correspond to one specific fixable change, not a paragraph of design commentary.
- Scores must use the 0-100 scale. Do not return 0-10 ratings.
- If you instinctively score on a 0-10 scale, multiply by 10 before returning the values.
- When \`broadRound >= 2\`, stop repeating generic shell or hierarchy feedback unless a named region still materially breaks the shell contract. Move to smaller concrete fixes.
- Avoid oscillation. Do not say a region is "too high", "too low", "too detached", or "too compressed" unless the directional change is visually clear relative to a named adjacent region.
- If the direction is not visually certain, recommend fixing the relationship between specific regions instead of guessing a direction.
- If a critique would be too subjective to map to one likely code change, rewrite it into a single concrete visible delta before returning it.
- Every finding must include a precise target point and, when possible, a bounding box.
- Only use \`aligned\` when the screen is materially close to the extracted system.
`.trim();

const microPolishPrompt = `
You evaluate a UI screenshot for tiny human-noticeable polish issues against a Specra project's current analysis artifacts.

Rules:
- Return only the requested structured JSON.
- Focus on spacing and alignment first: padding balance, row rhythm, control-group spacing, icon centering, optical alignment, and border/radius consistency.
- Check header utility rows closely: title size, row count, inline search/action alignment, outer/inner padding, and whether the top chrome reads as one working band.
- Check procedural radius consistency: controls should stay on the standard control radius, parent panels should keep the standard panel radius, and inset child surfaces should usually step down one radius bucket instead of becoming pills.
- Check section gutters and panel padding explicitly: inter-section rhythm, left/right column gutter consistency, and inset card padding should feel intentional rather than approximate.
- Check internal card grids explicitly: if a top visual slab, media well, or inset block uses a different horizontal inset than the title/copy/footer below it, treat that as a real polish defect.
- Treat unnecessary extra padding inside top slabs or media wells as a defect when it makes the card read like two unrelated layouts or a placeholder block.
- Do not report broad structural issues unless they directly create a visible micro-polish defect.
- This pass exists to catch the last 1-2 real polish issues broad evaluation often leaves behind.
- Return only the smallest set of high-value polish findings.
- Keep \`issue\` and \`recommendation\` terse and low-ambiguity.
- Avoid subjective "vibe" commentary. Each finding should be a concrete visible delta that could plausibly be fixed with one small code change.
- Every finding must include a precise target point and, when possible, a bounding box.
- Use \`polished\` only when the screenshot looks clean at the micro level.
- Do not use \`polished\` when obvious gap, padding, alignment, or radius-step inconsistencies remain, even if the broad shell is already correct.
`.trim();

function printUsage() {
  console.error(
    `
Usage:
  bun plugins/specra/scripts/local-evaluate-loop.ts run --repo /path/to/repo --url http://localhost:3000
  bun plugins/specra/scripts/local-evaluate-loop.ts run --repo /path/to/repo --url http://localhost:3000 --mode broad --evaluation /abs/broad-result.json
  bun plugins/specra/scripts/local-evaluate-loop.ts run --repo /path/to/repo --mode micro --evaluation /abs/micro-result.json
  bun plugins/specra/scripts/local-evaluate-loop.ts prepare-broad --repo /path/to/repo --screenshot /abs/path.png
  bun plugins/specra/scripts/local-evaluate-loop.ts prepare-micro --repo /path/to/repo --screenshot /abs/path.png --focus-areas tabs,toolbar
  bun plugins/specra/scripts/local-evaluate-loop.ts guide-broad --repo /path/to/repo --evaluation /abs/result.json
  bun plugins/specra/scripts/local-evaluate-loop.ts guide-micro --repo /path/to/repo --evaluation /abs/result.json

Options:
  --mode <broad|micro>        Evaluation mode for run when --evaluation is provided. Defaults to broad.
  --url <url>                 Preview URL to capture for run.
  --html-file <path>          Local HTML file to capture for run.
  --repo <path>               Repo root with .specra.json and local artifact outputs.
  --screenshot <path>         Absolute path to a locally captured screenshot.
  --dom-inspection <path>     Optional absolute path to local DOM inspection JSON.
  --task <text>               Optional task description.
  --focus-areas <csv>         Optional comma-separated micro-polish focus areas.
  --iteration-context <path>  Optional JSON file with prior iteration context.
  --evaluation <path|->       JSON file containing the client LLM's evaluation result, or - for stdin.
  --width <number>            Capture viewport width for run. Defaults to ${defaultViewport.width}.
  --height <number>           Capture viewport height for run. Defaults to ${defaultViewport.height}.
  --scroll-y <number>         Capture scroll offset for run. Defaults to 0.
  --wait-ms <number>          Extra wait after navigation for run. Defaults to ${defaultViewport.waitMs}.
  --out <path>                Optional output file. Defaults to stdout.
  --help                      Show this message.
`.trim(),
  );
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;

  if (!command || command === "--help") {
    printUsage();
    process.exit(0);
  }

  const parsed: Record<string, string> = {
    command,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];

    if (value === "--help") {
      printUsage();
      process.exit(0);
    }

    if (!value.startsWith("--")) {
      throw new Error(`Unknown argument: ${value}`);
    }

    const nextValue = rest[index + 1];

    if (!nextValue) {
      throw new Error(`Missing value for ${value}.`);
    }

    parsed[value.slice(2)] = nextValue;
    index += 1;
  }

  return parsed;
}

async function writeOutput(outputPath: string | undefined, value: unknown) {
  const serialized =
    typeof value === "string"
      ? `${value}\n`
      : `${JSON.stringify(value, null, 2)}\n`;

  if (!outputPath) {
    process.stdout.write(serialized);
    return;
  }

  await writeFile(path.resolve(process.cwd(), outputPath), serialized, "utf8");
}

async function readStdin() {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readEvaluationJson(evaluationPath: string) {
  const raw =
    evaluationPath === "-"
      ? await readStdin()
      : await readFile(path.resolve(process.cwd(), evaluationPath), "utf8");

  return JSON.parse(raw);
}

function parsePositiveInteger(value: string | undefined, label: string) {
  if (value == null) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

function parseNonNegativeInteger(value: string | undefined, label: string) {
  if (value == null) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be zero or a positive integer.`);
  }

  return parsed;
}

async function runProcess(command: string, args: string[], cwd: string) {
  return await new Promise<{
    exitCode: number;
    stderr: string;
    stdout: string;
  }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
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

function getScriptPath(fileName: string) {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), fileName);
}

function defaultCapturePath(params: {
  mode: "broad" | "micro";
  repoPath: string;
  scrollY: number;
}) {
  const fileName =
    params.mode === "micro"
      ? "top-micro.png"
      : params.scrollY === 0
        ? "top.png"
        : `scroll-${params.scrollY}.png`;

  return path.join(params.repoPath, ".specra", "captures", fileName);
}

async function captureForRun(params: {
  height: number;
  htmlFile?: string;
  mode: "broad" | "micro";
  repoPath: string;
  screenshotPath?: string;
  scrollY: number;
  url?: string;
  waitMs: number;
  width: number;
}) {
  if (params.screenshotPath) {
    return {
      capture: null,
      screenshotPath: path.resolve(process.cwd(), params.screenshotPath),
    };
  }

  if (!params.url && !params.htmlFile) {
    throw new Error(
      "run needs --url, --html-file, or --screenshot so it can evaluate a concrete viewport.",
    );
  }

  const outputPath = defaultCapturePath({
    mode: params.mode,
    repoPath: params.repoPath,
    scrollY: params.scrollY,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });

  const args = [
    getScriptPath("capture-preview.mjs"),
    ...(params.url ? ["--url", params.url] : []),
    ...(params.htmlFile ? ["--html-file", params.htmlFile] : []),
    "--out",
    outputPath,
    "--width",
    String(params.width),
    "--height",
    String(params.height),
    "--scroll-y",
    String(params.scrollY),
    "--wait-ms",
    String(params.waitMs),
  ];
  const result = await runProcess(process.execPath, args, params.repoPath);

  if (result.exitCode !== 0) {
    throw new Error(
      `Screenshot capture failed.\n${result.stderr.trim() || result.stdout.trim()}`,
    );
  }

  return {
    capture: JSON.parse(result.stdout) as unknown,
    screenshotPath: outputPath,
  };
}

async function findSpecraConfig(repoPath: string) {
  for (const fileName of [".specra.json", ".secra.json"]) {
    const absolutePath = path.join(repoPath, fileName);

    try {
      const raw = await readFile(absolutePath, "utf8");
      return parseSpecraConfig(JSON.parse(raw));
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`No .specra.json or .secra.json found under ${repoPath}.`);
}

function defaultOutputFileName(type: ArtifactType) {
  switch (type) {
    case "design-md":
      return "DESIGN.md";
    case "theme-css":
      return "theme.css";
  }
}

function resolveArtifactPath(
  repoPath: string,
  config: SpecraConfig,
  type: ArtifactType,
) {
  const relativePath =
    config.outputs?.[type] ??
    path.posix.join(
      config.outputsDir ?? ".specra/generated",
      defaultOutputFileName(type),
    );

  return path.resolve(repoPath, relativePath);
}

async function collectReferenceImages(referenceDir: string) {
  async function walk(currentPath: string): Promise<string[]> {
    const entries = await readdir(currentPath, {
      withFileTypes: true,
    }).catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }

      throw error;
    });

    const results: string[] = [];

    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        results.push(...(await walk(nextPath)));
        continue;
      }

      if (
        supportedReferenceExtensions.has(path.extname(entry.name).toLowerCase())
      ) {
        results.push(nextPath);
      }
    }

    return results.sort((left, right) => left.localeCompare(right));
  }

  return walk(referenceDir);
}

async function loadRuntimeSystemMd() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const systemPath = path.resolve(
    scriptDir,
    "../../../apps/nextjs/src/server/mcp/system.md",
  );

  try {
    return await readFile(systemPath, "utf8");
  } catch {
    return embeddedRuntimeSystemMd;
  }
}

async function loadDomInspectionSummary(domInspectionPath: string) {
  const raw = await readFile(
    path.resolve(process.cwd(), domInspectionPath),
    "utf8",
  );
  const parsed = JSON.parse(raw) as {
    styleSummary?: unknown;
  };

  return JSON.stringify(parsed.styleSummary ?? null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function assertNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function assertStringArray(value: unknown, label: string, maxLength: number) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  const strings = value.map((entry, index) =>
    assertString(entry, `${label}[${index}]`),
  );

  if (strings.length > maxLength) {
    throw new Error(`${label} must have at most ${maxLength} items.`);
  }

  return strings;
}

function parseSpecraConfig(value: unknown): SpecraConfig {
  if (!isRecord(value)) {
    throw new Error(".specra.json must contain an object.");
  }

  const outputs = isRecord(value.outputs)
    ? Object.fromEntries(
        Object.entries(value.outputs)
          .filter(
            ([key, entry]) =>
              artifactTypes.includes(key as ArtifactType) &&
              typeof entry === "string" &&
              entry.trim().length > 0,
          )
          .map(([key, entry]) => [key, entry.trim()]),
      )
    : undefined;

  return {
    outputs: outputs as Partial<Record<ArtifactType, string>> | undefined,
    outputsDir:
      typeof value.outputsDir === "string" && value.outputsDir.trim().length > 0
        ? value.outputsDir.trim()
        : undefined,
    projectId:
      typeof value.projectId === "string" && value.projectId.trim().length > 0
        ? value.projectId.trim()
        : undefined,
    projectName:
      typeof value.projectName === "string" &&
      value.projectName.trim().length > 0
        ? value.projectName.trim()
        : undefined,
    referencesDir:
      typeof value.referencesDir === "string" &&
      value.referencesDir.trim().length > 0
        ? value.referencesDir.trim()
        : undefined,
  };
}

function parseSelectionPoint(value: unknown, label: string) {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return {
    x: assertNumber(value.x, `${label}.x`),
    y: assertNumber(value.y, `${label}.y`),
  };
}

function parseSelectionBbox(value: unknown, label: string) {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error(`${label} must be an object or null.`);
  }

  return {
    height: assertNumber(value.height, `${label}.height`),
    width: assertNumber(value.width, `${label}.width`),
    x: assertNumber(value.x, `${label}.x`),
    y: assertNumber(value.y, `${label}.y`),
  };
}

function parseDiagnosisAssessment(value: unknown, label: string) {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  if (!["matches", "drifted"].includes(String(value.status))) {
    throw new Error(`${label}.status must be matches or drifted.`);
  }

  return {
    reason: assertString(value.reason, `${label}.reason`),
    status: value.status as "matches" | "drifted",
  };
}

function parseFinding(value: unknown, index: number) {
  const label = `findings[${index}]`;

  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  if (!["cohesion", "structure", "theme"].includes(String(value.category))) {
    throw new Error(`${label}.category must be cohesion, structure, or theme.`);
  }

  if (!["low", "medium", "high"].includes(String(value.severity))) {
    throw new Error(`${label}.severity must be low, medium, or high.`);
  }

  if (!isRecord(value.target)) {
    throw new Error(`${label}.target must be an object.`);
  }

  if (!["low", "medium", "high"].includes(String(value.target.confidence))) {
    throw new Error(`${label}.target.confidence must be low, medium, or high.`);
  }

  return {
    area: assertString(value.area, `${label}.area`),
    category: value.category as "cohesion" | "structure" | "theme",
    issue: assertString(value.issue, `${label}.issue`),
    recommendation: assertString(
      value.recommendation,
      `${label}.recommendation`,
    ),
    severity: value.severity as "low" | "medium" | "high",
    target: {
      confidence: value.target.confidence as "low" | "medium" | "high",
      selectionBbox: parseSelectionBbox(
        value.target.selectionBbox ?? null,
        `${label}.target.selectionBbox`,
      ),
      selectionPoint: parseSelectionPoint(
        value.target.selectionPoint,
        `${label}.target.selectionPoint`,
      ),
      targetHint: assertString(
        value.target.targetHint,
        `${label}.target.targetHint`,
      ),
    },
  };
}

function parsePreviewEvaluation(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Evaluation must be an object.");
  }

  if (!["accept", "tweak", "regenerate"].includes(String(value.nextAction))) {
    throw new Error("nextAction must be accept, tweak, or regenerate.");
  }

  if (
    !["aligned", "needs-refinement", "off-target"].includes(
      String(value.verdict),
    )
  ) {
    throw new Error(
      "verdict must be aligned, needs-refinement, or off-target.",
    );
  }

  if (!isRecord(value.scores)) {
    throw new Error("scores must be an object.");
  }

  const findings = Array.isArray(value.findings)
    ? value.findings.map((finding, index) => parseFinding(finding, index))
    : (() => {
        throw new Error("findings must be an array.");
      })();

  if (findings.length > 4) {
    throw new Error("findings must have at most 4 items.");
  }

  return {
    findings,
    first_glance_hierarchy_assessment: parseDiagnosisAssessment(
      value.first_glance_hierarchy_assessment,
      "first_glance_hierarchy_assessment",
    ),
    header_assessment: parseDiagnosisAssessment(
      value.header_assessment,
      "header_assessment",
    ),
    module_system_assessment: parseDiagnosisAssessment(
      value.module_system_assessment,
      "module_system_assessment",
    ),
    nextAction: value.nextAction as "accept" | "tweak" | "regenerate",
    primary_mismatch: assertString(value.primary_mismatch, "primary_mismatch"),
    product_mode_assessment: parseDiagnosisAssessment(
      value.product_mode_assessment,
      "product_mode_assessment",
    ),
    scores: {
      cohesion: assertNumber(value.scores.cohesion, "scores.cohesion"),
      structure: assertNumber(value.scores.structure, "scores.structure"),
      theme: assertNumber(value.scores.theme, "scores.theme"),
    },
    strengths: assertStringArray(value.strengths, "strengths", 3),
    summary: assertString(value.summary, "summary"),
    verdict: value.verdict as "aligned" | "needs-refinement" | "off-target",
  };
}

function parseMicroPolishEvaluation(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Evaluation must be an object.");
  }

  if (!["accept", "tweak"].includes(String(value.nextAction))) {
    throw new Error("nextAction must be accept or tweak.");
  }

  if (!["polished", "needs-micro-fixes"].includes(String(value.verdict))) {
    throw new Error("verdict must be polished or needs-micro-fixes.");
  }

  const findings = Array.isArray(value.findings)
    ? value.findings.map((finding, index) => {
        const parsedFinding = parseFinding(finding, index);

        if (!["low", "medium"].includes(parsedFinding.severity)) {
          throw new Error(`findings[${index}].severity must be low or medium.`);
        }

        return {
          ...parsedFinding,
          severity: parsedFinding.severity as "low" | "medium",
        };
      })
    : (() => {
        throw new Error("findings must be an array.");
      })();

  if (findings.length > 3) {
    throw new Error("findings must have at most 3 items.");
  }

  return {
    findings,
    nextAction: value.nextAction as "accept" | "tweak",
    strengths: assertStringArray(value.strengths, "strengths", 3),
    summary: assertString(value.summary, "summary"),
    verdict: value.verdict as "polished" | "needs-micro-fixes",
  };
}

function normalizeIterationContext(context?: Partial<IterationContext>) {
  return {
    ...defaultIterationContext,
    ...context,
  } satisfies IterationContext;
}

function buildEvaluationInputText(params: {
  analysisArtifacts: {
    designMd: string;
    themeCss: string;
  };
  focusAreas?: string[];
  iterationContext?: IterationContext;
  previewDomSummary?: string | null;
  taskDescription?: string;
}) {
  return [
    params.taskDescription
      ? `Task: ${params.taskDescription}`
      : "Task: General Specra alignment review.",
    params.iterationContext
      ? `Iteration context: broadRound=${params.iterationContext.broadRound}, microRound=${params.iterationContext.microRound}, bestQualityScore=${params.iterationContext.bestQualityScore ?? "unknown"}, previousQualityScore=${params.iterationContext.previousQualityScore ?? "unknown"}, nonImprovingBroadStreak=${params.iterationContext.nonImprovingBroadStreak ?? 0}`
      : "Iteration context: first screenshot review.",
    "",
    "[DESIGN.md]",
    params.analysisArtifacts.designMd,
    "",
    "[theme.css]",
    params.analysisArtifacts.themeCss,
    "",
    params.previewDomSummary
      ? ["[preview-dom-style-summary]", params.previewDomSummary, ""].join("\n")
      : "",
    params.focusAreas && params.focusAreas.length > 0
      ? `Focus areas: ${params.focusAreas.join(", ")}`
      : "Focus areas: whole-screen alignment and hierarchy.",
    "",
    "Use the screenshot as the implementation surface and DESIGN.md plus theme.css as the design source of truth.",
    "Keep issue and recommendation terse, precise, and directly actionable for the next edit.",
    "Judge visual language precisely: surface model, chrome character, density, accent discipline, and typography posture matter as much as overall layout.",
    "Compare module archetypes directly: icon or thumbnail tile rows, embedded lists, hero panels, tables, queues, and support stacks are not interchangeable.",
    "A matching shell is not enough if the module system or first-glance hierarchy shifts the screen into a different product mode.",
    "Return the diagnosis fields before the findings list, and use them to name the primary mismatch clearly.",
    "Be explicit about header mode, module family, first-glance hierarchy, and overall product mode instead of collapsing them into one generic cohesion note.",
    "Do not treat copied brand names, workspace labels, logos, avatar initials, or product-specific copy from the references as acceptable unless the user explicitly asked for exact brand recreation.",
    "Do not normalize opacity-modified semantic colors as harmless defaults. Slash-opacity should be exceptional, not the default way surfaces or text are toned down.",
    "Also judge product usefulness: decorative labels, ornamental badges, filler summary panels, and low-purpose modules count as real quality defects.",
    "If broadRound is 2 or higher, prefer localized deltas over generic hierarchy advice unless a named region still clearly violates the shell contract.",
  ].join("\n");
}

function getEvaluationOutputContract(mode: "broad" | "micro") {
  if (mode === "broad") {
    return {
      first_glance_hierarchy_assessment: {
        reason: "string",
        status: "matches | drifted",
      },
      findings: [
        {
          area: "string",
          category: "cohesion | structure | theme",
          issue: "string",
          recommendation: "string",
          severity: "low | medium | high",
          target: {
            confidence: "low | medium | high",
            selectionBbox:
              {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
              } | null,
            selectionPoint: {
              x: 0,
              y: 0,
            },
            targetHint: "string",
          },
        },
      ],
      header_assessment: {
        reason: "string",
        status: "matches | drifted",
      },
      module_system_assessment: {
        reason: "string",
        status: "matches | drifted",
      },
      nextAction: "accept | tweak | regenerate",
      primary_mismatch: "string",
      product_mode_assessment: {
        reason: "string",
        status: "matches | drifted",
      },
      scores: {
        cohesion: 0,
        structure: 0,
        theme: 0,
      },
      strengths: ["string"],
      summary: "string",
      verdict: "aligned | needs-refinement | off-target",
    };
  }

  return {
    findings: [
      {
        area: "string",
        category: "cohesion | structure | theme",
        issue: "string",
        recommendation: "string",
        severity: "low | medium",
        target: {
          confidence: "low | medium | high",
          selectionBbox:
            {
              x: 0,
              y: 0,
              width: 0,
              height: 0,
            } | null,
          selectionPoint: {
            x: 0,
            y: 0,
          },
          targetHint: "string",
        },
      },
    ],
    nextAction: "accept | tweak",
    strengths: ["string"],
    summary: "string",
    verdict: "polished | needs-micro-fixes",
  };
}

async function prepareEvaluationBundle(params: {
  command: "prepare-broad" | "prepare-micro";
  domInspectionPath?: string;
  focusAreas?: string[];
  iterationContext?: Partial<IterationContext>;
  iterationContextPath?: string;
  repoPath: string;
  screenshotPath: string;
  taskDescription?: string;
}) {
  const repoPath = path.resolve(process.cwd(), params.repoPath);
  const config = await findSpecraConfig(repoPath);
  const iterationContext = params.iterationContext
    ? normalizeIterationContext(params.iterationContext)
    : params.iterationContextPath
      ? normalizeIterationContext(
          JSON.parse(
            await readFile(
              path.resolve(process.cwd(), params.iterationContextPath),
              "utf8",
            ),
          ) as Partial<IterationContext>,
        )
      : normalizeIterationContext();

  const [designMd, themeCss, runtimeSystemMd] = await Promise.all([
    readFile(resolveArtifactPath(repoPath, config, "design-md"), "utf8"),
    readFile(resolveArtifactPath(repoPath, config, "theme-css"), "utf8"),
    loadRuntimeSystemMd(),
  ]);

  const referencesDir = path.resolve(
    repoPath,
    config.referencesDir ?? ".specra/references",
  );
  const referenceImagePaths = (
    await collectReferenceImages(referencesDir)
  ).slice(0, 4);
  const previewDomSummary = params.domInspectionPath
    ? await loadDomInspectionSummary(params.domInspectionPath)
    : null;
  const mode = params.command === "prepare-broad" ? "broad" : "micro";
  const systemPrompt =
    mode === "broad"
      ? `${runtimeSystemMd}\n\n${broadEvaluationPrompt}`
      : `${runtimeSystemMd}\n\n${microPolishPrompt}`;

  return {
    completion_gate: {
      note: "A Specra alignment claim is only permitted after a local run or guide command writes a current local eval artifact for this repo.",
      status_artifact_path: getLocalEvalStatusPath(repoPath),
    },
    expected_output_contract: getEvaluationOutputContract(mode),
    instructions:
      "Ask the client LLM to read this bundle, open the screenshot and local reference images, and return only JSON matching expected_output_contract.",
    mode,
    reference_image_paths: referenceImagePaths,
    screenshot_path: path.resolve(process.cwd(), params.screenshotPath),
    system_prompt: systemPrompt,
    user_prompt: buildEvaluationInputText({
      analysisArtifacts: {
        designMd,
        themeCss,
      },
      focusAreas: params.focusAreas,
      iterationContext,
      previewDomSummary,
      taskDescription: params.taskDescription,
    }),
  };
}

async function guideEvaluation(params: {
  command: "guide-broad" | "guide-micro";
  evaluation?: unknown;
  evaluationPath: string;
  iterationContextPath?: string;
  repoPath: string;
}) {
  const parsedEvaluation =
    params.evaluation ?? (await readEvaluationJson(params.evaluationPath));
  const iterationContext = params.iterationContextPath
    ? normalizeIterationContext(
        JSON.parse(
          await readFile(
            path.resolve(process.cwd(), params.iterationContextPath),
            "utf8",
          ),
        ) as Partial<IterationContext>,
      )
    : normalizeIterationContext();

  if (params.command === "guide-broad") {
    const evaluation = parsePreviewEvaluation(parsedEvaluation);
    const guidance = buildPreviewIterationGuidance(
      evaluation,
      iterationContext,
    );
    const repoPath = path.resolve(process.cwd(), params.repoPath);
    const localEvalArtifact = {
      alignmentClaim:
        guidance.iterationPlan.nextStep === "verify-preview-and-recapture"
          ? {
              allowed: false,
              reason:
                "The preview must be verified and recaptured before a visual alignment claim is trustworthy.",
              status: "blocked-verify-preview" as const,
            }
          : guidance.iterationPlan.nextStep === "revert-to-best"
            ? {
                allowed: false,
                reason:
                  "The latest screenshot regressed from a stronger prior candidate, so alignment cannot be claimed from this pass.",
                status: "blocked-revert-to-best" as const,
              }
            : evaluation.verdict === "off-target"
              ? {
                  allowed: false,
                  reason:
                    "The latest screenshot is still off-target relative to the current Specra handoff.",
                  status: "blocked-off-target" as const,
                }
              : guidance.iterationPlan.nextStep !== "stop" ||
                  guidance.shouldContinue
                ? {
                    allowed: false,
                    reason:
                      "The broad screenshot loop is still active, so a Specra alignment claim would be premature.",
                    status: "blocked-continue-loop" as const,
                  }
                : {
                    allowed: false,
                    reason:
                      "A broad screenshot evaluation alone does not permit a Specra alignment claim. Run at least one micro-polish screenshot pass and write a current micro evaluation artifact first.",
                    status: "blocked-needs-micro-polish" as const,
                  },
      completedAt: new Date().toISOString(),
      evaluationPath:
        params.evaluationPath === "-"
          ? "stdin"
          : path.resolve(process.cwd(), params.evaluationPath),
      iterationNextStep: guidance.iterationPlan.nextStep,
      loopDecision: guidance.loopDecision,
      mode: "broad" as const,
      qualityScore: guidance.qualityScore,
      shouldContinue: guidance.shouldContinue,
      verdict: evaluation.verdict,
      version: 1 as const,
    };
    const localEvalStatusArtifactPath = await writeLocalEvalStatusArtifact(
      repoPath,
      localEvalArtifact,
    );

    return {
      ...evaluation,
      agentInstruction: guidance.agentInstruction,
      iteration_guidance: guidance,
      iteration_plan: guidance.iterationPlan,
      local_eval_status_artifact_path: localEvalStatusArtifactPath,
      loopDecision: guidance.loopDecision,
      next_iteration_context: guidance.nextIterationContext,
      qualityScore: guidance.qualityScore,
      shouldContinue: guidance.shouldContinue,
    };
  }

  const evaluation = parseMicroPolishEvaluation(parsedEvaluation);
  const guidance = buildMicroPolishIterationGuidance(
    evaluation,
    iterationContext,
  );
  const repoPath = path.resolve(process.cwd(), params.repoPath);
  const localEvalArtifact = {
    alignmentClaim:
      guidance.iterationPlan.nextStep === "revert-to-best"
        ? {
            allowed: false,
            reason:
              "The latest micro-polish pass regressed from a stronger prior candidate, so alignment cannot be claimed from this pass.",
            status: "blocked-revert-to-best" as const,
          }
        : evaluation.verdict === "polished" &&
            guidance.iterationPlan.nextStep === "stop"
          ? {
              allowed: true,
              reason:
                "A current local Specra micro-polish evaluation permits a visual alignment claim.",
              status: "verified-locally" as const,
            }
          : guidance.iterationPlan.nextStep !== "stop" ||
              guidance.shouldContinue
            ? {
                allowed: false,
                reason:
                  "The micro-polish loop is still active, so a Specra alignment claim would be premature.",
                status: "blocked-continue-loop" as const,
              }
            : {
                allowed: false,
                reason:
                  "The latest micro-polish evaluation still reports visible cleanup work.",
                status: "blocked-needs-refinement" as const,
              },
    completedAt: new Date().toISOString(),
    evaluationPath:
      params.evaluationPath === "-"
        ? "stdin"
        : path.resolve(process.cwd(), params.evaluationPath),
    iterationNextStep: guidance.iterationPlan.nextStep,
    loopDecision: guidance.loopDecision,
    mode: "micro" as const,
    qualityScore: guidance.qualityScore,
    shouldContinue: guidance.shouldContinue,
    verdict: evaluation.verdict,
    version: 1 as const,
  };
  const localEvalStatusArtifactPath = await writeLocalEvalStatusArtifact(
    repoPath,
    localEvalArtifact,
  );

  return {
    ...evaluation,
    agentInstruction: guidance.agentInstruction,
    iteration_guidance: guidance,
    iteration_plan: guidance.iterationPlan,
    local_eval_status_artifact_path: localEvalStatusArtifactPath,
    loopDecision: guidance.loopDecision,
    next_iteration_context: guidance.nextIterationContext,
    qualityScore: guidance.qualityScore,
    shouldContinue: guidance.shouldContinue,
  };
}

function extractRunFindings(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.findings)) {
    return [];
  }

  return value.findings
    .filter(isRecord)
    .slice(0, 3)
    .map((finding) => ({
      area: typeof finding.area === "string" ? finding.area : "unknown",
      issue: typeof finding.issue === "string" ? finding.issue : "",
      recommendation:
        typeof finding.recommendation === "string"
          ? finding.recommendation
          : "",
      severity:
        typeof finding.severity === "string" ? finding.severity : "unknown",
    }));
}

function buildRunStatus(params: {
  captures: string[];
  guideResult: Record<string, unknown>;
  mode: "broad" | "micro";
}) {
  const iterationPlan = isRecord(params.guideResult.iteration_plan)
    ? params.guideResult.iteration_plan
    : null;
  const nextStep =
    typeof iterationPlan?.nextStep === "string"
      ? iterationPlan.nextStep
      : typeof params.guideResult.loopDecision === "string"
        ? params.guideResult.loopDecision
        : "unknown";

  return {
    captures: params.captures,
    local_eval_status_artifact_path:
      params.guideResult.local_eval_status_artifact_path ?? null,
    mode: params.mode,
    nextStep,
    qualityScore:
      typeof params.guideResult.qualityScore === "number"
        ? params.guideResult.qualityScore
        : null,
    shouldContinue:
      typeof params.guideResult.shouldContinue === "boolean"
        ? params.guideResult.shouldContinue
        : true,
    topFindings: extractRunFindings(params.guideResult),
    verdict:
      typeof params.guideResult.verdict === "string"
        ? params.guideResult.verdict
        : "unknown",
  };
}

async function runEvaluationCommand(params: {
  domInspectionPath?: string;
  evaluationPath?: string;
  focusAreas?: string[];
  height: number;
  htmlFile?: string;
  iterationContextPath?: string;
  mode: "broad" | "micro";
  repoPath: string;
  screenshotPath?: string;
  scrollY: number;
  taskDescription?: string;
  url?: string;
  waitMs: number;
  width: number;
}) {
  const repoPath = path.resolve(process.cwd(), params.repoPath);
  const captures: string[] = [];

  if (!params.evaluationPath) {
    const capture = await captureForRun({
      height: params.height,
      htmlFile: params.htmlFile,
      mode: params.mode,
      repoPath,
      screenshotPath: params.screenshotPath,
      scrollY: params.scrollY,
      url: params.url,
      waitMs: params.waitMs,
      width: params.width,
    });
    captures.push(capture.screenshotPath);

    const bundle = await prepareEvaluationBundle({
      command: params.mode === "broad" ? "prepare-broad" : "prepare-micro",
      domInspectionPath: params.domInspectionPath,
      focusAreas: params.focusAreas,
      iterationContextPath: params.iterationContextPath,
      repoPath,
      screenshotPath: capture.screenshotPath,
      taskDescription: params.taskDescription,
    });

    return {
      capture: capture.capture,
      captures,
      evaluation_request: bundle,
      mode: params.mode,
      nextCommand:
        params.mode === "broad"
          ? "Return broad JSON matching expected_output_contract, then rerun this same command with --mode broad --evaluation <path-or->."
          : "Return micro-polish JSON matching expected_output_contract, then rerun this same command with --mode micro --evaluation <path-or->.",
      nextStep: params.mode === "broad" ? "evaluate-broad" : "evaluate-micro",
      status: "needs-client-evaluation",
    };
  }

  const guideResult = (await guideEvaluation({
    command: params.mode === "broad" ? "guide-broad" : "guide-micro",
    evaluationPath: params.evaluationPath,
    iterationContextPath: params.iterationContextPath,
    repoPath,
  })) as Record<string, unknown>;

  const runStatus = buildRunStatus({
    captures,
    guideResult,
    mode: params.mode,
  });

  if (
    params.mode === "broad" &&
    isRecord(guideResult.iteration_guidance) &&
    guideResult.iteration_guidance.shouldRunMicroPolish === true
  ) {
    const capture = await captureForRun({
      height: params.height,
      htmlFile: params.htmlFile,
      mode: "micro",
      repoPath,
      screenshotPath:
        params.url || params.htmlFile ? undefined : params.screenshotPath,
      scrollY: params.scrollY,
      url: params.url,
      waitMs: params.waitMs,
      width: params.width,
    });
    captures.push(capture.screenshotPath);

    const nextContext = isRecord(guideResult.next_iteration_context)
      ? (guideResult.next_iteration_context as Partial<IterationContext>)
      : undefined;
    const guidance = isRecord(guideResult.iteration_guidance)
      ? guideResult.iteration_guidance
      : null;
    const suggestedFocusAreas = Array.isArray(guidance?.suggestedFocusAreas)
      ? guidance.suggestedFocusAreas.filter(
          (value): value is string => typeof value === "string",
        )
      : undefined;
    const bundle = await prepareEvaluationBundle({
      command: "prepare-micro",
      domInspectionPath: params.domInspectionPath,
      focusAreas: params.focusAreas ?? suggestedFocusAreas,
      iterationContext: nextContext,
      repoPath,
      screenshotPath: capture.screenshotPath,
      taskDescription: params.taskDescription,
    });

    return {
      ...runStatus,
      capture: capture.capture,
      captures,
      evaluation_request: bundle,
      mode: "micro",
      nextCommand:
        "Return micro-polish JSON matching expected_output_contract, then rerun this same command with --mode micro --evaluation <path-or->.",
      nextStep: "evaluate-micro",
      status: "needs-client-evaluation",
    };
  }

  return {
    ...runStatus,
    blockingFindings:
      runStatus.shouldContinue || runStatus.mode !== "micro"
        ? runStatus.topFindings
        : [],
    status:
      !runStatus.shouldContinue &&
      runStatus.mode === "micro" &&
      runStatus.verdict === "polished"
        ? "verified"
        : runStatus.shouldContinue
          ? "continue"
          : "blocked",
    warnings:
      runStatus.mode === "broad" && !runStatus.shouldContinue
        ? [
            "Broad evaluation alone does not permit an alignment claim. Run the micro-polish pass when requested by the broad result.",
          ]
        : [],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.command;

  if (command === "run") {
    if (!args.repo) {
      throw new Error("--repo is required.");
    }

    const mode =
      args.mode === "micro" || args.mode === "broad"
        ? args.mode
        : args.mode
          ? (() => {
              throw new Error("--mode must be broad or micro.");
            })()
          : "broad";
    const result = await runEvaluationCommand({
      domInspectionPath: args["dom-inspection"],
      evaluationPath: args.evaluation,
      focusAreas: args["focus-areas"]
        ? args["focus-areas"]
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined,
      height:
        parsePositiveInteger(args.height, "--height") ?? defaultViewport.height,
      htmlFile: args["html-file"],
      iterationContextPath: args["iteration-context"],
      mode,
      repoPath: args.repo,
      screenshotPath: args.screenshot,
      scrollY: parseNonNegativeInteger(args["scroll-y"], "--scroll-y") ?? 0,
      taskDescription: args.task,
      url: args.url,
      waitMs:
        parsePositiveInteger(args["wait-ms"], "--wait-ms") ??
        defaultViewport.waitMs,
      width:
        parsePositiveInteger(args.width, "--width") ?? defaultViewport.width,
    });

    await writeOutput(args.out, result);
    return;
  }

  if (command === "prepare-broad" || command === "prepare-micro") {
    if (!args.repo) {
      throw new Error("--repo is required.");
    }

    if (!args.screenshot) {
      throw new Error("--screenshot is required.");
    }

    const result = await prepareEvaluationBundle({
      command,
      domInspectionPath: args["dom-inspection"],
      focusAreas: args["focus-areas"]
        ? args["focus-areas"]
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined,
      iterationContextPath: args["iteration-context"],
      repoPath: args.repo,
      screenshotPath: args.screenshot,
      taskDescription: args.task,
    });

    await writeOutput(args.out, result);
    return;
  }

  if (command === "guide-broad" || command === "guide-micro") {
    if (!args.repo) {
      throw new Error("--repo is required.");
    }

    if (!args.evaluation) {
      throw new Error("--evaluation is required.");
    }

    const result = await guideEvaluation({
      command,
      evaluationPath: args.evaluation,
      iterationContextPath: args["iteration-context"],
      repoPath: args.repo,
    });

    await writeOutput(args.out, result);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Local evaluation loop failed.",
  );
  process.exit(1);
});
