# Specra

Build and refine UI from reference screenshots with grounded MCP workflows.

Use Specra to extract structure, implementation rules, and reusable component patterns from reference screenshots, then ground generation and validation through Specra MCP tools. For normal UI builds, use the primary `specra-generate` skill so the full loop runs: handoff load, implementation, code validation, local screenshot evaluation, and finish gate. For local screenshot evaluation against localhost previews, install Playwright Chromium once using the package runner that matches the user's setup, for example `npx playwright install chromium`, `pnpm dlx playwright install chromium`, `bunx playwright install chromium`, or `yarn dlx playwright install chromium`. Do not treat `curl`, raw HTML output, or `HTTP 200 OK` as visual verification; a fresh screenshot pass is still required before claiming alignment. Manual screenshot review is also not enough on its own: the local Specra guide command must write a current repo-local evaluation artifact before alignment can be claimed.

## Example Workflows
- Use `specra-generate` to build a dashboard that matches this project's references
- Evaluate this implemented screen against the extracted Specra system
- Tighten this UI to match the project's Specra handoff
