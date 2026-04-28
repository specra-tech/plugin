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

The primary end-to-end workflow is `specra-generate`.

## Opinionated implementation path

Specra's MCP and bundled skills are intentionally opinionated. For UI generation, refinement, and evaluation, they expect TailwindCSS and shadcn/ui as the implementation stack.

That opinion applies to agent workflows, not to the public artifacts themselves. Users can still download `DESIGN.md` and `theme.css` and apply them manually in another stack. The plugin chooses TailwindCSS and shadcn/ui so agents have a predictable path for semantic tokens, shared primitives, screenshot evaluation, and code-level drift checks.

## Included workflows

This plugin includes skills for:

- `specra-generate`: default end-to-end UI generation and refinement flow
- `evaluate-ui`: screenshot-based evaluation of an implemented screen
- `fix-ui-drift`: targeted repair when the UI is close but off-hand-off
- `connect-project`: verify repo connection and project readiness
- `local-preview`: discover or verify the local preview used for evaluation
- `map-ui-to-code`: map visible UI regions back to source files
- `region-targeting`: resolve a selected preview region into a concrete code target

## Best fit

Specra is a good fit when you want an agent to:

- build a screen from reference material
- refine an existing interface without losing the product’s visual language
- validate UI changes against a grounded handoff
- turn screenshot feedback into concrete code edits

It is not primarily a general-purpose design inspiration tool. It is for implementation-grounded UI work.

## Example prompts

- Use `specra-generate` to build a dashboard that matches this project’s references
- Evaluate this implemented screen against the current Specra handoff
- Tighten this UI to match the project’s extracted design system
- Map this visible panel back to the source component

## Local screenshot evaluation

Some workflows rely on local screenshot capture for visual verification. If needed, install Playwright Chromium once on the machine using your preferred package runner, for example:

```bash
bunx playwright install chromium
```

Specra captures app screens as viewport frames, not full-page screenshots. The default capture viewport is `1320x800`; oversized desktop heights such as `900px` and `1200px` are rejected unless explicitly allowed because they create the same misleading scaled-preview effect as full-page screenshots. For below-the-fold content, capture additional frames at explicit scroll offsets instead of compressing the full page into one image.

## Plugin surfaces

This package includes plugin manifests for supported clients and a shared MCP configuration used by the Specra workflows.
