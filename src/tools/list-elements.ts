const ELEMENTS_REFERENCE = `# pretext-pdf Element Types Reference

## paragraph
Renders a text block. Key props: \`text\` (required), \`fontSize\`, \`fontWeight\` (400|700), \`color\` (#hex), \`align\` (left|center|right|justify), \`spaceAfter\`, \`spaceBefore\`, \`bgColor\`, \`underline\`, \`strikethrough\`, \`url\`, \`letterSpacing\`, \`smallCaps\`.
Example: \`{ type: "paragraph", text: "Hello world", fontSize: 12, color: "#333333" }\`

## heading
Section heading with automatic bookmarks. Key props: \`level\` (1–4, required), \`text\` (required), \`fontSize\` (defaults: h1=28, h2=22, h3=18, h4=15), \`color\`, \`align\`, \`anchor\` (for internal links), \`bookmark\` (set false to exclude from PDF outline), \`spaceAfter\`.
Example: \`{ type: "heading", level: 1, text: "Introduction", color: "#1a1a2e" }\`

## rich-paragraph
Paragraph with per-span formatting. Key props: \`lines\` (array of RichLine, each with \`spans\` array). Each span: \`text\`, \`fontWeight\`, \`color\`, \`fontSize\`, \`italic\`, \`underline\`, \`strikethrough\`, \`url\`, \`href\` (internal anchor link).
Example: \`{ type: "rich-paragraph", lines: [{ spans: [{ text: "Bold", fontWeight: 700 }, { text: " normal" }] }] }\`

## table
Data table with optional header rows, borders, and column alignment. Key props: \`columns\` (array of \`{width, align}\`; width can be pt number, \`"2*"\` fraction, or \`"auto"\`), \`rows\` (array of \`{cells, isHeader, bgColor}\`), \`headerBgColor\`, \`borderColor\`, \`borderWidth\`, \`cellPaddingH\`, \`cellPaddingV\`, \`spaceAfter\`.
Cell props: \`text\`, \`fontWeight\`, \`color\`, \`bgColor\`, \`align\`, \`colSpan\`.
Example: \`{ type: "table", columns: [{ width: "2*" }, { width: 100, align: "right" }], rows: [{ isHeader: true, cells: [{ text: "Name", fontWeight: 700 }, { text: "Amount", fontWeight: 700 }] }] }\`

## list
Bulleted or numbered list. Key props: \`style\` (unordered|ordered, required), \`items\` (array of \`{text, children}\`), \`fontSize\`, \`color\`, \`spaceAfter\`, \`indent\` (pt for nested lists).
Example: \`{ type: "list", style: "unordered", items: [{ text: "Item one" }, { text: "Item two", children: [{ text: "Sub-item" }] }] }\`

## image
Embed PNG/JPG image. Key props: \`src\` (absolute file path or Uint8Array, required), \`width\` (pt, defaults to content width), \`height\` (optional, auto-scales), \`align\` (left|center|right), \`caption\`, \`spaceAfter\`.
Example: \`{ type: "image", src: "/abs/path/to/logo.png", width: 120, align: "center" }\`

## svg
Inline SVG vector graphic. Key props: \`content\` (SVG markup string, required), \`width\` (pt), \`height\` (pt), \`align\`, \`spaceAfter\`.
Example: \`{ type: "svg", content: "<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='40'/></svg>", width: 100, height: 100 }\`

## code
Monospace code block with optional syntax label. Key props: \`code\` (required), \`language\` (label only, no syntax highlighting), \`fontSize\`, \`bgColor\`, \`color\`, \`spaceAfter\`.
Example: \`{ type: "code", language: "typescript", code: "const x = 42;", bgColor: "#f4f4f4" }\`

## blockquote
Indented quote with a left border. Key props: \`text\` (required), \`borderColor\` (#hex), \`color\`, \`fontSize\`, \`spaceAfter\`.
Example: \`{ type: "blockquote", text: "The best code is no code at all.", borderColor: "#6366f1" }\`

## callout
Alert/info box with preset color schemes and optional title. Key props: \`content\` (body text, required), \`style\` (info|warning|tip|note — sets default colors), \`title\` (bold heading above body), \`borderColor\`, \`backgroundColor\`, \`color\`, \`fontSize\`, \`padding\`, \`spaceAfter\`.
Example: \`{ type: "callout", style: "warning", content: "This action cannot be undone." }\`

## toc
Auto-generated Table of Contents. Place after cover, before content. Key props: \`title\` (heading text), \`showTitle\` (boolean), \`leader\` (dot fill char, e.g. "."), \`minLevel\` (1–4), \`maxLevel\` (1–4), \`fontSize\`, \`spaceAfter\`.
Example: \`{ type: "toc", title: "Contents", showTitle: true, leader: ".", minLevel: 1, maxLevel: 2 }\`

## form-field
Interactive AcroForm field (text, checkbox, radio, dropdown, button). Key props: \`fieldType\` (required), \`name\` (unique, required), \`label\`, \`placeholder\`, \`defaultValue\`, \`multiline\`, \`options\` (for radio/dropdown), \`width\`, \`height\`, \`borderColor\`, \`spaceAfter\`.
Example: \`{ type: "form-field", fieldType: "text", name: "full_name", label: "Full Name", placeholder: "Enter your name" }\`

## comment
Invisible sticky-note annotation (shows as icon in PDF viewer). Key props: \`contents\` (popup text, required), \`author\`, \`color\` (#hex), \`open\` (show popup by default).
Example: \`{ type: "comment", contents: "Review this section.", author: "Jane" }\`

## hr
Horizontal rule / divider line. Key props: \`color\` (#hex), \`thickness\` (pt), \`spaceBelow\`.
Example: \`{ type: "hr", color: "#cccccc", thickness: 1, spaceBelow: 8 }\`

## spacer
Vertical whitespace. Key props: \`height\` (pt, required).
Example: \`{ type: "spacer", height: 24 }\`

## page-break
Force start of a new page. No additional props.
Example: \`{ type: "page-break" }\`

---

## Document-level options (PdfDocument)
- \`pageSize\`: 'A4'|'Letter'|'Legal'|'A3'|'A5' or \`[width, height]\` in pt. Default: 'A4'
- \`margins\`: \`{ top, bottom, left, right }\` in pt. Default: all 72pt
- \`defaultFont\`: font family name. Default: 'Inter'
- \`defaultFontSize\`: pt. Default: 12
- \`header\`: \`{ text, fontSize, align, color, fontFamily }\`. Supports \`{{pageNumber}}\` and \`{{totalPages}}\`
- \`footer\`: same as header
- \`watermark\`: \`{ text, opacity, rotation, fontSize, color }\`
- \`encryption\`: \`{ userPassword, ownerPassword, permissions }\`
- \`bookmarks\`: \`{ minLevel, maxLevel }\` or \`false\`
- \`metadata\`: \`{ title, author, subject, keywords, language }\`
- \`hyphenation\`: \`{ language: 'en-us' }\`
`

export const listElementsTool = {
  schema: {
    name: 'list_element_types',
    description:
      'Returns a markdown reference of all pretext-pdf element types and their key properties. Use this before calling generate_pdf to understand what elements and options are available.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  handler: async (_args: Record<string, unknown>) => {
    return {
      content: [{ type: 'text', text: ELEMENTS_REFERENCE }],
    }
  },
}
