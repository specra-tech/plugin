---
name: local-preview
description: Discover or verify a local app preview for Specra screenshot evaluation and code iteration, using `.specra.json`, repo scripts, and common local URLs before broader browser feedback work begins.
---

# Local Preview

Use this skill when the user needs a working local preview for Specra screenshot evaluation, code iteration, or future browser/computer-use loops.

Typical requests:

- set up a local preview for Specra
- what URL should Specra use locally
- how do I run this app for evaluation
- verify the local app is up

Do not use this skill for UI generation itself unless preview setup is the blocking issue.

## Goal

Identify one reliable local preview URL and, when needed, one reliable start command.

## Preferred order

1. Check repo-root `.specra.json`.
2. If present, prefer:

```json
{
  "projectId": "7a4b8e9b-5f49-4b4d-a612-e870c2d529e6",
  "previewUrl": "http://localhost:3000",
  "devCommand": "bun dev:next"
}
```

3. If `previewUrl` is missing, inspect repo scripts and framework conventions.
4. If `devCommand` is missing, infer the smallest likely command from repo scripts.
5. Check common local URLs if needed:
   - `http://localhost:3000`
   - `http://127.0.0.1:3000`
   - `http://localhost:3001`
   - `http://localhost:5173`

## Script discovery

Look for likely preview commands in this order:

- root `package.json` scripts
- app-level package scripts when the repo is monorepo-based
- framework-default commands such as:
  - `bun dev:next`
  - `bun dev`
  - `next dev`
  - `vite`

Prefer the narrowest command that starts the relevant web app.

## Plugin script paths

Specra local scripts are part of this plugin. Resolve script paths relative to this `SKILL.md`, not relative to the target app or repo cwd:

- `../scripts/capture-preview.mjs`
- `../scripts/local-evaluate-loop.ts`
- `../scripts/inspect-preview.mjs`

Use these plugin scripts for capture, evaluation, and inspection. Do not replace them with package-runner fallbacks or ad hoc Playwright commands. It is fine to run the resolved plugin script while your shell cwd is the target repo so outputs like `.specra/captures/top.png` land in the repo.

## Verification

Success means:

- a preview URL is known
- the app is reachable there
- the command to start it is known if it was not already running

Before the first local screenshot capture on a machine, proactively tell the user:

- `Install Playwright locally in the target repo and install Chromium through the local Playwright binary. Do not use package-runner fallbacks as the Specra capture path.`

When screenshot-based evaluation is needed for a local preview, prefer a local capture step first:

- run `../scripts/local-evaluate-loop.ts run --repo <repoPath> --url <previewUrl>` with the chosen `previewUrl`
- then ask the client LLM for JSON matching the returned `expected_output_contract`
- then rerun `../scripts/local-evaluate-loop.ts run --repo <repoPath> --url <previewUrl> --mode broad --evaluation <path-or->` so the repo-local evaluation artifact is written and any micro-polish request is produced
- do not run global filesystem searches such as `find $HOME -path '*capture-preview.mjs'`; use the known Specra script path directly
- capture viewport frames only; do not use full-page screenshots or oversized desktop viewports for app or dashboard UI
- default captures to `1320x800` unless matching the user's reported visible browser viewport; do not use `900px`-plus or `1200px`-tall captures for normal dashboard review
- if the issue is below the fold, capture an additional viewport frame with `--scroll-y <cssPixels>` instead of compressing the full page into one image

Keep the screenshot loop local:

- capture and evaluate locally with `../scripts/local-evaluate-loop.ts run`
- require the local run command to write the repo-local evaluation artifact before claiming Specra alignment
- do not use `curl`, raw HTML output, or `HTTP 200 OK` as visual verification; use those only to confirm the route responds before capturing a screenshot

If it is not running:

- report the best command to start it
- do not invent extra infrastructure
- keep the setup path minimal

## Rules

- Prefer `.specra.json` over guesswork when it contains preview metadata.
- Prefer `http://localhost:3000` as the default assumption.
- If multiple apps exist, choose the most likely web UI surface and say that choice explicitly.
- Keep the output actionable: URL, command, and whether the preview is currently reachable.
- For localhost previews, prefer local screenshot capture on the user machine over server-side preview capture.
