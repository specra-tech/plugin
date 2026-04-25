---
name: build-ui-from-references
description: Legacy alias for specra-generate. Use when older prompts refer to this skill name, but prefer specra-generate as the primary end-to-end Specra workflow.
---

# Build UI from References

This is a compatibility alias for `specra-generate`.

Prefer `specra-generate` for new work. Use this skill when:

- build a screen from project references
- extend an existing on-brand product surface
- validate or tighten UI against the extracted design system
- older prompts or agents explicitly refer to `build-ui-from-references`

Do not use this skill for non-UI work or for repos that are not connected to Specra.

For the actual workflow, follow the same end-to-end generation loop as `../specra-generate/SKILL.md`.
If you only read this file, apply the same rules below as if you had loaded `specra-generate`.

Important current rules from `specra-generate`:

- If `.specra.json` exists, load Specra context before writing UI code. Do not wait for the user to ask separately in a new chat.
- Read `.specra/agent-instructions.md` when present.
- Reuse shadcn primitives or add missing ones through the repo's CLI path; do not hand-write fallbacks.
- If a prompt allows plain CSS but also triggers Specra, follow Specra and scaffold TailwindCSS plus shadcn/ui.
- Preserve default shadcn primitive sizing unless the user explicitly asks for a different component size.
- Do not add `h-14`, `h-16`, `px-8`, `py-4`, `text-lg`, or `rounded-full` to Button, Input, Badge, or Card roots as a styling shortcut.
- Make the UI smaller and tighter than your first instinct. Step typography, spacing, controls, tiles, and icons down one Tailwind size before screenshot evaluation unless the reference clearly supports the larger scale.
- Close out with the loaded project ID, artifact status, shadcn primitive provenance, code validation result, and local screenshot evaluation gate status.

## Project discovery

Before calling Specra tools, check for a repo-root `.specra.json`.

Expected shape:

```json
{
  "projectId": "7a4b8e9b-5f49-4b4d-a612-e870c2d529e6",
  "previewUrl": "http://localhost:3000",
  "devCommand": "bun dev:next"
}
```

Rules:

- If `.specra.json` exists, use `projectId` as `project_id`.
- If `previewUrl` exists, treat it as the default local preview target.
- If `devCommand` exists, treat it as the preferred start command.
- If the file is missing, ask the user for the project ID or tell them to add it.

## Plugin script paths

Specra local scripts are part of this plugin. Resolve script paths relative to this `SKILL.md`, not relative to the target app or repo cwd:

- `../scripts/capture-preview.mjs`
- `../scripts/local-evaluate-loop.ts`
- `../scripts/inspect-preview.mjs`

Use these plugin scripts for capture, evaluation, and inspection. Do not replace them with package-runner fallbacks or ad hoc Playwright commands. It is fine to run the resolved plugin script while your shell cwd is the target repo so outputs like `.specra/captures/top.png` land in the repo.

## Implementation gate

Before writing or scaffolding UI code, inspect the repo and classify it:

- `established repo`
  - existing app code, established styling conventions, or shared components already present
- `greenfield repo`
  - empty shell, minimal scaffold, or no meaningful app implementation yet

Then apply these rules:

- TailwindCSS and shadcn/ui are required for Specra implementation work.
- If the repo is established and TailwindCSS or shadcn/ui is missing, prompt the user to install the missing requirement before continuing.
- If the user refuses, stop and do not scaffold or implement the UI anyway.
- If the repo is greenfield or nearly empty, scaffold with TailwindCSS and shadcn/ui by default.
- Before writing bespoke UI primitives, inspect what shadcn components already exist in the repo and reuse them.
- If a common primitive is missing, add it through the repo's shadcn CLI path instead of hand-writing a local replacement.
- In this repo, prefer shared `@specra/ui` components first. If a shared primitive is missing, add it through the `bun ui-add` / `packages/ui` flow rather than generating a one-off `button.tsx`, `card.tsx`, or similar file in app code.
- Treat hand-written replacements for common shadcn primitives as a failure, not as an acceptable fallback.
- If the shared `@specra/ui` or shadcn CLI path is broken, stop and repair that setup before continuing. Do not work around it by generating local copies of `button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, or similar files in app code.
- Treat shared primitives as opinionated components, not as generic wrappers.
- Avoid root-level `p-*`, `px-*`, `py-*`, `h-*`, `min-h-*`, and `w-*` overrides on `Card`, `Button`, `Badge`, `Input`, and similar primitives unless the primitive itself truly needs a different size contract.
- Prefer layout wrappers and component substructure such as `CardHeader`, `CardContent`, and `CardFooter` when the real need is spacing or composition around the primitive.
- Visual scale calibration: make the UI smaller and tighter than your first instinct. Prefer `text-base` over `text-lg` for operational labels, `text-2xl` over larger panel headings, `gap-4`/`gap-6` over `gap-10`/`gap-16`, default or `sm` shadcn controls over custom large controls, and compact icon/avatar sizes unless the reference clearly shows larger elements.
- If a screenshot looks better only because it was captured from far away or scaled down in preview, the implementation is too large. Fix the UI scale instead of relying on capture scale.
- Keep route files thin and compositional. Do not build an entire screen inline in `page.tsx` when it can be broken into reusable layout and region components.
- Extract repeated or structurally meaningful screen regions into local feature components such as `layout`, `sidebar`, `header`, `table`, `panel`, `list`, or `metric-card`.
- Only move something into shared `@specra/ui` when it is a true design-system primitive or broadly reusable across screens.
- Do not choose a CSS-first or bespoke styling path when Specra is the workflow.
- Do not treat Tailwind-oriented feedback as optional or irrelevant. If the implementation stack makes Specra validation nonsensical, the stack choice was wrong.

## Current artifact model

The latest supported Specra revision must contain both public artifacts:

- `DESIGN.md`
- `theme.css`

Treat those as the design handoff.

If the latest revision is missing any of them, treat it as outdated and tell the user to rerun analysis before continuing.

If the user asks to inspect a specific handoff artifact directly, call `specra_get_artifact` instead of searching the local filesystem.

`system.md` is static runtime guidance handled by Specra itself. It is not a generated revision artifact.

## Default tool loop

For normal UI implementation work, use this order:

1. confirm the repo is connected through `.specra.json`
2. inspect the repo and pass the TailwindCSS + shadcn/ui implementation gate
3. call `specra_load_project_context` so the current handoff is actually loaded before implementation starts
   This tool now inlines up to 4 resized reference screenshots by default. Leave the defaults alone unless you need to reduce image context further.
4. generate or edit the UI in code using the loaded handoff as the source of truth
5. run `specra_validate_generated_ui`
6. run `../scripts/local-evaluate-loop.ts run --repo <repoPath> --url <previewUrl>` to capture the viewport and produce the broad evaluation request
7. have the client LLM return JSON matching `expected_output_contract`, then rerun the same command with `--mode broad --evaluation <path-or->`
8. when the run command returns a micro-polish evaluation request, have the client LLM return that JSON and rerun with `--mode micro --evaluation <path-or->`
9. apply the smallest useful fix, recapture, and re-evaluate if needed
10. if drift remains, run `specra_suggest_ui_fix`

Use `specra_map_ui_to_code` when a visible issue needs to be mapped back to a specific file or component.

## Validation and iteration

Keep the loop bounded.

Default budget:

- broad screenshot rounds: maximum `4`
- micro-polish rounds: maximum `2`
- absolute total: maximum `6`

Rules:

- keep a best-so-far candidate
- do not assume the newest iteration is the best
- let the broad loop stop when only small or converged issues remain
- stop if a strong best-so-far candidate stops improving
- after the second broad round, restrict changes to small edits
- when using screenshot iteration, pass `iteration_context` into the eval tools after the first round
- when a result includes `next_iteration_context`, pass that object forward directly on the next eval call instead of rebuilding loop state by hand
- follow `iteration_plan.nextStep` for the broad loop instead of improvising from prose feedback
- if `iteration_plan.nextStep` is `verify-preview-and-recapture`, stop editing UI and verify the preview target first
- after the broad loop stops and the screen is not off-target, run one micro-polish screenshot pass by default when `shouldRunMicroPolish` is true
- run a second micro-polish pass only if the first one still finds real spacing, padding, or alignment issues
- do not fix more targets than `iteration_plan.maxFixTargets`
- after each eval pass, carry forward only the distilled state: `verdict`, `qualityScore`, `iteration_plan.nextStep`, `agentInstruction`, and the top 1-2 findings
- do not keep refeeding the full evaluation payload back into the thread
- do not finalize while the evaluator still says to continue the broad loop or while a recommended micro-polish pass has not been run
- do not claim that a screen is aligned to the Specra handoff unless the latest local run command wrote a current repo-local evaluation artifact that permits the claim
- if a later broad pass suddenly collapses into `off-target` after a previously usable candidate, treat that as a preview-sanity problem first, not as a reason to keep broad-editing the UI

Use the local micro-polish scaffold only after the screen is broadly correct or broad feedback has clearly converged.

Do not finalize a materially new UI implementation after code validation alone. A fresh screenshot pass is required before concluding the loop.
Do not use `curl`, raw HTML output, or `HTTP 200 OK` as proof that the UI visually matches the handoff. Those checks only confirm that the route responds.
Manual screenshot review does not satisfy the Specra finish gate by itself. The repo-local evaluation artifact written by the run command is the gate for alignment claims.

## Screenshot-first evaluation

For localhost previews, prefer local capture on the user machine:

1. ensure Playwright is installed locally in the target repo and Chromium has been installed through the local Playwright binary; do not use package-runner fallbacks as the Specra capture path
2. run `../scripts/local-evaluate-loop.ts run --repo <repoPath> --url <previewUrl>` from the target repo cwd
3. have the client LLM return JSON matching `expected_output_contract`
4. rerun `../scripts/local-evaluate-loop.ts run --repo <repoPath> --url <previewUrl> --mode broad --evaluation <path-or->`
5. if the result returns a micro-polish request, return micro JSON and rerun with `--mode micro --evaluation <path-or->`

The screenshot loop should stay local. Do not route normal screenshot evaluation back through the Specra MCP server.

Capture viewport frames only. Do not use full-page screenshots or oversized desktop viewports for app or dashboard UI evaluation because tall screenshots get scaled down in previews and hide real sizing problems. Default to `1320x800` unless matching the user's reported visible browser viewport. Do not use `900px`-plus or `1200px`-tall captures for normal dashboard review.

When below-the-fold content matters, handle scrolling by capturing additional viewport frames with explicit scroll offsets:

```bash
../scripts/local-evaluate-loop.ts run --repo <repoPath> --url <previewUrl> --width 1320 --height 800
../scripts/local-evaluate-loop.ts run --repo <repoPath> --url <previewUrl> --width 1320 --height 800 --scroll-y 650
```

Evaluate each important viewport frame separately. Use the first visible viewport as the default alignment gate for dashboard and app screens, then use scrolled frames for specific below-the-fold regions.

Closeout must report the capture viewport, scroll offset, and that `fullPage` was false.

Do not run global filesystem searches such as `find $HOME -path '*capture-preview.mjs'` to rediscover the capture script. Use the known Specra script path directly.

## Deterministic UI mapping

When a visible issue must be tied back to code, prefer deterministic mapping with `data-specra-id`.

Typical flow:

1. inspect the preview with `../scripts/inspect-preview.mjs`
2. pass `dom_inspection_path` into the local evaluation scaffold so the client LLM gets the style summary, and use `repo_path` separately for deterministic code mapping when needed
3. if you still need a narrower callback target, call `specra_map_ui_to_code`

Do not run global filesystem searches such as `find $HOME -path '*inspect-preview.mjs'` to rediscover the inspection script. Use the known Specra script path directly.

Use stable semantic `data-specra-id` values such as:

- `dashboard-shell`
- `dashboard-sidebar`
- `dashboard-topbar`
- `settings-form`
- `metrics-card-group`

## Generation rules

When Specra is in the loop:

- follow `DESIGN.md` and `theme.css`, not the old planning chain
- let the user task decide the requested screen type
- use the references to transfer the design system first: theme, density, spacing, surfaces, and component language
- borrow shell and module cues from the references only when they support the requested task
- infer visual-system decisions from the current handoff instead of defaulting to a generic dashboard or SaaS template
- treat surface model, chrome character, density, accent discipline, and typography posture as first-class and derive them from the artifacts
- do not assume shells should float, cards should detach, chrome should be thin, accent should be sparse, or modules should be dense unless the handoff supports those choices
- compose from existing shadcn/ui components whenever possible
- if a needed shadcn primitive is missing, add it through the repo's CLI workflow before writing bespoke substitutes
- do not tolerate ad hoc app-local replacements for common primitives; if the shadcn path is unavailable, fix it before continuing
- do not treat primitives like `Card` as generic layout boxes; avoid casually adding root-level `p-*`, `h-*`, or similar sizing overrides when a wrapper or subcomponent would solve the problem better
- keep route files thin and use them mainly for page composition, not for hundreds of lines of screen markup
- extract repeated or region-level UI into reusable local components before the page file becomes monolithic
- prefer feature-local reusable components for screen structure and shared `@specra/ui` primitives for design-system building blocks
- prefer omission over ornament; do not add decorative labels, atmospheric badges, or summary modules unless they carry real product value
- every panel and supporting block should answer a functional question: what decision, workflow, or state does this help with?
- if a module merely restates nearby metrics or exists to make the screen feel more designed, cut it
- match structure before polish
- build big to small: shell, regions, groups, leaf controls, then microcopy
- use TailwindCSS and shadcn/ui as the implementation stack
- use semantic theme variables and classes where possible
- do not use gradients on backgrounds, surfaces, controls, or text unless the handoff clearly supports them
- avoid tracked uppercase eyebrow labels such as `uppercase tracking-[0.18em]` unless the handoff clearly supports them
- avoid arbitrary values unless clearly necessary and consistent with the repo

## Failure handling

If Specra data is missing or weak:

- confirm `.specra.json`
- confirm the project has a successful extraction
- if the latest revision is outdated, tell the user to rerun analysis
- if preview work is needed, confirm `previewUrl` or a reachable local app exists
