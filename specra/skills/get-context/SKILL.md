---
name: get-context
description: Load and verify Specra project context, confirm `.specra.json`, and check that the target project has a current DESIGN.md plus theme.css extraction before UI work begins.
---

# Get Context

Use this skill when the user needs project context for Specra work.

## Goal

Leave the agent with enough repo-local and Specra context to start UI work reliably.

That means:

- the repo has a valid root `.specra.json`
- the project ID is correct
- if present, `previewUrl` and `devCommand` are sensible
- Specra MCP is reachable
- the project has at least one successful extraction
- the latest revision contains both current public artifacts:
  - `DESIGN.md`
  - `theme.css`
- the repo is ready for TailwindCSS + shadcn/ui implementation

## Workflow

1. Check for a repo-root `.specra.json`.
2. If missing, ask the user for the Specra project ID or tell them to add:

```json
{
  "projectId": "7a4b8e9b-5f49-4b4d-a612-e870c2d529e6",
  "previewUrl": "http://localhost:3000",
  "devCommand": "bun dev:next"
}
```

3. Confirm the project ID looks valid and is used as `project_id` for Specra tool calls.
4. If `previewUrl` or `devCommand` exists, confirm it matches the repo's likely local setup.
5. Inspect the repo for TailwindCSS and shadcn/ui readiness.
6. If the repo is established and either dependency is missing, tell the user Specra requires them and ask for approval to install them before any UI implementation work begins.
7. If the repo is greenfield or nearly empty, plan to scaffold with TailwindCSS and shadcn/ui by default.
8. If the latest revision is missing either required artifact, tell the user to rerun analysis before UI generation work begins.
9. If deterministic UI mapping is planned, add or verify stable `data-specra-id` markers on important UI regions.

## Durable agent instructions

If the user asks for durable setup, create or update `.specra/agent-instructions.md` with repo-local guidance:

```md
# Specra Agent Instructions

This repo is connected to Specra through `.specra.json`.

For UI generation, UI refinement, visual evaluation, screenshot comparison, component implementation, or screen work:

- Read `.specra.json`.
- Use `projectId` as the Specra project ID unless the user explicitly provides another one.
- Call `specra_load_project_context` before writing UI code.
- Treat `DESIGN.md` and `theme.css` as the current design handoff.
- Reuse existing shadcn/ui primitives first.
- Add missing common primitives through the repo's shadcn CLI path instead of hand-writing replacements.
- Preserve default shadcn primitive sizing unless the user explicitly asks for a different component size.
- Run `specra_validate_generated_ui` and a current local screenshot evaluation before claiming alignment.
```

If the repo has an agent instruction file such as `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md`, add a short pointer to `.specra/agent-instructions.md` instead of duplicating the full guidance:

```md
For Specra-connected UI work, read `.specra/agent-instructions.md` and load the Specra project context from `.specra.json` before implementation.
```

## Rules

- Treat `.specra.json` as the default source of truth for `project_id`.
- Prefer `.specra.json` for preview setup when `previewUrl` or `devCommand` is present.
- Treat `.specra/agent-instructions.md` as optional durable guidance, not as a requirement for every context load.
- If MCP auth fails, report that clearly before blaming the project data.
- If the revision is outdated, be explicit that the project must be reanalyzed.
- Do not let the workflow continue into CSS-first implementation when TailwindCSS + shadcn/ui are the required stack.
