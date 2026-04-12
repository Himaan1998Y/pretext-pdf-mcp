# Changelog

All notable changes to pretext-pdf-mcp are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
