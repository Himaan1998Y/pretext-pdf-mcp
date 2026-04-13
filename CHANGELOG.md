# Changelog

All notable changes to pretext-pdf-mcp are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
