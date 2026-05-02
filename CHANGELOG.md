# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to pretext-pdf-mcp are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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

Entries for 1.0.9 through 1.1.2 were not written at the time. Git history is the authoritative record for those versions. Going forward, every tagged release gets a CHANGELOG entry — enforced by a future `release-on-tag.yml` workflow (tracked in the roadmap as Tier 2).

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
- Live demo at https://himaan1998y.github.io/pretext-pdf-mcp/
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
