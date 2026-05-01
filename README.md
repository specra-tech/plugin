# Specra

Specra helps agents build and refine UI from reference screenshots with grounded MCP workflows.

This repository is automatically generated.

It is designed for product and frontend work where visual quality matters: matching an existing design system, tightening an implemented screen, or generating a new surface that stays aligned with real references instead of drifting into generic output.

## What Specra does

Specra gives agents a structured UI workflow:

- connect a repo to a Specra project
- load the current design handoff
- generate or refine UI in code
- validate the result against the handoff
- use local screenshot-based evaluation before closing out

The primary end-to-end workflow is `implement-ui`.

## Opinionated implementation path

Specra's MCP and bundled skills are intentionally opinionated. For UI generation, refinement, and evaluation, they expect TailwindCSS and shadcn/ui as the implementation stack.

That opinion applies to agent workflows, not to the public artifacts themselves. Users can still download `DESIGN.md` and `theme.css` and apply them manually in another stack. The plugin chooses TailwindCSS and shadcn/ui so agents have a predictable path for semantic tokens, shared primitives, screenshot evaluation, and code-level drift checks.

## Included workflows

This plugin includes skills for:

- `implement-ui`: default end-to-end UI generation and refinement flow
- `evaluate-ui`: screenshot-based evaluation of an implemented screen
- `get-context`: verify repo connection, project readiness, and current handoff context
- `map-ui-to-code`: map visible UI regions, selected regions, points, or bounding boxes back to source files

## Best fit

Specra is a good fit when you want an agent to:

- build a screen from reference material
- refine an existing interface without losing the product’s visual language
- validate UI changes against a grounded handoff
- turn screenshot feedback into concrete code edits

It is not primarily a general-purpose design inspiration tool. It is for implementation-grounded UI work.

## Example prompts

- Use `implement-ui` to build a dashboard that matches this project’s references
- Evaluate this implemented screen against the current Specra handoff
- Tighten this UI to match the project’s extracted design system
- Map this visible panel back to the source component

## Local screenshot evaluation

When Codex Browser Use / the in-app browser is available and ready, prefer it for live preview inspection: open localhost, confirm the intended route and theme, interact with visible states, and orient localized fixes. Use Computer Use only when the in-app browser is unavailable, blocked, or the task requires desktop-app interaction. Use Playwright-backed plugin capture only as a last resort for inspection, or when producing the required repo-local evaluation artifact and no Browser Use or Computer Use screenshot is available. Browser Use or Computer Use inspection is not the final alignment gate by itself; Specra still requires a current repo-local evaluation artifact before an agent claims visual alignment.

Some workflows still rely on local screenshot capture for visual verification. If needed, install Playwright Chromium once on the machine using your preferred package runner, for example:

```bash
bunx playwright install chromium
```

Specra captures app screens as viewport frames, not full-page screenshots. The default capture viewport is `1320x800`; oversized desktop heights such as `900px` and `1200px` are rejected unless explicitly allowed because they create the same misleading scaled-preview effect as full-page screenshots. For below-the-fold content, capture additional frames at explicit scroll offsets instead of compressing the full page into one image. If Browser Use or Computer Use provides a saved screenshot path, the local evaluator can consume that screenshot directly; otherwise use the normal local capture path.

## Plugin surfaces

This package includes plugin manifests for supported clients and a shared MCP configuration used by the Specra workflows.
