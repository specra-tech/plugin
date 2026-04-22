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

## Verification

Success means:

- a preview URL is known
- the app is reachable there
- the command to start it is known if it was not already running

Before the first local screenshot capture on a machine, proactively tell the user:

- `Install Playwright Chromium once on this machine with the package runner that matches the user's setup, such as npx, pnpm dlx, bunx, or yarn dlx.`

When screenshot-based evaluation is needed for a local preview, prefer a local capture step first:

- run `../../scripts/capture-preview.mjs` with the chosen `previewUrl`
- then run `../../scripts/local-evaluate-loop.ts prepare-broad` with the resulting absolute screenshot path
- then run `../../scripts/local-evaluate-loop.ts guide-broad --repo <repoPath>` after the client LLM returns the required JSON so the repo-local evaluation artifact is written
- do not run global filesystem searches such as `find $HOME -path '*capture-preview.mjs'`; use the known Specra script path directly

Keep the screenshot loop local:

- capture locally with `../../scripts/capture-preview.mjs`
- keep evaluation local with `../../scripts/local-evaluate-loop.ts`
- require the local guide command to write the repo-local evaluation artifact before claiming Specra alignment
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
