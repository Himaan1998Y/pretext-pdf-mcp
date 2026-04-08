# pretext-pdf-mcp

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

## Tools

| Tool | Input | Output |
|------|-------|--------|
| `generate_pdf` | PdfDocument JSON descriptor | Base64 PDF + filename + size |
| `generate_invoice` | Invoice data (parties, items, GST, currency) | Base64 PDF |
| `generate_report` | Report sections with optional tables and callouts | Base64 PDF |
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

No input. Returns a markdown reference of all 16 element types (paragraph, heading, table, list, image, svg, code, blockquote, callout, toc, form-field, comment, hr, spacer, page-break, rich-paragraph) with key properties and examples.

## Decoding the base64 PDF

In Node.js:
```javascript
const bytes = Buffer.from(result.base64, 'base64')
fs.writeFileSync('output.pdf', bytes)
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
