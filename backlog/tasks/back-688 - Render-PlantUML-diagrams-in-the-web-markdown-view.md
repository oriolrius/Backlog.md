---
id: BACK-688
title: Render PlantUML diagrams in the web markdown view
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 16:13'
updated_date: '2026-09-16 16:47'
labels: []
dependencies: []
type: feature
ordinal: 319000
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
1. Add `plantumlServerUrl?: string` to BacklogConfig (src/types/index.ts), parse it as snake_case `plantuml_server_url` in parseConfig, include it in the parseConfig return literal, and emit it from serializeConfig (src/file-system/operations.ts). Both switches are hard allow-lists; missing either silently drops the value on the next full-file rewrite.
2. Wire the key through the four CLI spots in src/cli.ts: CONFIG_GET_KEYS, CONFIG_SET_KEYS, the CONFIG_AVAILABLE_KEYS error string, and the get/set/list bodies. Validate on set with `new URL()` + http(s) protocol check and store the normalized href, because serializeConfig interpolates strings into double quotes with no escaping. Empty value clears it.
3. New src/types/plantuml-core.d.ts declaring @plantuml/core/plantuml.js, /viz-global.js and /themes.js as Bun `file` loader modules (default export is the emitted asset URL string), mirroring src/types/mermaid-dist.d.ts.
4. New src/web/utils/plantuml.ts holding the whole client concern: (a) fenceBarePlantUmlBlocks(source) wrapping bare @startuml...@enduml regions that sit outside existing code fences; (b) renderPlantUmlIn(element, options) scanning `pre > code.language-plantuml, pre > code.language-puml`; (c) local engine load via `import ... with { type: "file" }` + a computed-specifier dynamic import so Bun emits the 5.7 MB engine as separate static assets instead of inlining them in the client chunk, with a __PLANTUML_MOCK__ test seam like ensureMermaid; (d) server mode building `{base}/svg/{token}` with raw-deflate + PlantUML base64 via CompressionStream and rendering an img; (e) an SVG sanitizer stripping script/foreignObject elements, on* handlers and non-http(s) hrefs before the markup enters the DOM.
5. Fix sanitizeMarkdownSource in src/web/components/MermaidMarkdown.tsx to skip fenced code regions. Verified today: it currently rewrites `<IP>` to `&lt;IP>` inside a plantuml fence, which corrupts the diagram source; markdown already renders fenced content inertly so skipping fences does not weaken XSS protection, and it fixes mermaid blocks containing `<` too.
6. In the same component, fence bare blocks before sanitizing, and call renderPlantUmlIn alongside renderMermaidIn in the existing requestAnimationFrame effect. Pass the dark flag and re-render diagrams when the theme changes by keeping the diagram source on the rendered wrapper.
7. New src/web/contexts/PlantUmlServerContext.tsx modelled on TaskIdIndexContext so the config value reaches the renderer without prop-drilling seven call sites; provide it from App.tsx next to TaskIdIndexProvider. Live config reload already propagates through the existing config-updated websocket path.
8. Add diagram sizing CSS for the rendered wrapper in src/web/styles/source.css.
9. Tests: src/test/plantuml.test.ts for the bare-block transform, fenced detection, server-mode URL, sanitizer and failure fallback; src/test/plantuml-markdown.test.tsx for the component path including angle brackets surviving a fence; extend src/test/config-commands.test.ts with a round-trip and an invalid-URL rejection.
10. Docs: add the config key row and a detailed note to ADVANCED-CONFIG.md, a README feature bullet and a CLI-INSTRUCTIONS.md sentence naming both Mermaid and PlantUML, then run bun run update-nix and commit bun.nix alongside bun.lock.
11. Verify with bunx tsc --noEmit, bun run check ., the new and touched test files, a real compiled build, and a real browser check of the reporter's diagram.

12. Plan deviation, recorded after implementation: step 6 dropped the re-render-on-theme-change mechanism. MermaidMarkdown has no ThemeProvider in its existing tests and mermaid never followed the theme either, so the dark flag is read from the documentElement class at render time and a diagram keeps the theme it was drawn with until the view is reopened. Documented in ADVANCED-CONFIG.md.

13. Plan deviation: an adversarial review found the line-based fence scanner was container-blind, which broke two things — it could not see a fence indented under a list item, and it never reopened escaping after a fence its container had closed (a regression against the previous always-escape behaviour). markdown-fences.ts was replaced by a single fencedCodeLines(source) pass that tracks fence indentation and treats a dedent as the end of the block, and both consumers now index into it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification evidence.

Real browser (Orca, compiled binary serving a scratch project): a document holding the reporter's component diagram as a fenced block, the same diagram unfenced, and a mermaid block renders 2 .plantuml svg + 1 .mermaid svg with 0 leftover code blocks (AC 1, 2). Diagram text keeps its angle brackets — svg text nodes contain 'http://wb.<IP>.sslip.io' and 'unfenced <IP> works' — while prose outside code still escapes, 'Result<List<MenuItem>>' renders as text. The wide diagram is clamped to its container (660px svg in a 660px parent) and PlantUML picks up dark mode from the documentElement class. No script elements survive in the rendered svg (AC 6).

AC 3: with no plantumlServerUrl set, the only resources the page loads are on 127.0.0.1 — /plantuml-95az52an.js, /viz-global-r4q29v8y.js, /themes-bzs9z86q.js, all served out of the compiled binary itself.

AC 4: with plantumlServerUrl set to a real PlantUML server the same document renders two img elements at {base}/svg/{token} with natural sizes 1064x751 and 230x159 and zero local svgs, i.e. the engine is not used. The encoding is raw deflate + PlantUML base64 via CompressionStream; a token produced by that path was accepted by a real PlantUML server (HTTP 200, image/svg+xml).

AC 7: loading a page with no diagram fetches zero engine bytes (performance resource entries contain no plantuml/viz/themes entry). The engine stays out of the client chunk: chunk-<hash>.js is 5,468,363 bytes and contains no TeaVM code, versus 5,463,999 before this change. The compiled binary grows 101.9 MB -> 107.6 MB because the three engine files are embedded verbatim.

AC 8: 32 new tests — 20 in src/test/plantuml.test.ts, 9 in src/test/plantuml-markdown.test.tsx, 3 in src/test/config-commands.test.ts. Mutation-checked three of them: dropping the serverUrl from the render call fails the wiring test, making the fence scanner container-blind fails the escaping-after-a-list test, and narrowing fence detection back to 3 spaces fails the indented-fence test.

AC 9: backlog config get/set/list round-trip plantumlServerUrl, the value survives a write-and-reload of config.yml, a non-http value exits non-zero, and ADVANCED-CONFIG.md documents the key.

Checks: bunx tsc --noEmit clean, bun run check . clean. CI's own runner is green: bun scripts/run-ci-tests.ts --profile=full --parallel=2 --isolate --timeout=10000 --max-concurrency=2 exits 0 with 2562 pass / 0 fail across 251 files plus 342 pass / 0 fail across the 39-file DOM pass. The compiled build smoke check passes for a bun-linux-x64-baseline binary at the package version.

Cross-platform coverage. scripts/smoke-compiled-build.ts now asserts that the browser chunk contains no engine code and that each of the three emitted PlantUML assets returns 200. That script is the one check that runs in compile-and-smoke-test on ubuntu, macOS and Windows, so it covers the asset delivery on every OS this change cannot otherwise be exercised on. Verified locally against a real compiled build: 'Compiled build smoke checks passed'.

Known gap, stated rather than hidden: scripts/run-ci-tests.ts gives macOS and Windows a fixed PLATFORM_CONTRACT_FILES allow-list, and the two new test files are jsdom tests that land in ubuntu's serial DOM pass, so they run on ubuntu only. The modified src/test/config-commands.test.ts is on the platform list and does run everywhere. CRLF was checked by hand instead: fencedCodeLines and fenceBarePlantUmlBlocks produce identical results for LF and CRLF input, and micromark normalizes line endings before the engine sees them.

CompressionStream('deflate-raw') is only used on the optional server path and needs Chrome 103, Firefox 113 or Safari 16.4. On anything older the throw is caught and the diagram source stays visible.

Task ID: this work was first recorded as BACK-687, which open upstream PR #1018 already claims. The record was re-created through the CLI allocator as BACK-688 so the two do not collide if both merge.

Test-suite baseline, measured both ways on the same machine. CI's runner is green on this branch and on upstream/main: `bun scripts/run-ci-tests.ts --profile=full --parallel=2 --isolate --timeout=10000 --max-concurrency=2` exits 0 in both cases (branch 2562+342 pass / 0 fail, upstream/main 2559+313 pass / 0 fail). The plain non-isolated `bun run test` is flaky in both trees and not because of this change: upstream/main fails 'Final Summary > creates tasks with Final Summary and persists section markers' while the branch fails a case in cli-custom-prefix-id-resolution.test.ts, and repeated runs pick different cases each time. Both files pass on their own.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The browser now renders PlantUML alongside Mermaid. Fenced plantuml/puml blocks and bare @startuml...@enduml regions both become diagrams, drawn locally by @plantuml/core so nothing leaves the machine, or by a PlantUML server when the new plantumlServerUrl config key points at one. The engine is imported through Bun's file loader and fetched by URL at render time, so it adds ~4 KB to the client chunk instead of 5.5 MB and is never downloaded on a page without a diagram. Rendered SVG is sanitised before it enters the page, and a diagram that fails keeps its source visible. Fixed along the way: the markdown sanitiser was rewriting angle brackets inside code fences, which corrupted diagram source such as <IP>. Verified in a real browser against the reporter's own diagram in both local and server modes, plus 32 new tests, three of them mutation-checked.
<!-- SECTION:FINAL_SUMMARY:END -->
