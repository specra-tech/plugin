# Specra

Build and refine UI from reference screenshots with grounded MCP workflows.

Use Specra to extract structure, implementation rules, and reusable component patterns from reference screenshots, then ground generation and validation through Specra MCP tools. For normal UI builds, use the primary `implement-ui` skill so the full loop runs: handoff load, implementation, code validation, local screenshot evaluation, and finish gate. For live localhost inspection, use Codex Browser Use / the in-app browser first for route/theme verification, interaction checks, and localized visual debugging. Use Computer Use only when the in-app browser is unavailable, blocked, or the task requires desktop-app interaction. Use Playwright-backed plugin capture only as a last resort for inspection, or when producing the required repo-local evaluation artifact and no Browser Use or Computer Use screenshot is available. Browser Use or Computer Use inspection does not replace the finish gate: the local Specra guide command must still write a current repo-local evaluation artifact before alignment can be claimed. For local screenshot capture from a URL, install Playwright Chromium once using the package runner that matches the user's setup, for example `npx playwright install chromium`, `pnpm dlx playwright install chromium`, `bunx playwright install chromium`, or `yarn dlx playwright install chromium`. Do not use ad hoc Playwright scripts for manual visual inspection, and do not treat `curl`, raw HTML output, `HTTP 200 OK`, or manual visual review as proof of alignment.

## Example Workflows

- Use `implement-ui` to build a dashboard that matches this project's references
- Evaluate this implemented screen against the extracted Specra system
- Tighten this UI to match the project's Specra handoff
