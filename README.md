# pretext-pdf-mcp

[![npm version](https://img.shields.io/npm/v/pretext-pdf-mcp?style=flat-square)](https://www.npmjs.com/package/pretext-pdf-mcp)
[![npm downloads](https://img.shields.io/npm/dm/pretext-pdf-mcp?style=flat-square)](https://www.npmjs.com/package/pretext-pdf-mcp)
[![license](https://img.shields.io/npm/l/pretext-pdf-mcp?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Himaan1998Y/pretext-pdf-mcp/ci.yml?branch=master&style=flat-square&label=CI)](https://github.com/Himaan1998Y/pretext-pdf-mcp/actions/workflows/ci.yml)

MCP server for [pretext-pdf](https://github.com/Himaan1998Y/pretext-pdf) — generate professional PDFs from structured JSON in Claude, Cursor, or any AI agent.

No headless browser. No puppeteer. Pure Node.js with embedded fonts and precision text layout.

## Live Demo

**[▶ Open Live Demo](https://himaan1998y.github.io/pretext-pdf-mcp/)** — edit JSON, click Generate, see a real PDF in seconds. No install.

**[▶ Open in StackBlitz](https://stackblitz.com/github/Himaan1998Y/pretext-pdf-mcp/tree/master/docs?file=index.html)** — fork and edit the playground code.

4 templates included: GST Invoice · Market Report · Resume/CV · Custom

---

## Connect via Smithery

The fastest way — no install, works instantly in any MCP-compatible agent:

```text
https://pretext-pdf.run.tools
```

Or add via CLI:

```bash
smithery mcp add himaan4149-kv55/pretext-pdf
```

## Local Install (Claude Desktop / Cursor / Windsurf)

### Option 1: npx (no global install needed)

```bash
npx pretext-pdf-mcp
```

### Option 2: Global install

```bash
npm install -g pretext-pdf-mcp
pretext-pdf-mcp
```

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pretext-pdf": {
      "command": "npx",
      "args": ["-y", "pretext-pdf-mcp"]
    }
  }
}
```

Config file location:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

## Using with Claude Code CLI

**Option A — one-liner (user-scoped, persists across projects):**

```bash
claude mcp add pretext-pdf-mcp -- npx -y pretext-pdf-mcp
```

**Option B — project-scoped `.mcp.json` (checked into repo, shared with your team):**

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "pretext-pdf": {
      "command": "npx",
      "args": ["-y", "pretext-pdf-mcp"]
    }
  }
}
```

Then restart Claude Code (or run `/mcp` to verify). All 6 tools are available in your session. Type `/mcp` to confirm the server appears.

## HTTP Transport Mode (advanced)

By default the server runs over stdio (MCP standard transport). For HTTP transport:

```bash
MCP_TRANSPORT=http MCP_PORT=3000 npx pretext-pdf-mcp
```

Environment variables:
- `MCP_TRANSPORT` — Set to `http` to enable HTTP transport (default: `stdio`)
- `MCP_PORT` — HTTP listen port when `MCP_TRANSPORT=http` (default: `3000`)
- `MCP_HOST` — HTTP listen host (default: `127.0.0.1`)

> **Security note:** HTTP transport is intended for trusted local networks only. Do not expose the HTTP port to the public internet without adding an authentication layer.

## Known Limitations

- **Italic fonts** — Italic markdown (`*text*`) requires an italic font variant. Inter italic is supported via `@fontsource/inter` (installed automatically). For other fonts, provide `{ family, weight, style: 'italic', src }` in `doc.fonts`.
- **QR codes, barcodes, charts** — Require optional peer dependencies: `qrcode`, `bwip-js`, `vega`/`vega-lite`. Install the ones you need.
- **SVG and images** — Image URLs must be HTTPS. Private/local IP addresses are blocked (SSRF prevention). File paths require absolute paths.
- **Large documents** — No hard page limit, but generation time scales with page count. Documents over 10,000 content elements trigger a performance advisory.
- **CJS consumers** — pretext-pdf is ESM-only. If your project uses CommonJS, use dynamic `import()`.

## Tools

| Tool | Input | Output |
|------|-------|--------|
| `generate_pdf` | PdfDocument JSON descriptor | Base64 PDF + filename + size |
| `generate_invoice` | Invoice data (parties, items, GST, currency) | Base64 PDF |
| `generate_report` | Report sections with optional tables and callouts | Base64 PDF |
| `generate_from_markdown` | Markdown string | Base64 PDF |
| `validate_document` | PdfDocument JSON | Validation result (valid/errors) |
| `list_element_types` | none | Markdown reference of all element types |

### generate_pdf

Full-power access to the pretext-pdf API. Pass any PdfDocument descriptor.

```json
{
  "document": {
    "pageSize": "A4",
    "footer": { "text": "Page {{pageNumber}} of {{totalPages}}", "fontSize": 9 },
    "content": [
      { "type": "heading", "level": 1, "text": "My Document" },
      { "type": "paragraph", "text": "Hello world." }
    ]
  },
  "filename": "my-document"
}
```

Returns:
```json
{
  "success": true,
  "base64": "<base64-encoded PDF bytes>",
  "filename": "my-document.pdf",
  "size_bytes": 42816
}
```

### generate_invoice

Business-friendly invoice generator. No PDF knowledge needed.

```json
{
  "from": {
    "company": "Antigravity Systems",
    "address": "Gurugram, Haryana",
    "gstin": "06AABCA1234Z1ZK",
    "email": "hello@antigravity.dev"
  },
  "to": {
    "company": "TCS Ltd",
    "address": "Mumbai, Maharashtra",
    "gstin": "27AAACT2727Q1ZW"
  },
  "invoice_number": "INV-2026-001",
  "date": "2026-04-08",
  "due_date": "2026-05-08",
  "currency": "INR",
  "items": [
    {
      "description": "LLM Fine-tuning Pipeline",
      "hsn_code": "998314",
      "quantity": 1,
      "rate": 250000,
      "gst_rate": 18
    },
    {
      "description": "AI Strategy Workshop",
      "quantity": 2,
      "rate": 75000,
      "gst_rate": 18
    }
  ],
  "notes": "Payment due within 30 days. NEFT/IMPS preferred."
}
```

Returns:
```json
{
  "success": true,
  "base64": "<base64-encoded PDF bytes>",
  "filename": "invoice-INV-2026-001.pdf",
  "size_bytes": 68420
}
```

Features:
- Supports INR, USD, EUR, GBP
- Auto-calculates IGST per line item when `gst_rate` is set
- HSN/SAC code column appears automatically when any item has it
- Company header with from/to details in a 2-column table
- Professional footer with invoice number and page numbers

### generate_report

Multi-section report with optional TOC, tables, and callout boxes.

```json
{
  "title": "Haryana Real Estate Q1 2026",
  "subtitle": "Residential & Commercial Analysis",
  "author": "Antigravity Research",
  "include_toc": true,
  "sections": [
    {
      "heading": "Executive Summary",
      "body": "Strong growth across all micro-markets.\n\nGurugram led with 18% YoY volume growth.",
      "table": {
        "headers": ["Market", "Avg Rs./sqft", "YoY"],
        "rows": [
          ["New Gurugram", "9,800", "+15.6%"],
          ["Sohna Road", "8,400", "+12.1%"]
        ]
      },
      "callout": {
        "style": "warning",
        "text": "Repo rate risk: any hike above 6.75% could suppress volumes 10-15%."
      }
    }
  ]
}
```

### list_element_types

No input. Returns a markdown reference of all 22 element types (paragraph, heading, table, list, image, svg, code, blockquote, callout, toc, form-field, comment, hr, spacer, page-break, rich-paragraph, qr-code, barcode, chart, footnote-def, float-group, and toc-entry) with key properties and examples.

### generate_from_markdown

Convert a Markdown string to a PDF without writing any JSON. Supports headings, bold/italic, strikethrough, inline code, links, ordered/unordered lists (up to 3 levels), GFM tables (with column alignment), GFM task lists (☑/☐), blockquotes, fenced code blocks, and horizontal rules. Note: code blocks render as plain indented text — not styled monospace. For styled code blocks or richer layouts, use `generate_pdf`.

```json
{
  "markdown": "# Hello\n\nThis is a **bold** paragraph.\n\n- Item 1\n- Item 2",
  "filename": "hello",
  "page_size": "A4",
  "font_size": 12
}
```

Returns:

```json
{
  "success": true,
  "base64": "<base64-encoded PDF bytes>",
  "filename": "hello.pdf",
  "size_bytes": 18432
}
```

**Limits:** `markdown` max 100,000 characters. `font_size` must be 6–144. `page_size` one of: `A4`, `Letter`, `Legal`. Default filename: `document`.

### validate_document

Validate a pretext-pdf document schema without rendering it. Use this as a cheap preflight check before calling `generate_pdf` — catches typos, missing required fields, and unknown props in strict mode.

```json
{
  "document": {
    "pageSize": "A4",
    "content": [{ "type": "heading", "level": 1, "text": "Test" }]
  },
  "strict": true
}
```

Valid response:

```json
{ "valid": true, "error_count": 0, "warning_count": 0, "errors": [], "warnings": [] }
```

Invalid response:

```json
{
  "valid": false,
  "error_count": 2,
  "warning_count": 0,
  "errors": [
    {
      "path": "doc.content[0].colour",
      "message": "unknown property. did you mean \"color\"",
      "code": "UNKNOWN_PROPERTY",
      "severity": "error",
      "unknownProp": "colour",
      "suggestion": "color"
    },
    {
      "path": "doc.pageSize",
      "message": "unknown property. did you mean \"pageSize\"",
      "code": "UNKNOWN_PROPERTY",
      "severity": "error",
      "unknownProp": "pageSise",
      "suggestion": "pageSize"
    }
  ],
  "warnings": []
}
```

**Tip:** Pass `strict: true` to catch misspelled props with Levenshtein-nearest suggestions. Default is `strict: false` — only checks required fields and types.

## Decoding the base64 PDF

In Node.js:
```javascript
const bytes = Buffer.from(result.base64, 'base64')
fs.writeFileSync('output.pdf', bytes)
```

In TypeScript (browser):
```typescript
const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0))
const blob = new Blob([bytes], { type: 'application/pdf' })
```

In Python:
```python
import base64
pdf_bytes = base64.b64decode(result['base64'])
with open('output.pdf', 'wb') as f:
    f.write(pdf_bytes)
```

## License

MIT — Himanshu Jain
