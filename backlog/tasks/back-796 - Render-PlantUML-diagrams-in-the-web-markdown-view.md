---
id: BACK-796
title: Render PlantUML diagrams in the web markdown view
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-28T06:26:00Z'
updated_date: '2026-10-28T06:28:00Z'
labels: []
dependencies: []
references:
  - https://github.com/MrLesk/Backlog.md/issues/1026
  - src/web/components/MermaidMarkdown.tsx
modified_files:
  - ADVANCED-CONFIG.md
  - CLI-INSTRUCTIONS.md
  - README.md
  - bun.lock
  - bun.nix
  - package.json
  - scripts/smoke-compiled-build.ts
  - src/cli.ts
  - src/file-system/operations.ts
  - src/test/config-commands.test.ts
  - src/test/plantuml-markdown.test.tsx
  - src/test/plantuml.test.ts
  - src/types/index.ts
  - src/types/plantuml-core.d.ts
  - src/web/App.tsx
  - src/web/components/MermaidMarkdown.tsx
  - src/web/contexts/PlantUmlServerContext.tsx
  - src/web/styles/source.css
  - src/web/utils/markdown-code.ts
  - src/web/utils/plantuml.ts
  - src/web/utils/markdown-fences.ts
type: feature
ordinal: 402000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog documents, tasks, and decisions already render Mermaid diagrams in the browser, but PlantUML source renders as a plain code block. People who keep architecture diagrams in PlantUML (component, deployment, sequence) have to render them in an external tool and paste an image, which breaks the plain-text source of truth: the image drifts from the diagram source that lives in the Markdown. PlantUML now ships an MIT-licensed browser engine (@plantuml/core, PlantUML compiled to JavaScript with TeaVM, MIT from 1.2026.6), so diagrams can render with no Java, no Graphviz binary and no hosted service, which keeps the default offline and local-first. Two points need a product decision. First, whether the bundled engine is the right default: it does not carry the PlantUML standard sprite libraries (AWS, Azure, Kubernetes, C4), so teams that need those would want an optional configured PlantUML server instead. Second, whether a bare @startuml...@enduml region should render as well as a fenced block, since authors paste raw PlantUML into Markdown without fencing it. This follows the Mermaid precedent in issue #418 and PR #429: diagram rendering is presentation of Markdown the CLI already stores, not a new capability in the product model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fenced plantuml and puml code blocks in task, document, and decision markdown render as diagrams in the browser UI
- [x] #2 A bare @startuml...@enduml region in markdown that is not inside a code fence renders as a diagram
- [x] #3 Diagrams render with no network access and no external service when no PlantUML server is configured
- [x] #4 When a PlantUML server URL is configured, diagrams are rendered through that server instead of the bundled engine
- [x] #5 A diagram that fails to render leaves its original source visible instead of blank output
- [x] #6 Script content and event handlers injected through diagram source are removed before the rendered SVG is inserted into the page
- [x] #7 The PlantUML engine is only loaded when the rendered markdown actually contains a diagram
- [x] #8 Automated tests cover fenced detection, bare block detection, server mode, sanitization, and render failure fallback
- [x] #9 The new configuration key is documented in the configuration docs and accepted by backlog config get/set
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Merge current upstream/main into the published prototype.
2. Preserve the verified PlantUML renderer and live-preview fixes while adopting upstream HTML-as-text Markdown parsing.
3. Keep the contribution diff limited to PlantUML code, docs, tests, dependencies, and its task record.
4. Verify source parity with the tested integration and rerun focused checks.
5. Update the existing contribution with validation evidence, keeping maintainer scope questions explicit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Updated the prototype to upstream/main 0e0d2967. The source, dependencies, tests, and shipped documentation match the verified integration. Replaced the heuristic Markdown fence scanner with the preview parser, retained upstream HTML-as-text handling, and recreated diagram subtrees when source or server settings change. The task ID was reassigned through the CLI because upstream uses BACK-688 and BACK-794/BACK-795 for other work. Product scope feedback remains pending in issue #1026.

Verification: production source, dependencies, tests, build scripts, and shipped documentation are identical to the integration verified with Bun 1.4.4 on 2026-10-27. The full isolated CI profile passed 3225 non-DOM tests and 445 DOM tests (3670 pass, 13 skip, 0 fail; 326 files). Compiled CLI smoke and native Chrome checks covered tasks, documents, decisions, lazy/offline assets, live source/config changes, and server failure fallback with no page errors. Re-ran the 102 focused PlantUML/Mermaid/config tests, Bun type checking (556 files), and Biome (477 files) in this publication worktree on 2026-10-28; all pass. No new implementation changes were introduced during publication preparation. Keep this contribution In Progress while maintainer scope feedback in issue #1026 remains pending.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Refreshed the PlantUML prototype against upstream/main 0e0d2967 with Markdown source-preservation and live-render corrections. The current source retains upstream Markdown parsing and matches the fully tested integration. The contribution record is BACK-796; the existing published branch name remains stable for issue links. Ready for maintainer scope review.
<!-- SECTION:FINAL_SUMMARY:END -->
