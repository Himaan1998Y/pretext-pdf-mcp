# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to pretext-pdf-mcp are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.4.12] — 2026-05-16

HTTP transport hardening + post-audit safety polish.

### Added

- **Public-bind authentication guard** (`src/index.ts`) — Server refuses to
  start if `MCP_HOST` is set to a non-loopback address (e.g., `0.0.0.0`)
  without `MCP_API_KEY` also configured. Eliminates the silent footgun
  where a misconfigured deployment exposes unauthenticated PDF rendering
  to the network.

- **Bearer-token auth for HTTP endpoints** (`src/index.ts`) — When
  `MCP_API_KEY` is set, `/api/generate` and `/mcp` require
  `Authorization: Bearer <key>` (constant-time comparison via
  `crypto.timingSafeEqual`). `/health` and OPTIONS preflight remain open.

- **Concurrent render limit** (`src/index.ts`) — In-process semaphore caps
  in-flight renders at `MCP_MAX_CONCURRENT` (default 4). Excess requests
  receive `429 Too Many Requests` with `Retry-After: 5`. Prevents DoS via
  N-parallel CPU-heavy renders.

- **`hasUnsafeKeys` guard on `validate_document`** (`src/tools/validate-document.ts`) —
  The one tool that previously bypassed the prototype-pollution check now
  applies the same defense-in-depth as the four render tools. +3 tests
  covering top-level `__proto__`, nested `constructor`, deeply-nested
  `prototype`.

### Fixed

- **HTTP error message leakage** (`src/index.ts:~196, ~246`) — Both the
  `/api/generate` 500-path and the top-level catch previously returned
  `err.message` verbatim to the client. Internal file system paths,
  pdf-lib stack details, and third-party error fingerprints could leak.
  Both paths now log the full message to stderr and return only a
  sanitized envelope (`PretextPdfError` messages still pass through since
  they are designed for user consumption).

- **Misleading `generate_invoice` tool description** — Previous text
  claimed automatic IGST/CGST inter-vs-intra-state routing via
  `supplier.state`/`buyer.state`. The schema has no `state` field on
  `from`/`to` and the routing was never wired up. Description now
  accurately states: `gst_rate` per-item sums as IGST in totals;
  CGST/SGST routing not currently supported.

### Changed

- **Shared safety utilities** (`src/utils/safety.ts`) — Extracted
  `hasUnsafeKeys()` and `runDocumentSafetyChecks()` into a shared module.
  All five user-input-accepting tools (`generate_pdf`, `generate_invoice`,
  `generate_report`, `generate_from_markdown`, `validate_document`) now
  use the unified entry point.

- **Build-time type tightening** — Changed `buildInvoiceDocument` and
  `buildReportDocument` return types from `any` to `PdfDocument` from
  `pretext-pdf`, restoring type coverage to ~200 lines of document
  construction logic that was previously type-erased.

- **Magic color literals replaced with named constants** — `'#1a1a2e'`
  (9 sites) → `INVOICE_PRIMARY_COLOR`; `'#aaaaaa'` (2 sites) →
  `INVOICE_MUTED_COLOR` in `src/tools/generate-invoice.ts`.

- **`smithery.yaml` synced to package.json** — `1.4.11` → `1.4.12` via
  `scripts/sync-smithery-version.mjs` (now wired into the `version`
  npm hook and `prepublishOnly` gate).

### Notes

- Underlying `pretext-pdf` library bumped to **v1.2.0** (discriminated
  unions on public types, undici-pinned SSRF defense, concurrency-safe
  validator, `@internal` type leakage closed). See pretext-pdf CHANGELOG
  for full details.

- **HTTP transport backlog (v1.4.13+):** Output PDF size cap, JSON depth
  pre-parse check, generate_report `sections` count cap, markdown HTML
  expansion cap, `405 Method Not Allowed` on wrong method, remote IP in
  rejection logs.

---

## [1.4.11] — 2026-05-08

### Fixed

- **`generate_pdf` bypassed schema validation** (`src/tools/generate-pdf.ts`) — The tool
  called `render()` directly without first calling `validateDocument()`. Malformed or
  prototype-polluted payloads were silently accepted. Now validates before rendering and
  rejects inputs containing `__proto__`/`constructor` keys.

- **Three MCP `isError:true` protocol violations** — Per MCP spec, `isError:true` means
  the tool *crashed*, not that validation failed. Three sites misused this flag:
  - `UNKNOWN_TOOL` in `src/index.ts` now throws `McpError(ErrorCode.MethodNotFound)`
    instead of returning a tool result with `isError:true`. Clients receive a proper
    JSON-RPC error, not a fake tool crash.
  - `validate_document` returning `valid:false` for null input no longer sets `isError:true`.
    A tool that successfully validates an invalid document has *succeeded*, not crashed.
  - `list_element_types` documentation-drift invariant now logs to stderr and serves
    documentation anyway, instead of returning `isError:true` to callers.

---

## [1.4.10] — 2026-05-08

### Fixed

- **npm audit: 3 moderate vulnerabilities patched** — `npm audit fix` updated
  transitive dependencies from `@modelcontextprotocol/sdk`: `hono` (JSX tag-name
  injection GHSA-69xw-7hcm-h432, bodyLimit bypass GHSA-9vqf-7f2p-gf9v) and
  `ip-address` via `express-rate-limit` (XSS GHSA-v2v4-37r5-5v8g).
  `npm audit` now reports 0 vulnerabilities.

---

## [1.4.9] — 2026-05-07

Upgrade to pretext-pdf v1.1.0 which vendors `@chenglou/pretext` directly.
No behavioral changes; installs without needing a GitHub URL dependency.

### Changed

- **`pretext-pdf` dependency bumped to `^1.1.0`** — The `@chenglou/pretext`
  GitHub URL dependency is now gone from the install graph. `npm install` for
  users of `pretext-pdf-mcp` no longer needs to resolve a GitHub tag; all
  layout-engine code ships bundled inside `pretext-pdf@1.1.0`.

---

## [1.4.8] — 2026-05-06

Test coverage Phase 2: HTTP transport now has end-to-end coverage, including a
regression guard for the v1.4.7 bind-address fix.

### Added

- **`test/http-transport.test.ts`** (+11 tests, 1 skipped on Windows) — End-to-end
  coverage for the HTTP transport mode of the MCP server. Spawns `dist/index.js`
  with `MCP_PORT` set and sends raw HTTP requests. Covers:
  - **Bind regression (Phase 0 lock-in)** — Pinned-format match for `listening on
    127.0.0.1:<port>` (default) and `listening on 0.0.0.0:<port>` (when
    `MCP_HOST=0.0.0.0` is set). Prevents silent regression of the v1.4.7 fix.
  - **All 4 endpoints** — `OPTIONS *` (CORS 204), `GET /health` (200 with JSON
    body), `POST /api/generate` (200 with PDF bytes / 400 invalid JSON / 413 body
    too large), `POST /mcp` (JSON-RPC dispatch via StreamableHTTPServerTransport
    with both SSE and JSON response formats handled).
  - **MCP JSON-RPC over HTTP** — `tools/list` returns the 6-tool list,
    `tools/call generate_pdf` returns a base64 PDF in the MCP response shape.
  - **Misc** — `GET /unknown` 404, SIGTERM graceful shutdown within 1 second
    (skipped on Windows where SIGTERM maps to `TerminateProcess`).

### Changed

- **Test runner now builds first** — Added `pretest: npm run build` so the
  HTTP transport tests (which spawn the compiled binary) always run against a
  fresh `dist/`.

---

## [1.4.7] — 2026-05-06

### Fixed

- **HTTP server now binds `127.0.0.1` by default** — Previously `httpServer.listen(port)`
  with no host argument defaulted to `0.0.0.0`, exposing the server on all network
  interfaces. The `MCP_HOST` env var was documented but never actually read at bind time.
  Now reads `MCP_HOST ?? '127.0.0.1'` and passes it explicitly. Users who intentionally
  want all-interface binding must now set `MCP_HOST=0.0.0.0` explicitly.

---

## [1.4.6] — 2026-05-05

Tool description accuracy and docs polish following pretext-pdf v1.0.7 upgrade.

### Fixed

- **`docs/index.html`: demo uses `₹` instead of `Rs.`** — The sample invoice demo now
  displays the correct Indian Rupee symbol (`₹`) instead of the ASCII approximation `Rs.`
  across all six occurrences (invoice table headers, subtotal/IGST/total lines, report
  price-per-sqft column, and resume ARR figure).

### Changed

- **`list_element_types`: `paragraph` and `heading` now document `dir` prop** — Both
  element descriptions now list `dir` (ltr|rtl|auto) so LLMs know RTL text is supported
  without having to guess or check the schema.

- **`generate_invoice` description: currency-symbol guarantee documented** — Tool
  description now states that `₹ $ € £` symbols are guaranteed not to break away from
  adjacent numbers, clarifying a layout correctness property of the underlying engine.

---

## [1.4.5] — 2026-05-04

GTM polish: tool descriptions, MCP_PORT alias, stdio startup message, npm keywords, README accuracy.

### Fixed

- **`src/index.ts`: `MCP_PORT` env var** — Server now reads `MCP_PORT` (with `PORT` as fallback) so the documented `MCP_PORT=3000` env var actually works. Previously only `PORT` was read, silently ignoring `MCP_PORT`.
- **`src/index.ts`: stdio startup message** — `npx pretext-pdf-mcp` now emits a confirmation line to stderr (`pretext-pdf-mcp vX.Y.Z ready (stdio)`) so users can verify the server started.
- **README: `validate_document` strict default** — Description corrected from "`strict: true` (default)" to "`strict: false` is the default", matching what was shipped in v1.4.4.
- **README: `list_element_types` element count** — Corrected from "16 element types" to "22 element types".
- **README: `generate_from_markdown`** — Updated description to mention GFM tables, task lists, strikethrough, and inline code support; clarified code block limitation.
- **README: base64 decode examples** — Added browser/TypeScript decode example alongside Node.js and Python.
- **README: tool count phrasing** — "6 PDF generation tools" corrected to "6 MCP tools".

### Changed

- **Tool descriptions** — All four generation tool descriptions improved for LLM routing accuracy:
  - `generate_pdf`: now explicitly says to use it "for any layout not covered by generate_invoice or generate_report".
  - `generate_from_markdown`: lists all supported Markdown extensions including GFM tables and task lists.
  - `generate_invoice`: documents IGST vs CGST+SGST routing via `supplier.state`/`buyer.state`; clarifies `gst_rate` works for any tax system.
  - `generate_report`: mentions auto-features (TOC, bookmarks, page-numbered footer, running header).
- **`package.json` keywords** — Expanded from 8 to 20 keywords covering `mcp-server`, `model-context-protocol`, `json-to-pdf`, `cursor`, `windsurf`, `serverless-pdf`, `no-chromium`, `resume`, etc.
- **`package.json` description** — Rewritten to include searchable tokens: "Serverless, no Chromium. Invoices, reports, resumes."
- **`smithery.yaml`** — Added `configSchema` and `exampleConfig` for better Smithery listing quality.

---

## [1.4.4] — 2026-05-04

Audit fixes: locale correctness, invoiceNo divergence, error handling, strict default, crash guards.

### Fixed

- **`generate_invoice`: currency locale bug** — `formatMoney` now uses the correct `Intl` locale per currency (`en-IN` for INR, `en-US` for USD, `de-DE` for EUR, `en-GB` for GBP). Previously, all currencies used `en-IN`, rendering `$100,000` as `$1,00,000`.
- **`generate_invoice`: `invoiceNo` divergence** — The fallback invoice number is now generated once in the handler and passed into `buildInvoiceDocument`, so the PDF content and the returned filename always agree.
- **`generate_invoice`: error logging condition** — The `!(err instanceof Error) || !e.code` guard is now consistent with all other tools (was just `!e.code`).
- **`generate_invoice`: `upi_qr_data` type safety** — Added `upi_qr_data?: string` to the `InvoiceInput` interface; removed the two `as any` casts in `buildInvoiceDocument`.
- **`validate_document`: strict default** — Description and runtime default both now say `false`, matching the `pretext-pdf` library default (was incorrectly `true`).
- **`src/index.ts`: outer try/catch in MCP request handler** — Unhandled throws from tool handlers are now caught and returned as structured `INTERNAL_ERROR` JSON. Unknown tool response also uses JSON format.
- **`src/index.ts`: HTTP handler top-level error boundary** — A `try/catch` now wraps the entire async handler body, preventing unhandled rejections on client disconnects or unexpected errors.
- **`list_element_types`: error response format** — The `DOCUMENTATION_DRIFT` error response is now JSON (`{ success, error, message }`) matching all other tools.
- **`generate_pdf`: `Array.isArray` guard** — Array inputs are now rejected at the `document` validation step instead of reaching `render()`.
- **Filename empty-string fallback** — All four tools now use `||` instead of `??` for filename assignment so an empty string `""` falls back to the default.
- **`generate_from_markdown`: description accuracy** — Code blocks noted as plain text (not monospace), list nesting updated to "up to 3 levels".

### Changed

- **`marked` moved to `peerDependencies` (optional)** — `marked` is now an optional peer dep (`>=9.0.0`) instead of a direct dependency, and also added to `devDependencies` so tests continue to pass. Consumers who don't use `generate_from_markdown` no longer install `marked` unnecessarily.

---

## [1.4.3] — 2026-05-04

Picks up pretext-pdf@1.0.5 schema/validation improvements. Adds `highlight.js` peer dep.

### Changed

- **`pretext-pdf` bumped to `^1.0.5`** — picks up:
  - `ValidationResult.warningCount` field (no longer need to filter client-side)
  - JSON Schema now covers all remaining fields across 9 element types
  - `validateDocument()` and `pretext-pdf/schema` documented in README

### Added

- **`highlight.js` added as optional peer dependency** — mirrors the peer dep already declared
  in `pretext-pdf`. Users installing `highlight.js` for syntax-highlighted code blocks now get
  correct npm peer resolution without a missing-peer warning from this package.

---

## [1.4.2] — 2026-05-04

Audit follow-up: honest `warning_count` reporting, picks up schema fixes from
`pretext-pdf@1.0.4`.

### Fixed

- **`validate_document`: `warning_count` now computed from `severity`** — was
  hardcoded to `0`. The handler now partitions `result.errors` by `severity`
  into `errors` (severity !== 'warning') and `warnings` (severity === 'warning'),
  reporting accurate counts. Previously, any warning-severity entries the
  underlying library emitted would have been silently misreported as errors.

### Changed

- **`pretext-pdf` bumped to `^1.0.4`** — picks up:
  - JSON Schema `$schema` dialect URI corrected
  - `hr` element schema: `spaceAbove`/`spaceBelow` added (primary fields)
  - `float-group` and `chart` added to schema's element `anyOf`
  - Document `sections` and other coverage gaps filled

---

## [1.4.1] — 2026-05-03

validate_document response shape extended, CI workflow consolidated.

### Added

- **`validate_document` response now includes `warning_count` and `warnings`** — all responses
  include `warning_count: 0` and `warnings: []`. Reserved for future warning-severity feedback.
  Backwards-compatible additive change.

### Changed

- **`pretext-pdf` bumped to `^1.0.3`** — picks up `pretext-pdf/schema` JSON Schema export,
  simplified `marked` peer dep range, and `fonts.ts` cast removal.

- **CI: `release-on-tag.yml` merged into `ci.yml`** — `release` job now has `needs: [publish]`,
  ensuring GitHub Release is only created after tests pass and npm publish succeeds. Eliminates
  the race condition where a release could fire before CI completed.

- **README: `validate_document` response examples** updated to include `warning_count` and `warnings`.

---

## [1.4.0] — 2026-05-03

Structured validation errors, page_size guard, README improvements, and CI hardening.

### Changed

- **`validate_document` now returns structured `errors[]`** — response shape changes from
  `{ valid, error_count, message: string }` to `{ valid, error_count, errors: ValidationError[] }`.
  Each error object carries `path`, `message`, `code`, `severity`, and an optional `suggestion`
  field for typo corrections. Backed by the new `validateDocument()` API in `pretext-pdf` v1.0.2.

- **Bumped `pretext-pdf` from `^1.0.1` to `^1.0.2`**. New capabilities available:
  - `validateDocument()` — non-throwing validation returning structured `ValidationResult`
  - `Logger` interface — route warnings via `RenderOptions.logger` instead of `console.warn`
  - Inter italic font bundled — `fontStyle: 'italic'` and italic markdown work without manual setup

### Added

- **`generate_from_markdown`: `page_size` runtime validation** — returns `VALIDATION_ERROR`
  immediately if an unsupported value is passed (accepted: `A4`, `Letter`, `Legal`), rather
  than propagating the error from deep inside the renderer.
- **README: Claude Code CLI quick-start** — `claude mcp add pretext-pdf-mcp -- npx -y pretext-pdf-mcp`.
- **README: HTTP transport mode** — documents `MCP_TRANSPORT=http`, `MCP_PORT`, `MCP_HOST` and
  the `--host` security caveat for non-localhost binding.
- **README: Known Limitations section** — documents italic fonts, optional dependencies, SVG
  rendering, large-document performance, and CJS support status.
- **`.gitattributes`** — enforces LF line endings in CI to prevent CRLF drift in `dist/`.
- **`CONTRIBUTING.md`** and **`SECURITY.md`** — standard community health files.

### CI

- **Reverted actions to `@v4` stable** — `actions/checkout` and `actions/setup-node` were
  on `@v5` (beta) which has known issues. Pinned back to the stable v4 release.
- **Added `npm audit --audit-level=high`** step to test job (`continue-on-error: true`).
- **Added `--provenance`** to `npm publish` with `id-token: write` permission for SLSA attestation.

---

## [1.3.1] — 2026-05-02

Docs and manifest patch. No tool behavior changes.

### Added

- **`generate_from_markdown` and `validate_document` documented in README** — both tools
  were implemented in 1.0.5 but never added to the Tools table or given their own `###`
  sections. Users of Smithery / Claude Desktop had no reference for these two tools.
- **`peerDependencies` for optional pretext-pdf features** — `@napi-rs/canvas`, `bwip-js`,
  `qrcode`, `vega`, `vega-lite` added as optional peers so npm warns users when they try
  to use chart, QR, or barcode elements without the required package installed.

---

## [1.3.0] — 2026-05-02

Bumps core dependency to the stable v1.0.0 release. No MCP surface changes.

### Changed

- **Bumped `pretext-pdf` from `^0.9.3` to `^1.0.0`**. Key additions now available:
  - Plugin extension API (`PluginDefinition`, `PluginMeasureContext`, etc.) — register
    custom element types via `RenderOptions.plugins`
  - `PdfBuilder` / `PdfBuilderOptions` exported from public surface
  - `TocEntryElement` individually importable
  - `Intl.Segmenter` pre-flight guard in `render()` — clear error on old runtimes
  - `PluginRenderContext.pageWidth/pageHeight/margins` for full page geometry in plugins
  - Drift guard CI step: `api:check` catches unintentional public-API changes
  - `table-determinism` contract test ensures pagination is deterministic
  - Stress tests moved to non-blocking CI step (`continue-on-error: true`)

- **CI actions v4 → v5** (`actions/checkout`, `actions/setup-node`) across both
  `ci.yml` and `release-on-tag.yml` — GitHub deprecates the Node 20-based v4 runtime
  on 2026-06-02.

### Fixed

- **`dist/` removed from `.gitignore`** — the built JS files were already intentionally
  tracked (listed in `package.json files`) but the stale `.gitignore` entry caused
  IDE/tool confusion. Root-cause fix: align `.gitignore` with what the repo actually tracks.

---

## [1.2.1] — 2026-04-22

Post-release fixes from the Tier 0.5 audit.

### Fixed

- **Error propagation in `generate-invoice` tool** — unhandled promise rejections from
  `render()` are now caught and returned as structured MCP error responses instead of
  crashing the server process.
- **`list-elements` output completeness** — all built-in element types now appear in the
  listing; two types were previously omitted due to a stale hardcoded list.

---

## [1.2.0] — 2026-04-22

Core-sync release. Brings the MCP wrapper forward from the outdated `pretext-pdf@^0.8.0` pin to `^0.9.2`, so Smithery users stop getting two-version-old bugs.

### Changed

- **Bumped `pretext-pdf` dependency from `^0.8.0` to `^0.9.2`**. Key improvements now available to MCP consumers:
  - Rich-paragraph leading-space preservation after `\n` hard breaks (core 0.9.1)
  - Callout title-row protection on mid-page splits (core 0.9.1)
  - Producer-validator contract for measured blocks (core 0.9.1)
  - SSRF guard on image URLs, markdown nesting caps (core 0.8.3)
  - Rich-paragraph whitespace-collapse fix, sentinel-char measurement (core 0.8.2)
  - Browser-safe imports (core 0.8.1)
  - CJK opening-bracket wrap fix + native `letterSpacing` from `@chenglou/pretext@0.0.6` (core 0.9.2)

### Removed

- **`version` field from `smithery.yaml`**. The field is display-only because Smithery invokes `npx -y pretext-pdf-mcp` which always pulls the latest npm version. Keeping the field guaranteed drift (see 1.0.8 entry — it had to be manually bumped then and would drift again). Root fix instead of band-aid.

### Added

- **`renovate.json`** — watches deps, auto-merges green devDependency bumps, opens a loud PR on any `pretext-pdf` core bump (labeled `core-sync`). This was the gap that let the wrapper drift to two core versions behind.

### Note on CHANGELOG gap

Versions 1.0.9–1.1.2 were unpublished development snapshots that were not released to npm; no CHANGELOG entries were written. The gap in the public history between 1.0.8 and 1.2.0 is intentional. Going forward, every tagged npm release has a CHANGELOG entry (enforced by the `release-on-tag.yml` CI workflow that shipped in v1.3.0).

---

## [1.0.8] — 2026-04-13

### Fixed

- **Critical: /mcp endpoint crashed on malformed JSON** — Missing try-catch around `JSON.parse()` caused unhandled exceptions. Now returns HTTP 400 with `{error: "Invalid JSON body"}`, consistent with `/api/generate`.
- **Critical: generate_pdf error response was plain text** — Validation error returned `{type: 'text', text: 'Error: ...'}` instead of JSON, breaking clients that expected `{success, error, message}`. Now consistent with all other tools.
- **High: isClientError() misclassified internal errors as 400** — Non-PretextPdfError exceptions (TypeError, RangeError, etc.) were mapped to HTTP 400. Now correctly returns 500 for unexpected server errors; 400 only for known client-caused PretextPdfErrors.
- **High: PORT env var NaN on invalid input** — `parseInt("abc")` returns NaN, causing server to bind to a random port silently. Now exits with a clear error message.
- **Medium: GST calculation floating-point drift** — Accumulated rounding errors in per-rate GST totals (e.g. `18% of ₹250,000 = ₹45,000.00000000001`). All GST amounts now rounded to 2 decimal places at each step.
- **Low: Dead `columns` variable in generate-report.ts** — Unused intermediate `columns` array was computed and suppressed with `void columns`. Removed entirely.
- **Low: smithery.yaml version was stale** — Showed `1.0.1` instead of matching package.json. Now tracks current version.

---

## [1.0.7] — 2026-04-13

### Fixed

- **Critical: Version mismatch** — Hardcoded server version (1.0.0) didn't match package.json (1.0.6). Now correctly reports 1.0.7.
- **Critical: Unsafe type casting in API endpoint** — Added `validatePdfDocumentInput()` to reject null/undefined/non-object inputs before calling `render()`. Previously would pass invalid types and throw cryptic errors.
- **High: Inconsistent error categorization** — Added `isClientError()` to distinguish client validation errors (HTTP 400) from server errors (HTTP 500). Error responses now include `code` field for debugging.
- **Medium: MAX_BODY limit too small** — Increased from 100 KB to 500 KB on `/api/generate` to support PDFs with images, rich formatting, and v0.5.1+ features. Now consistent with `/mcp` endpoint.
- **High: Missing input validation** — `/api/generate` now validates `body.data` is an object before calling `render()`, preventing silent type coercion failures.
- **Low: Missing limit documentation** — Added detailed comments explaining the 500 KB limit rationale on both endpoints.

### Test Coverage

- pretext-pdf: 442/442 tests passing
- pretext-pdf-mcp: 14/14 tests passing

---

## [1.0.6] — 2026-04-13

### Security

- Per-chunk size enforcement on both HTTP endpoints (`/api/generate` 100KB, `/mcp` 500KB).
  Previously the full request body was buffered before the size check, allowing memory exhaustion via large payloads.

### Changed

- Bumped `pretext-pdf` dependency to `^0.5.0` to pick up security hardening, CJK/Thai i18n,
  validation improvements, `defaultParagraphStyle`, per-section headers/footers, and tabular numbers.

---

## [1.0.5] — 2026-04-09

### Added

- Live demo at <https://himaan1998y.github.io/pretext-pdf-mcp/>
- StackBlitz playground link in README
- Smithery registry integration (`https://pretext-pdf.run.tools`)
- `generate_invoice` tool: GST-aware invoices with INR/USD/EUR/GBP support
- `generate_report` tool: multi-section reports with optional TOC, tables, and callouts
- `list_element_types` tool: returns a markdown reference of all 16 element types
- Docker support via `Dockerfile`
- Claude Desktop configuration documented in README

### Changed

- HTTP server mode: `PORT` env var enables REST API alongside stdio MCP transport
- Tool descriptions expanded for better LLM comprehension

---

## [1.0.0] — 2026-04-08

### Added

- Initial release
- `generate_pdf` tool: full `PdfDocument` JSON → Base64 PDF
- Stdio MCP transport (compatible with Claude Desktop, Cursor, Windsurf)
- HTTP transport for stateless `/mcp` endpoint
