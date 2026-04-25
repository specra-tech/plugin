---
name: region-targeting
description: Resolve a selected preview region to the nearest `data-specra-id`, then map that region back to source for code-targeted fixes and callbacks.
---

# Region Targeting

Use this skill when the user wants to turn a visible preview region into a concrete code target.

Typical requests:

- find the specific component behind this icon/button/card
- map this screenshot region to code
- use the nearest `data-specra-id` as the problem area
- callback from a selected preview region into the source files

Do not use this skill for broad generation. Use the main `build-ui-from-references` skill for that.

## Goal

Use deterministic DOM inspection first, then map the resulting `data-specra-id` back to source so subsequent fixes target the correct component.

## Plugin Script Paths

Specra local scripts are part of this plugin. Resolve script paths relative to this `SKILL.md`, not relative to the target app or repo cwd:

- `../scripts/inspect-preview.mjs`

Use the plugin inspection script. Do not replace it with package-runner fallbacks or ad hoc Playwright commands.

## Workflow

1. Confirm the repo is connected to Specra through `.specra.json`.
2. Confirm a local preview exists with `local-preview` if needed.
3. Capture or open the preview locally.
4. Run the plugin-local inspection harness:
   - `../scripts/inspect-preview.mjs --url <previewUrl> --point x,y`
   - or `../scripts/inspect-preview.mjs --html-file <htmlFilePath> --bbox x,y,w,h`
5. Read the `nearest` result and treat `dataSpecraId` as the primary code anchor.
6. Search the repo for the exact `data-specra-id` value.
7. Map that ID to the owning route, component, or shared layout.
8. Use the mapped source as the specific problem area for the next fix pass.

## Rules

- Prefer exact `data-specra-id` matches over screenshot guessing.
- Prefer selected-region inspection over global screenshot interpretation when the issue is local and specific.
- If multiple candidates exist, prefer the nearest visible component root, not a tiny child primitive.
- If no `data-specra-id` exists, fall back to `map-ui-to-code`.
- Keep the callback deterministic and minimal: inspect region, resolve ID, search code, fix source.

## Success condition

You should be able to answer:

- which exact `data-specra-id` is responsible for the selected area
- which file/component owns that ID
- what code area should be edited next
