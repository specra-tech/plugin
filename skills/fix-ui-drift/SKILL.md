---
name: fix-ui-drift
description: Tighten generated UI that is close to the reference but drifting from the current four-artifact Specra handoff.
---

# Fix UI Drift

Use this skill when UI is already close but not aligned enough with the Specra project.

## Goal

Apply the smallest useful changes that move the implementation back toward the extracted design system.

## Workflow

1. Confirm the repo is connected to Specra through `.specra.json`.
2. Confirm the latest revision has the current four-artifact set. If not, tell the user to rerun analysis.
3. Run `specra_validate_generated_ui` against the touched UI files.
4. If the structure is right or broad feedback has already converged, run `../../scripts/local-evaluate-loop.ts prepare-micro` on a fresh screenshot and then `guide-micro --repo <repoPath>`.
5. If a later broad pass suddenly collapses into `off-target` after a previously usable candidate, verify the preview target before editing more UI.
6. If `dom_inspection_path` and `repo_path` are available, pass them so findings come back with code targets attached.
7. If the issue is localized, inspect the preview and call `specra_map_ui_to_code` before editing by guesswork.
8. Run `specra_suggest_ui_fix` when validation finds real drift.
9. Apply minimal code changes instead of rewriting the whole component.
10. Re-run validation if the change materially affects alignment.
11. Do not treat `curl`, raw HTML output, or `HTTP 200 OK` as proof that the repaired UI is visually correct. Use a fresh screenshot pass instead.

## Loop discipline

- prefer repair over rewrite
- keep the current best version as the baseline
- do not continue iterating after two repair rounds unless the user explicitly asks
- if broad feedback stops improving for two rounds in a row, stop broad repair and switch to preview verification, micro-polish, or manual targeted fixes
- run one micro-polish pass by default for spacing, padding, and alignment cleanup once the structure is right
- run a second micro-polish pass only if the first still finds real defects
- if only micro-polish defects remain, make tiny fixes only
- do not claim Specra alignment unless the latest guide command wrote a current repo-local evaluation artifact that permits the claim

## Common drift types

- wrong screen composition for the requested task
- radius bucket drift
- spacing rhythm drift
- shadow or surface drift
- semantic theme misuse
- component misuse
- tracked uppercase label drift
- tiny polish defects such as icon centering, optical alignment, or uneven padding
