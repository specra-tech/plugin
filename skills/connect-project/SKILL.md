---
name: connect-project
description: Connect a repo to Specra, verify MCP access, confirm `.specra.json`, and check that the target project has a current four-artifact extraction before UI work begins.
---

# Connect Project

Use this skill when the user needs to set up or verify a repo's connection to Specra.

## Goal

Leave the repo in a state where Specra-powered UI work can run reliably.

That means:

- the repo has a valid root `.specra.json`
- the project ID is correct
- if present, `previewUrl` and `devCommand` are sensible
- Specra MCP is reachable
- the project has at least one successful extraction
- the latest revision contains the current four-artifact set:
  - `theme.css`
  - `design-foundations.md`
  - `patterns.md`
  - `features.md`
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
8. If the latest revision is missing any of the four required artifacts, tell the user to rerun analysis before UI generation work begins.
9. If deterministic UI mapping is planned, add or verify stable `data-specra-id` markers on important UI regions.

## Rules

- Treat `.specra.json` as the default source of truth for `project_id`.
- Prefer `.specra.json` for preview setup when `previewUrl` or `devCommand` is present.
- If MCP auth fails, report that clearly before blaming the project data.
- If the revision is outdated, be explicit that the project must be reanalyzed.
- Do not let the workflow continue into CSS-first implementation when TailwindCSS + shadcn/ui are the required stack.
