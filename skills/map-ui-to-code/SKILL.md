---
name: map-ui-to-code
description: Map a visible UI region back to the responsible route, component, or file using deterministic `data-specra-id` markers first, then fall back to repo search only when needed.
---

# Map UI to Code

Use this skill when the user asks:

- what part of the codebase is this area
- which file renders this section
- map this visible UI region back to source
- instrument this screen so browser feedback can point to code directly

Do not use this skill for broad UI generation. Use the main `build-ui-from-references` skill for that.

## Goal

Find the most likely source file or component for a visible UI region, using deterministic instrumentation whenever available.

## Preferred method

Prefer `data-specra-id` markers on meaningful UI roots.

Examples:

- `dashboard-shell`
- `dashboard-sidebar`
- `dashboard-topbar`
- `settings-form`
- `metrics-card-group`

When these markers exist:

1. inspect the preview locally with `../../scripts/inspect-preview.mjs`
2. identify the relevant `data-specra-id` or selected region
3. call `specra_map_ui_to_code`
4. use the returned snippets and file paths to map the region to the component, route, or shared layout that owns it

This is the primary path because it is deterministic.

## Preferred local flow

When a visible UI region has already been selected or called out:

1. run `../../scripts/inspect-preview.mjs --url <previewUrl> --point <x,y>`
2. or run `../../scripts/inspect-preview.mjs --url <previewUrl> --bbox <x,y,width,height>`
3. call `specra_map_ui_to_code` with:
   - `dom_inspection_path`
   - `repo_path`
   - optional `selection_point` or `selection_bbox`
4. if the exact `data-specra-id` is already known, pass `data_specra_id` directly

The tool will:

- resolve the nearest `data-specra-id`
- search the repo for that exact attribute
- return matched files and code snippets around the source marker

If the user is working from a live local preview, use the local inspection harness first:

- `../../scripts/inspect-preview.mjs --url <previewUrl> --point x,y`
- `../../scripts/inspect-preview.mjs --html-file <htmlFilePath> --bbox x,y,w,h`

Then use the returned nearest `dataSpecraId` as the exact source anchor before falling back to repo search.

## Fallback method

Only when `data-specra-id` is missing:

1. identify the current route or page entry
2. search for distinctive UI text
3. search for likely component names such as `Sidebar`, `Topbar`, `SettingsForm`, or `DashboardShell`
4. search for layout roles and semantic class patterns
5. return the most likely files with confidence notes

This path is weaker and should be treated as inference.

## Instrumentation rules

When adding new IDs:

- use `data-specra-id`
- use stable semantic kebab-case values
- place the ID on the meaningful component root
- avoid noisy or low-signal IDs on tiny primitives
- prefer direct attributes in JSX over wrapper abstractions
- if production cleanliness matters, strip the attributes in production builds later

## Success condition

You should be able to tell the user either:

- the exact file/component likely responsible for the UI region
- or that deterministic mapping is missing and `data-specra-id` should be added to make future mapping reliable
