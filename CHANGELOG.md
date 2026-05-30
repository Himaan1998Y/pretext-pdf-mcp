# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to pretext-pdf-mcp are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.5.11] — 2026-05-30

### Changed

- **pretext-pdf dependency updated to v2.0.14**, which vendors pretext v0.0.7-patched.1.
  Users get improved text layout: better CJK/mixed-script handling, punctuation wrapping improvements, symbol handling enhancements, and performance optimizations from upstream v0.0.7.

---

## [1.5.10] — 2026-05-29

Security hardening, tsconfig tightening, and test coverage improvements from final review pass.

### Security

- **Error messages sanitized before returning to MCP caller** — All four tool handlers (`generate_pdf`, `generate_invoice`, `generate_report`, `generate_from_markdown`) now return `"Internal error — see server logs for details"` for non-`PretextPdfError` exceptions. Raw `err.message` from unknown third-party or runtime errors (which may contain internal paths or socket details) is written to `process.stderr` only (F-2).

### Changed

- **`tsconfig.json` hardened** — Added `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` alongside the existing `strict: true`. (`exactOptionalPropertyTypes` was evaluated but skipped — incompatible with `@modelcontextprotocol/sdk` transport types.)

### Tests Added

- `test/safety.test.ts` — 39 tests covering `hasUnsafeKeys` (depth limits, array walking, prototype key variants) and `runDocumentSafetyChecks` (response envelope shape, error cases).
- `test/base64.test.ts` — 10 tests covering `toBase64` (Buffer, Uint8Array, empty input, large payload, round-trip contract).

---

## [1.5.9] — 2026-05-29

Handler validation test coverage and report-build edge case tests.

### Tests Added

- `test/generate-report-handler.test.ts` — 13 handler-level unit tests covering all validation paths: missing title, empty sections, invalid callout style, unsafe keys (`__proto__`), response shape contract on both error and success paths (H-2)
- `test/report-build.test.ts` — 7 new tests: table + callout coexistence and render order (TG-5); empty body, whitespace-only body, date-omitted default, `include_toc` flag behaviour (TG-6)

## [1.5.8] — 2026-05-29

Sprint 5A: generate-report.ts type safety, buildReportDocument unit tests.

### Changed

- **`generate-report.ts`: `sections` typed as `ReportSection[]`** — was `any[]`. The
  `ReportSection` interface was already declared in the file; casting `args.sections` to
  it eliminates five `(s.table as any)` and `(s.callout as any)` casts in the validation
  loop. `buildReportDocument` is now exported for direct unit testing.

### Tests

- **`test/report-build.test.ts`**: 16 unit tests for `buildReportDocument` covering
  document structure (h1 title, TOC, header/footer), section rendering (headings,
  multi-paragraph body, table rows, callout style/content), and edge cases (subtitle,
  author/date, TOC opt-out).

---

## [1.5.6] — 2026-05-28

Sprint 4: Split `generate-invoice.ts` (562 LOC) into focused `invoice/` submodules.

### Changed

- **`src/tools/generate-invoice.ts` split into `invoice/` submodules** — The 562-line file is
  refactored into three focused files:
  - `invoice/types.ts` (46L) — `InvoiceParty`, `InvoiceItem`, `InvoiceInput` interfaces + `SUPPORTED_CURRENCIES`, `CURRENCY_SYMBOLS`, `CURRENCY_LOCALES` constants
  - `invoice/build.ts` (216L) — `formatMoney`, `partyBlock`, `todayISO`, and `buildInvoiceDocument` (the document-construction logic)
  - `generate-invoice.ts` (252L) — MCP schema + validation handler only (imports from `invoice/`)
  Also fixed latent `spaceBelow` → `spaceAfter` bug in the totals section HR elements (type-checked now that content array is typed).
  The public `generateInvoiceTool` export is unchanged.

---

## [1.5.5] — 2026-05-28

Post-sprint audit fixes: CRITICAL gst_rate handler, CTRL_CHARS completeness, SSRF guard.

### Fixed

- **CRITICAL: `gst_rate` runtime validation aligned with schema** — The Sprint 1 fix
  removed the `enum: [0,5,12,18,28]` constraint from the JSON schema but the handler still
  rejected non-slab values with `"must be one of [0, 5, 12, 18, 28]"`. Now validates
  `0 ≤ gst_rate ≤ 100` (finite number) matching the documented schema behavior.
  Callers using 20% UK VAT, 19% German VAT, etc. no longer receive unexpected VALIDATION_ERROR.

- **CTRL_CHARS guard extended to `from.gstin`, `to.gstin`, and `items[i].hsn_code`** — These
  three fields are rendered as PDF text but were missing from the control-character injection
  check. All rendered text fields are now covered.

- **`?api=` URL parameter SSRF protection** — `docs/index.html` now validates the override URL
  with `new URL(param)` and requires `protocol === 'https:'`, preventing the page from being
  used as an open SSRF proxy by a crafted link.

- **`v1.5.2` semver tag created** — Only `v1.5.2-audit` existed; the canonical `v1.5.2` tag is
  now present on the correct commit.

---

## [1.5.4] — 2026-05-28

Sprint 3 audit fix: docs/index.html API endpoint now configurable.

### Fixed

- **`docs/index.html`: demo API URL is now configurable** — Previously hardcoded to
  `https://mcp.57.129.125.171.sslip.io/api/generate`. Now reads `?api=` query param
  with the hardcoded URL as fallback. Playground continues working at the default server,
  and private deployments can override: `?api=https://your-host/api/generate`.

---

## [1.5.3] — 2026-05-28

Sprint 2 audit fixes: type safety, tool schema quality, code element description.

### Fixed

- **`generate-report.ts`: `content` array typed as `ContentElement[]`** — was `any[]`, losing
  type coverage across the entire document-construction block. Also fixed `spaceBelow` →
  `spaceAfter` on the HR element (stale property name).

- **`generate-report.ts`: `VALID_CALLOUT_STYLES` hoisted to module scope** — was re-allocated
  as a new array inside every loop iteration; now derived from `Object.keys(CALLOUT_COLORS)` once.

- **`generate-report.ts`: `fracColumns` typed as `Pick<ColumnDef, 'width' | 'align'>[]`** —
  eliminates `'1*' as any` cast; `` `${number}*` `` satisfies the `ColumnDef.width` union directly.

- **`generate-invoice.ts`: `args.from`/`args.to`/`args.items` typed via existing interfaces** —
  `as any` casts replaced by `as InvoiceParty` and `as InvoiceItem[]` after structural guards
  already confirmed the shapes.

- **`generate_pdf` tool schema expanded** — Added `properties` block covering `content`,
  `pageSize`, `margins`, `metadata`, `header`, `footer`, `defaultFont`, `fonts`, `watermark`,
  `encryption`, and `bookmarks`. AI agents now get schema guidance without having to call
  `list_element_types` first.

- **`list-elements.ts`: `code` element description corrected** — Previously stated "no syntax
  highlighting"; corrected to document that syntax highlighting is available when the optional
  `highlight.js` peer dep is installed.

---

## [1.5.2] — 2026-05-28

Sprint 1 audit fixes: CTRL_CHARS coverage, gst_rate schema correctness, dependency security.

### Fixed

- **`generate_invoice`: CTRL_CHARS guard extended to `from.email`, `from.phone`, `to.email`,
  `to.phone`, and `notes`** — these fields are rendered into PDF paragraph text but were missing
  from the control-character injection check. All rendered text fields are now covered.

- **`gst_rate` enum constraint removed** — the schema previously hard-coded `[0, 5, 12, 18, 28]`
  (Indian GST slabs) while the tool description claimed "use for any tax system (GST, VAT, sales
  tax)". Now accepts any non-negative value up to 100 with `minimum: 0, maximum: 100`, and the
  description lists common GST slabs as examples. Callers using 20% UK VAT or 8.25% Texas sales
  tax no longer get a confusing enum validation error.

- **Dependency audit** — `npm audit fix` resolved `fast-uri <=3.1.1` CVE (GHSA-v39h-62p7-jpjc)
  in the production dependency chain (`@modelcontextprotocol/sdk → ajv → fast-uri`).

---

## [1.5.1] — 2026-05-28

Patch: `isClientError` routing robustness after v2.0.0 audit.

### Fixed

- **`isClientError` now derives HTTP-400 classification from `PretextPdfError.category`** —
  The previous hardcoded list of error codes had drifted from the full set of caller-caused
  errors (missing `ITALIC_FONT_NOT_LOADED`, `FORM_FIELD_NAME_DUPLICATE`, footnote orphan codes,
  etc.). The new implementation classifies by `category` (`validation`, `security`, `dependency`,
  `image`, `layout` → 400) with a supplemental set for `font`/`render` codes that are still
  caller-caused. This eliminates future drift as new error codes are added to the library.

---

## [1.5.0] — 2026-05-28

Upgrade to `pretext-pdf` v2.0.0 (major breaking release). MCP server version bumped to `1.5.0` to signal the new peer requirement.

### Breaking Changes (inherited from library v2.0.0)

- **`FormFieldElement` is now a discriminated union** — Callers passing `form-field` elements must include a `fieldType` (`"text"`, `"checkbox"`, `"radio"`, `"dropdown"`, `"button"`). Elements without `fieldType` will fail validation.
- **`spaceAbove` / `spaceBelow` removed from `hr` elements** — Use `spaceBefore` / `spaceAfter` (the canonical field names). Any documents using the old aliases will fail validation.
- **`ValidationResult.warningCount` removed** — Check `result.errors.length` with `severity === 'warning'` filter if needed.

### Added (inherited from library v2.0.0)

- **`accessibilityLabel` wired to PDF `/TU` entry** — Form fields with `accessibilityLabel` now write the `/TU` (tooltip/alt-text) AcroForm annotation entry into the PDF, making screen readers announce the label.
- **`accessibility` / `semantic` metadata wired to PDF Info dict** — Document-level accessibility and semantic metadata is now serialized as JSON strings into the PDF Info dictionary (`Accessibility` / `Semantic` keys).
- **`./signing` subpath export** — `pretext-pdf/signing` is a new public entry point for the signing primitives (`applySignature`, `applyEncryption`, `applyPostProcessing`, `renderSignaturePlaceholder`). The signing code now lives in its own module.
- **SVG `on*` newline-injection fix** — `sanitizeSvg` now catches event handler attributes split across a newline (e.g. `on\nload=...`), closing a bypass in the prior regex.
- **`MAX_SVG_ELEMENTS = 5000` guard** — SVGs with more than 5000 open tags skip the sanitizer entirely (returned as-is) to prevent regex DoS on deeply nested input.

### Changed

- **`pretext-pdf` peer dependency** — `^1.7.0` → `^2.0.0`.
- **`ValidationResult` and `ValidationError` fields are now `readonly`** — Callers that mutate the returned arrays will get TypeScript compile errors.

---

## [1.4.18] — 2026-05-27

Sync to `pretext-pdf` v1.7.1 security hotfix. HTTP status mapping hardened.

### Security (inherited from library v1.7.1)

- **SVG `<style>` @import stripping** — `sanitizeSvg` now removes `@import` directives; outbound network requests triggered by crafted SVG style blocks are no longer possible.
- **SVG `<style>` `url(javascript:|vbscript:|data:)` stripping** — Closes an injection path in CSS property values that bypassed the existing `<a href>` and `<image href>` attribute filters.
- **SVG `<style>` `url(https?://...)` stripping (defense-in-depth)** — Prevents external stylesheet hot-linking from rasterized SVG content.

### Fixed

- **`isClientError` — removed stale `ENCRYPTION_NOT_AVAILABLE` code** — This code was removed from the library in a prior version; its presence was causing unknown errors to be misclassified as HTTP 400 instead of 500.

- **`isClientError` — 12 missing error codes added** — `MARKDOWN_DEP_MISSING`, `RTL_REORDER_FAILED`, `CHART_LOAD_FAILED`, `QR_DEP_MISSING`, `BARCODE_DEP_MISSING`, `CHART_DEP_MISSING`, `BARCODE_SYMBOLOGY_INVALID`, `CHART_SPEC_INVALID`, `SIGNATURE_DEP_MISSING`, `PATH_TRAVERSAL`, `UNKNOWN_PROPERTY`, and `INVALID_INPUT` were all being returned as HTTP 500 when they should be 400. These map to errors caused by bad caller input or missing optional dependencies that the caller controls.

### Changed

- **`pretext-pdf` dependency** — `^1.6.0` → `^1.7.0`. The `^1.6.0` range already resolved to `v1.7.0` (via semver), but the explicit pin documents that v1.7.0's signing rewrite and v1.7.1's SVG security fixes are the intended baseline.

### Notes

- CHANGELOG v1.4.17 previously stated "Catch-up sync to pretext-pdf v1.6.0"; the library had already advanced to v1.7.0 before that release. v1.4.18 makes the dependency explicit.

---

## [1.4.17] — 2026-05-25

Catch-up sync to `pretext-pdf` v1.6.0. No MCP surface changes; inherits the
library's security hardening and architectural sprint.

### Changed

- **`pretext-pdf` dependency bumped from `^1.1.0` to `^1.6.0`** — three library
  minors and a major architectural sprint. The MCP imports (`render`,
  `validateDocument`, `ELEMENT_TYPES`, `PdfDocument`, `ValidationError`,
  `markdownToContent`) are unchanged in v1.6.0's public surface. Library
  satisfies its own `pretextPdf.mcpCompat` range (`>=1.4.0 <2.0.0`) for this
  MCP version.

### Security (inherited from library)

- **SVG sanitizer hardening (library v1.6.0)** — Inline SVGs now strip
  `<foreignObject>` (XSS surface for HTML-in-SVG), `javascript:` URI schemes
  on `<a href>`, and CSS `expression()` calls. The MCP doesn't expose the
  sanitizer directly, but any caller passing inline SVG through
  `generate_pdf` benefits automatically.
- **IPv4 alternative-notation SSRF closure (library v1.5.2)** — Decimal,
  octal, hex, and short-form IPv4 representations (e.g. `2130706433`,
  `0177.0.0.1`, `0x7f000001`, `127.1`) now resolve and are rejected as
  loopback by the same guard that handled dotted-quad. Closes the
  `generate_pdf` URL-image fetch bypass.
- **7 architectural verification gates inherited from library v1.6.0** —
  Plugin registry contract, table-determinism contract, drift guards on
  public API surface, benchmark corpora regression locks, and three new
  contract tests covering asset DNS-dedup, asset concurrency, and asset
  cold-start performance. These are library-internal but eliminate a class
  of regression risk that would have surfaced as runtime errors in MCP
  calls.

### Notes

- `@signpdf/signpdf`, `@signpdf/placeholder-pdf-lib`, `@signpdf/signer-p12`
  are declared as optional peer deps in `pretext-pdf` v1.6.0. The MCP does
  not currently expose signing tools, so these are **not** mirrored into
  this package's peerDependencies. Will sync if/when a signing tool ships.

---

## [1.4.16] — 2026-05-22

### Changed

- **Concurrency cap defaults** — `MAX_CONCURRENT_RENDERS` now defaults to **8** (was 4) and is configurable via the new `MCP_MAX_CONCURRENT_RENDERS` env var. The legacy `MCP_MAX_CONCURRENT` name is still honored as a fallback for backward compatibility.
- **Overload response code** — When the in-flight render cap is reached, the server now returns **`503 Service Unavailable`** (was `429`) with `Retry-After: 5`. 503 better matches the semantics of a transient global capacity limit; 429 is reserved for per-client rate limits.

### Security

- **IPv6 wildcard bind detection (audit closure)** — Public-bind guard now uses an explicit loopback allow-list and a documented wildcard set (`0.0.0.0`, `::`, `::0`, `0:0:0:0:0:0:0:0`). Behavior is unchanged for IPv4 — the guard already rejected any non-loopback host without `MCP_API_KEY` — but IPv6 wildcards are now explicitly recognized, logged, and covered by tests.

### Tests

- New `test/http-transport.test.ts` cases: server refuses to start on `MCP_HOST=::` and `MCP_HOST=::0` without an API key.

---

## [1.4.15] — 2026-05-17

### Fixed

- **`checkJsonDepth` false positives** — Bracket characters inside JSON string values no longer inflate the depth count. Rewritten as a string-aware state machine that correctly skips quoted contents and handles escapes.
- **Markdown DoS via cheap-input/expensive-parse** — Added 200KB pre-parse character cap (`MAX_MARKDOWN_CHARS`) before `markdownToContent` to prevent crafted markdown from expanding into millions of elements.
- **`MAX_CONTENT_ELEMENTS` bypass via `generate_pdf`** — Element cap now applied to direct `generate_pdf` calls, not only the markdown path.

### Tests

- New `test/limits.test.ts` covering `checkJsonDepth` (including false-positive and escaped-quote cases), `assertOutputSize`, and all limit constants.

---

## [1.4.14] — 2026-05-17

### Added

- **JSON depth-bomb guard** (`src/index.ts`) — Both `/api/generate` and `/mcp` endpoints now
  call `checkJsonDepth()` before `JSON.parse()`. Requests with nesting deeper than 50 levels
  are rejected with `400 Bad Request`, preventing stack-overflow attacks via crafted payloads.

- **Output size cap** (`src/utils/limits.ts`, all generate tools) — `assertOutputSize()` is
  called after every `render()` call in `generate_pdf`, `generate_invoice`, `generate_report`,
  and `generate_from_markdown`. PDFs exceeding 50 MB are rejected with an `isError` response
  before base64 encoding, preventing memory exhaustion on unusually large documents.

- **Report sections limit** (`src/tools/generate-report.ts`) — `generate_report` now rejects
  requests with more than 100 sections (`MAX_REPORT_SECTIONS`), protecting the renderer from
  unbounded iteration.

- **Markdown element cap** (`src/tools/generate-from-markdown.ts`) — After `markdownToContent()`
  returns, element count is checked against `MAX_CONTENT_ELEMENTS` (500). Oversized parse output
  is rejected before the render pipeline starts.

- **HTTPS startup warning** (`src/index.ts`) — When the server binds to a public interface
  (`isPublicBind`) and `MCP_BEHIND_PROXY` is not set, a `[WARN]` message is emitted to stderr
  recommending HTTPS for public deployments.

- **`src/utils/limits.ts`** — New shared module exporting all limit constants
  (`MAX_PDF_OUTPUT_BYTES`, `MAX_CONTENT_ELEMENTS`, `MAX_REPORT_SECTIONS`, `JSON_MAX_DEPTH`)
  and guard functions (`checkJsonDepth`, `assertOutputSize`).

---

## [1.4.13] — 2026-05-16

### Fixed

- **HTTP: authenticated wrong-method requests on known paths return 405** — `GET`, `PUT`,
  `PATCH`, etc. on `/api/generate` and `/mcp` from authenticated callers now respond with
  `405 Method Not Allowed` and an `Allow: POST, OPTIONS` header, instead of `404 Not Found`.
  Unauthenticated callers with wrong method still receive `401` (intentional — avoids
  revealing endpoint existence to unauthorized parties).

- **HTTP: unauthorized request log now includes requester IP** — The `'unauthorized request'`
  log entry now carries an `ip` field (`req.socket.remoteAddress`) for forensic traceability.
  Previously the log only recorded the path.

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
