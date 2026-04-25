---
name: evaluate-ui
description: Evaluate implemented UI with screenshots and the current DESIGN.md plus theme.css Specra handoff, then return concrete mismatch findings and a bounded refinement path.
---

# Evaluate UI

Use this skill when the user wants a screenshot-based feedback loop on implemented UI.

Do not use this skill as the primary UI generation workflow.

## Inputs

Prefer to work from:

- a local preview URL discovered through `local-preview`
- or another reachable implementation surface

Use screenshots plus the current handoff:

- `DESIGN.md`
- `theme.css`

## Plugin script paths

Specra local scripts are part of this plugin. Resolve script paths relative to this `SKILL.md`, not relative to the target app or repo cwd:

- `../scripts/capture-preview.mjs`
- `../scripts/local-evaluate-loop.ts`
- `../scripts/inspect-preview.mjs`

Use these plugin scripts for capture, evaluation, and inspection. Do not replace them with package-runner fallbacks or ad hoc Playwright commands. It is fine to run the resolved plugin script while your shell cwd is the target repo so outputs like `.specra/captures/top.png` land in the repo.

## Workflow

1. Confirm the repo is connected to Specra through `.specra.json`.
2. Confirm the latest revision has both public artifacts. If not, tell the user to rerun analysis.
3. Confirm a preview URL exists, using `local-preview` if needed.
4. If local screenshot capture is needed for the first time on a machine, tell the user to install Playwright locally in the target repo and install Chromium through the local Playwright binary. Do not use package-runner fallbacks as the Specra capture path.
5. For localhost previews, run `../scripts/local-evaluate-loop.ts run --repo <repoPath> --url <previewUrl>` from the target repo cwd.
6. For generated previews, write the HTML to a local file and run `../scripts/local-evaluate-loop.ts run --repo <repoPath> --html-file <htmlFilePath>`.
7. Ask the client LLM to open the screenshot and local reference images from the returned `evaluation_request` and return only JSON matching `expected_output_contract`.
8. Save that JSON locally or pass it through stdin, then rerun the same command with `--mode broad --evaluation <path-or->` to compute deterministic loop guidance and write the repo-local status artifact.
9. If the command returns a micro-polish `evaluation_request`, ask for micro JSON and rerun with `--mode micro --evaluation <path-or->`.
10. If `dom_inspection_path` and `repo_path` are available on the local machine, use them separately for code-targeting work, but keep the evaluation itself local and client-driven.
11. Pass `iteration_context` on every round after the first:

- `broad_round`
- `micro_round`
- `best_quality_score`
- `non_improving_broad_streak` when available
- `previous_quality_score`

12. Follow `iteration_plan.nextStep` exactly:

- `fix-and-recapture`
- `map-to-code-and-fix`
- `verify-preview-and-recapture`
- `revert-to-best`
- `stop`

13. If a result says `map-to-code-and-fix`, inspect the preview and map the visible issue back to code before editing.
14. If a result says `verify-preview-and-recapture`, stop editing UI and verify the preview target first:

- kill stale dev or prod servers
- relaunch one clean preview
- confirm the intended CSS/theme is loaded
- recapture before trusting more screenshot feedback

15. After each evaluation, carry forward only the distilled loop state:

- `verdict`
- `qualityScore`
- `iteration_plan.nextStep`
- `iteration_plan.maxFixTargets`
- `agentInstruction`
- `next_iteration_context` when present
- the top 1-2 findings

Do not run global filesystem searches such as `find $HOME -path '*capture-preview.mjs'` or `find $HOME -path '*inspect-preview.mjs'` during the loop. Use the known Specra script paths directly.
Keep the screenshot loop local and let the client LLM produce the JSON evaluation from the generated bundle. Do not route screenshot review back through the Specra MCP server.
Do not use `curl`, raw HTML output, or `HTTP 200 OK` as a substitute for screenshot review. Those checks only confirm that the preview responds.
Do not use full-page screenshots or oversized desktop viewports for app or dashboard evaluation. Capture the visible viewport only, defaulting to `1320x800` unless matching the user's reported visible browser viewport. Do not use `900px`-plus or `1200px`-tall captures for normal dashboard review. For below-the-fold regions, capture additional viewport frames with `--scroll-y <cssPixels>` and evaluate those frames as separate scroll positions.
When judging scale, assume the first implementation is likely too large. Prefer findings that push typography, spacing, controls, tiles, and icons smaller/tighter when the reference is not clearly larger.
Report the viewport size, scroll offset, and `fullPage: false` in the final evidence.

## Iteration limits

Use this loop:

1. broad screenshot evaluation
2. apply at most the top `2` fixes
3. recapture
4. repeat until `iteration_plan.nextStep` says `stop`, `verify-preview-and-recapture`, or `revert-to-best`
5. if the broad result stopped and `shouldRunMicroPolish` is true, let `../scripts/local-evaluate-loop.ts run` produce the fresh micro-polish screenshot and request
6. apply only the top `1` tiny fix
7. recapture
8. ask the client LLM for the micro-polish JSON result, then rerun with `--mode micro --evaluation <path-or->`
9. run one second micro-polish pass only if the first one still finds real spacing, padding, or alignment issues
10. stop when the micro-polish result says `stop` or `revert-to-best`

## Rules

- Prefer concise, edit-ready findings over prose.
- Prefer concrete screenshot-based feedback over broad stylistic commentary.
- Treat wrong screen type as a hard failure only when it contradicts the explicit user task or requested structure, not just because the references showed a different surface.
- Treat copied reference-brand names, workspace labels, logos, avatar initials, or screenshot-specific product copy as a defect unless the user explicitly asked for exact brand recreation.
- Once the broad loop stops and `shouldRunMicroPolish` is true, run the local micro-polish scaffold before concluding unless the loop budget is already exhausted.
- Use the local micro-polish pass only when the remaining issues are small and local, especially spacing, padding, or alignment drift.
- If broad evaluation fails to improve for two rounds in a row, stop broad critique. Verify the preview if the capture looks suspect; otherwise move to the best candidate and a micro-polish or manual targeted pass.
- Keep Playwright on the user machine and keep the evaluation LLM call on the client side too.
- Do not improvise loop control from prose. Use `iteration_plan` as the source of truth.
- Do not apply more fixes than `iteration_plan.maxFixTargets`.
- Do not paste or restate the full evaluation JSON in the conversation when you continue the loop.
- Do not conclude that the UI is done while `iteration_plan.nextStep` still says `fix-and-recapture`, `map-to-code-and-fix`, or `verify-preview-and-recapture`, or while a recommended micro-polish pass has not been run.
- Do not claim that the UI is aligned to the Specra handoff unless the latest run command wrote a current repo-local evaluation artifact that permits the claim.
- Manual screenshot review does not replace the repo-local evaluation artifact.
