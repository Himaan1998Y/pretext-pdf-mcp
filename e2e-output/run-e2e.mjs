#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Import tool handlers from dist
const tools = {}
try {
  const mod = await import('../dist/tools/generate-pdf.js')
  tools.generatePdf = mod.generatePdfTool.handler
} catch (err) {
  console.error('Failed to load generate-pdf:', err.message)
  process.exit(1)
}

try {
  const mod = await import('../dist/tools/generate-invoice.js')
  tools.generateInvoice = mod.generateInvoiceTool.handler
} catch (err) {
  console.error('Failed to load generate-invoice:', err.message)
  process.exit(1)
}

try {
  const mod = await import('../dist/tools/generate-report.js')
  tools.generateReport = mod.generateReportTool.handler
} catch (err) {
  console.error('Failed to load generate-report:', err.message)
  process.exit(1)
}

try {
  const mod = await import('../dist/tools/generate-from-markdown.js')
  tools.generateMarkdown = mod.generateFromMarkdownTool.handler
} catch (err) {
  console.error('Failed to load generate-from-markdown:', err.message)
  process.exit(1)
}

try {
  const mod = await import('../dist/tools/validate-document.js')
  tools.validateDocument = mod.validateDocumentTool.handler
} catch (err) {
  console.error('Failed to load validate-document:', err.message)
  process.exit(1)
}

try {
  const mod = await import('../dist/tools/list-elements.js')
  tools.listElements = mod.listElementsTool.handler
} catch (err) {
  console.error('Failed to load list-elements:', err.message)
  process.exit(1)
}

// Ensure output dir exists
mkdirSync(__dirname, { recursive: true })

const results = []

// Helper to run a test
async function test(batch, name, toolFn, args, validate) {
  const id = `${batch}-${name}`
  try {
    const response = await toolFn(args)

    // Extract JSON from MCP response
    let output = {}
    if (response.content && response.content[0]) {
      const text = response.content[0].text
      output = typeof text === 'string' ? JSON.parse(text) : text
    }

    // Validate the output
    const validationErrors = validate(output, response)
    const pass = validationErrors.length === 0

    // Save PDF if present
    if (output.base64) {
      const bytes = Buffer.from(output.base64, 'base64')
      const filename = `${__dirname}/${id}.pdf`
      writeFileSync(filename, bytes)
    }

    results.push({
      id,
      batch,
      name,
      pass,
      size: output.size_bytes || 0,
      success: output.success,
      errors: validationErrors,
      message: output.message || ''
    })
  } catch (err) {
    results.push({
      id,
      batch,
      name,
      pass: false,
      size: 0,
      errors: [err.message],
      message: err.stack
    })
  }
}

// ============================================================================
// BATCH 1: generate_pdf (8 scenarios)
// ============================================================================

await test('1-minimal', 'minimal-paragraph', tools.generatePdf,
  {
    document: {
      pageSize: 'A4',
      content: [{ type: 'paragraph', text: 'Hello world.' }]
    },
    filename: 'minimal'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    if (out.size_bytes < 5000) errors.push(`size too small: ${out.size_bytes}`)
    if (!out.base64) errors.push('base64 missing')
    return errors
  }
)

await test('1-full', 'full-document', tools.generatePdf,
  {
    document: {
      pageSize: 'A4',
      content: [
        { type: 'heading', level: 1, text: 'Document Title' },
        { type: 'paragraph', text: 'Introduction paragraph.' },
        { type: 'hr' },
        { type: 'spacer', height: 12 },
        { type: 'blockquote', text: 'A famous quote.' },
        { type: 'list', style: 'unordered', items: [
          { text: 'Item 1' },
          { text: 'Item 2', children: [{ text: 'Nested' }] }
        ]},
        { type: 'code', text: 'console.log("hello")', fontFamily: 'Inter', language: 'javascript' },
        { type: 'paragraph', text: 'Conclusion.' }
      ]
    },
    filename: 'full-doc'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    if (out.size_bytes < 10000) errors.push(`size too small: ${out.size_bytes}`)
    return errors
  }
)

await test('1-multipage', 'multi-page-with-break', tools.generatePdf,
  {
    document: {
      pageSize: 'A4',
      content: [
        { type: 'paragraph', text: 'Page 1 content. '.repeat(200) },
        { type: 'page-break' },
        { type: 'paragraph', text: 'Page 2 content. '.repeat(200) }
      ]
    },
    filename: 'multipage'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    if (out.size_bytes < 15000) errors.push(`size too small for multipage: ${out.size_bytes}`)
    return errors
  }
)

await test('1-table', 'table-simple', tools.generatePdf,
  {
    document: {
      pageSize: 'A4',
      content: [{
        type: 'table',
        columns: [{ width: '*' }, { width: '*' }, { width: '*' }],
        headers: ['Column 1', 'Column 2', 'Column 3'],
        rows: [
          ['A1', 'A2', 'A3'],
          ['B1', 'B2', 'B3'],
          ['C1', 'C2', 'C3']
        ]
      }]
    },
    filename: 'table-simple'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    if (out.size_bytes < 8000) errors.push(`size too small: ${out.size_bytes}`)
    return errors
  }
)

await test('1-custom-size', 'custom-page-size', tools.generatePdf,
  {
    document: {
      pageSize: [595, 841],
      content: [{ type: 'paragraph', text: 'Custom page size test.' }]
    },
    filename: 'custom-size'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('1-metadata', 'metadata-fields', tools.generatePdf,
  {
    document: {
      pageSize: 'A4',
      metadata: {
        title: 'Test Document',
        author: 'Test Author',
        subject: 'Testing',
        keywords: ['test', 'pdf', 'generation']
      },
      content: [{ type: 'paragraph', text: 'Document with metadata.' }]
    },
    filename: 'metadata'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('1-header-footer', 'header-footer-pagination', tools.generatePdf,
  {
    document: {
      pageSize: 'A4',
      header: { text: 'Header', fontSize: 10 },
      footer: { text: 'Page {{pageNumber}} of {{totalPages}}', fontSize: 10 },
      content: [
        { type: 'paragraph', text: 'Page 1. '.repeat(50) },
        { type: 'page-break' },
        { type: 'paragraph', text: 'Page 2. '.repeat(50) }
      ]
    },
    filename: 'header-footer'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('1-validation', 'invalid-unknown-prop-renders', tools.generatePdf,
  {
    document: {
      pageSize: 'A4',
      unknownProp: 'value',
      content: [{ type: 'paragraph', text: 'Unknown props are ignored by generator.' }]
    },
    filename: 'unknown-prop'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

// ============================================================================
// BATCH 2: generate_invoice (8 scenarios)
// ============================================================================

await test('2-minimal', 'minimal-inr-no-gst', tools.generateInvoice,
  {
    from: { company: 'Seller Inc.', address: 'Mumbai' },
    to: { company: 'Buyer Ltd.', address: 'Delhi' },
    invoice_number: 'INV-001',
    date: '2026-05-02',
    currency: 'INR',
    items: [{ description: 'Service', quantity: 1, rate: 10000 }]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    if (out.size_bytes < 20000) errors.push(`size too small: ${out.size_bytes}`)
    return errors
  }
)

await test('2-gst', 'inr-with-gst-18pct', tools.generateInvoice,
  {
    from: { company: 'Seller Inc.', gstin: '27AABCA1234Z1ZK' },
    to: { company: 'Buyer Ltd.', gstin: '06AAECT1234Z1ZW' },
    invoice_number: 'INV-002',
    date: '2026-05-02',
    currency: 'INR',
    items: [
      { description: 'Item 1', quantity: 1, rate: 100000, gst_rate: 18 },
      { description: 'Item 2', quantity: 2, rate: 50000, gst_rate: 18 }
    ]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('2-mixed-gst', 'mixed-gst-rates', tools.generateInvoice,
  {
    from: { company: 'Seller' },
    to: { company: 'Buyer' },
    invoice_number: 'INV-003',
    currency: 'INR',
    items: [
      { description: 'Item 5%', quantity: 1, rate: 100000, gst_rate: 5 },
      { description: 'Item 12%', quantity: 1, rate: 100000, gst_rate: 12 },
      { description: 'Item 18%', quantity: 1, rate: 100000, gst_rate: 18 }
    ]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('2-usd', 'usd-currency', tools.generateInvoice,
  {
    from: { company: 'US Seller' },
    to: { company: 'US Buyer' },
    invoice_number: 'INV-USD-001',
    currency: 'USD',
    items: [{ description: 'Service', quantity: 1, rate: 5000 }]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('2-eur', 'eur-currency', tools.generateInvoice,
  {
    from: { company: 'EU Seller' },
    to: { company: 'EU Buyer' },
    invoice_number: 'INV-EUR-001',
    currency: 'EUR',
    items: [{ description: 'Product', quantity: 1, rate: 4500 }]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('2-gbp', 'gbp-currency', tools.generateInvoice,
  {
    from: { company: 'UK Seller' },
    to: { company: 'UK Buyer' },
    invoice_number: 'INV-GBP-001',
    currency: 'GBP',
    items: [{ description: 'Work', quantity: 1, rate: 4000 }]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('2-long', 'long-invoice-10-items', tools.generateInvoice,
  {
    from: { company: 'Big Seller' },
    to: { company: 'Big Buyer' },
    invoice_number: 'INV-LONG-001',
    currency: 'INR',
    items: Array.from({ length: 10 }, (_, i) => ({
      description: `Item ${i + 1} - ${Math.random().toString(36).substring(7)}`,
      quantity: Math.floor(Math.random() * 5) + 1,
      rate: Math.floor(Math.random() * 50000) + 10000,
      gst_rate: [5, 12, 18][Math.floor(Math.random() * 3)]
    })),
    notes: 'Payment due within 30 days. Please remit via bank transfer.'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    if (out.size_bytes < 25000) errors.push(`expected multi-page, size too small: ${out.size_bytes}`)
    return errors
  }
)

await test('2-hsn', 'hsn-codes-visible', tools.generateInvoice,
  {
    from: { company: 'Seller' },
    to: { company: 'Buyer' },
    invoice_number: 'INV-HSN-001',
    currency: 'INR',
    items: [
      { description: 'Service A', hsn_code: '998314', quantity: 1, rate: 50000 },
      { description: 'Service B', hsn_code: '998399', quantity: 2, rate: 30000 }
    ]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

// ============================================================================
// BATCH 3: generate_report (7 scenarios)
// ============================================================================

await test('3-minimal', 'minimal-single-section', tools.generateReport,
  {
    title: 'Test Report',
    sections: [{ heading: 'Section 1', body: 'Content here.' }]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('3-toc', 'toc-enabled-5-sections', tools.generateReport,
  {
    title: 'Report with TOC',
    include_toc: true,
    sections: [
      { heading: 'Section A', body: 'Content A. '.repeat(50) },
      { heading: 'Section B', body: 'Content B. '.repeat(50) },
      { heading: 'Section C', body: 'Content C. '.repeat(50) },
      { heading: 'Section D', body: 'Content D. '.repeat(50) },
      { heading: 'Section E', body: 'Content E. '.repeat(50) }
    ]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    if (out.size_bytes < 25000) errors.push(`expected multipage, size too small: ${out.size_bytes}`)
    return errors
  }
)

await test('3-table', 'section-with-table', tools.generateReport,
  {
    title: 'Report with Table',
    sections: [{
      heading: 'Data',
      body: 'Here is the data:',
      table: {
        headers: ['Column 1', 'Column 2', 'Column 3'],
        rows: [
          ['A1', 'B1', 'C1'],
          ['A2', 'B2', 'C2'],
          ['A3', 'B3', 'C3'],
          ['A4', 'B4', 'C4'],
          ['A5', 'B5', 'C5']
        ]
      }
    }]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('3-callout-info', 'callout-info-style', tools.generateReport,
  {
    title: 'Info Callout Report',
    sections: [{
      heading: 'Important Info',
      body: 'Here is some information.',
      callout: { style: 'info', text: 'This is an informational callout.' }
    }]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('3-callout-warning', 'callout-warning-style', tools.generateReport,
  {
    title: 'Warning Report',
    sections: [{
      heading: 'Caution',
      body: 'Pay attention.',
      callout: { style: 'warning', text: 'This is a warning callout.' }
    }]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('3-callout-tip', 'callout-tip-style', tools.generateReport,
  {
    title: 'Tips Report',
    sections: [{
      heading: 'Pro Tips',
      body: 'Learn some tips.',
      callout: { style: 'tip', text: 'This is a helpful tip.' }
    }]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('3-callout-note', 'callout-note-style', tools.generateReport,
  {
    title: 'Notes Report',
    sections: [{
      heading: 'Key Notes',
      body: 'Note this.',
      callout: { style: 'note', text: 'This is a note callout.' }
    }]
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

// ============================================================================
// BATCH 4: generate_from_markdown (7 scenarios)
// ============================================================================

await test('4-minimal', 'minimal-markdown', tools.generateMarkdown,
  {
    markdown: '# Heading 1\n\nA simple paragraph.'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('4-rich', 'rich-markdown-all-features', tools.generateMarkdown,
  {
    markdown: `# Main Title
## Subtitle

This is a **bold** word. Here is a [link](https://example.com).

### Lists

Unordered:
- Item 1
- Item 2
  - Nested 2.1
  - Nested 2.2

Ordered:
1. First
2. Second

> A blockquote here.

---

End of document.`
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('4-nested-list', 'nested-list-2-levels', tools.generateMarkdown,
  {
    markdown: `# Lists

- Level 1 Item 1
  - Level 2 Item 1.1
  - Level 2 Item 1.2
- Level 1 Item 2
  - Level 2 Item 2.1`
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('4-letter', 'page-size-letter', tools.generateMarkdown,
  {
    markdown: 'Letter page size test.',
    page_size: 'Letter'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('4-legal', 'page-size-legal', tools.generateMarkdown,
  {
    markdown: 'Legal page size test.',
    page_size: 'Legal'
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('4-small-font', 'font-size-9', tools.generateMarkdown,
  {
    markdown: 'Small font size test.',
    font_size: 9
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

await test('4-large-font', 'font-size-18', tools.generateMarkdown,
  {
    markdown: 'Large font size test.',
    font_size: 18
  },
  (out) => {
    const errors = []
    if (!out.success) errors.push('success !== true')
    return errors
  }
)

// ============================================================================
// BATCH 5: validate_document (5 scenarios)
// ============================================================================

await test('5-valid', 'valid-document-strict', tools.validateDocument,
  {
    document: {
      pageSize: 'A4',
      content: [{ type: 'paragraph', text: 'Valid document.' }]
    },
    strict: true
  },
  (out) => {
    const errors = []
    if (!out.valid) errors.push('valid !== true')
    if (out.error_count !== 0) errors.push(`error_count should be 0, got ${out.error_count}`)
    return errors
  }
)

await test('5-typo-pagesize', 'unknown-pagesise-detected', tools.validateDocument,
  {
    document: {
      pageSise: 'A4',
      content: [{ type: 'paragraph', text: 'Typo in pageSize.' }]
    },
    strict: true
  },
  (out, resp) => {
    const errors = []
    if (out.valid) errors.push('should have failed')
    if (!resp.isError) errors.push('should have isError: true')
    return errors
  }
)

await test('5-typo-colour', 'unknown-colour-detected', tools.validateDocument,
  {
    document: {
      pageSize: 'A4',
      content: [{ type: 'paragraph', text: 'Red text.', colour: '#ff0000' }]
    },
    strict: true
  },
  (out, resp) => {
    const errors = []
    if (out.valid) errors.push('should have failed')
    if (!resp.isError) errors.push('should have isError: true')
    return errors
  }
)

await test('5-unknown-prop', 'unknown-prop-no-suggestion', tools.validateDocument,
  {
    document: {
      pageSize: 'A4',
      randomjunk: 'xyz',
      content: [{ type: 'paragraph', text: 'Unknown prop.' }]
    },
    strict: true
  },
  (out, resp) => {
    const errors = []
    if (out.valid) errors.push('should have failed')
    if (!resp.isError) errors.push('should have isError: true')
    return errors
  }
)

await test('5-strict-false', 'strict-false-unknown-ignored', tools.validateDocument,
  {
    document: {
      pageSize: 'A4',
      unknownprop: 'value',
      content: [{ type: 'paragraph', text: 'Strict off.' }]
    },
    strict: false
  },
  (out) => {
    const errors = []
    if (!out.valid) errors.push(`should have passed with strict:false, got: ${out.message}`)
    return errors
  }
)

// ============================================================================
// BATCH 6: list_element_types (1 scenario)
// ============================================================================

// Special test for list_element_types which returns raw markdown
await (async () => {
  const id = '6-list-element-types-reference'
  try {
    const response = await tools.listElements({})
    const markdown = response.content[0].text
    const expectedTypes = ['paragraph', 'heading', 'table', 'image', 'qr-code', 'barcode', 'chart']
    const errors = []
    for (const type of expectedTypes) {
      if (!markdown.includes(type)) {
        errors.push(`missing element type: ${type}`)
      }
    }
    results.push({
      id,
      batch: '6-list',
      name: 'element-types-reference',
      pass: errors.length === 0,
      size: 0,
      success: true,
      errors,
      message: ''
    })
  } catch (err) {
    results.push({
      id,
      batch: '6-list',
      name: 'element-types-reference',
      pass: false,
      size: 0,
      errors: [err.message],
      message: err.stack
    })
  }
})()

// ============================================================================
// REPORT GENERATION
// ============================================================================

// Generate markdown report
let reportMd = `# E2E Test Report

**Generated:** ${new Date().toISOString()}

**Summary:**
- Total tests: ${results.length}
- Passed: ${results.filter(r => r.pass).length}
- Failed: ${results.filter(r => !r.pass).length}

## Results by Batch

`

const batches = {}
for (const r of results) {
  if (!batches[r.batch]) batches[r.batch] = []
  batches[r.batch].push(r)
}

for (const [batch, tests] of Object.entries(batches).sort()) {
  const batchName = {
    '1': 'generate_pdf',
    '2': 'generate_invoice',
    '3': 'generate_report',
    '4': 'generate_from_markdown',
    '5': 'validate_document',
    '6': 'list_element_types'
  }[batch]

  reportMd += `### Batch ${batch} — ${batchName}\n\n`

  for (const t of tests) {
    const status = t.pass ? '✅ PASS' : '❌ FAIL'
    reportMd += `**${status}** — ${t.name}`
    if (t.size > 0) reportMd += ` (${(t.size / 1024).toFixed(1)} KB)`
    reportMd += `\n`

    if (t.errors.length > 0) {
      reportMd += `- Errors: ${t.errors.join('; ')}\n`
    }
    if (t.message && t.message.length > 100) {
      reportMd += `- Message: ${t.message.substring(0, 200)}...\n`
    } else if (t.message) {
      reportMd += `- Message: ${t.message}\n`
    }
    reportMd += '\n'
  }
}

reportMd += '\n## Summary Statistics\n\n'
reportMd += `| Metric | Value |\n`
reportMd += `|--------|-------|\n`
reportMd += `| Total Tests | ${results.length} |\n`
reportMd += `| Passed | ${results.filter(r => r.pass).length} |\n`
reportMd += `| Failed | ${results.filter(r => !r.pass).length} |\n`
reportMd += `| Success Rate | ${((results.filter(r => r.pass).length / results.length) * 100).toFixed(1)}% |\n`

const totalSize = results.reduce((sum, r) => sum + r.size, 0)
reportMd += `| Total PDF Size | ${(totalSize / 1024 / 1024).toFixed(2)} MB |\n`

// Write report
writeFileSync(`${__dirname}/REPORT.md`, reportMd)

// Write JSON results for programmatic analysis
writeFileSync(`${__dirname}/results.json`, JSON.stringify(results, null, 2))

console.log('\n✅ E2E Tests Complete')
console.log(`📊 Report written to: ${__dirname}/REPORT.md`)
console.log(`📈 Results JSON: ${__dirname}/results.json`)
console.log(`\nSummary: ${results.filter(r => r.pass).length}/${results.length} tests passed`)

process.exit(results.some(r => !r.pass) ? 1 : 0)
