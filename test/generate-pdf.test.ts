import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generatePdfTool } from '../src/tools/generate-pdf.js'

describe('generate_pdf tool', () => {
  it('generates a PDF from a minimal document (just a paragraph)', async () => {
    const result = await generatePdfTool.handler({
      document: {
        content: [{ type: 'paragraph', text: 'Hello world' }],
      },
      filename: 'minimal',
    })
    assert.equal(result.isError, undefined, 'should not be an error')
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(typeof parsed.base64 === 'string' && parsed.base64.length > 0, 'base64 should be non-empty')
    assert.ok(parsed.size_bytes > 1000, `size_bytes should be > 1000, got ${parsed.size_bytes}`)
    assert.equal(parsed.filename, 'minimal.pdf')
  })

  it('generates a PDF from a full document with heading + table + list', async () => {
    const result = await generatePdfTool.handler({
      document: {
        pageSize: 'A4',
        footer: { text: 'Page {{pageNumber}} of {{totalPages}}', fontSize: 9 },
        content: [
          { type: 'heading', level: 1, text: 'Annual Report 2026' },
          { type: 'paragraph', text: 'This is the introduction paragraph.' },
          {
            type: 'table',
            columns: [{ width: '2*' }, { width: 100, align: 'right' }],
            rows: [
              { isHeader: true, cells: [{ text: 'Item', fontWeight: 700 }, { text: 'Value', fontWeight: 700 }] },
              { cells: [{ text: 'Revenue' }, { text: '₹12,00,000' }] },
              { cells: [{ text: 'Expenses' }, { text: '₹8,00,000' }] },
            ],
            headerBgColor: '#1a1a2e',
          },
          {
            type: 'list',
            style: 'ordered',
            items: [{ text: 'First item' }, { text: 'Second item' }, { text: 'Third item' }],
          },
        ],
      },
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(parsed.size_bytes > 1000)
  })

  it('returns isError true for null/missing document', async () => {
    const result = await generatePdfTool.handler({ document: null as any })
    assert.equal(result.isError, true)
  })

  it('generates a PDF with encryption', async () => {
    const result = await generatePdfTool.handler({
      document: {
        content: [{ type: 'heading', level: 2, text: 'Confidential' }, { type: 'paragraph', text: 'Top secret content.' }],
        encryption: {
          userPassword: 'open123',
          ownerPassword: 'owner456',
          permissions: { printing: true, copying: false, modifying: false },
        },
      },
      filename: 'encrypted',
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(parsed.size_bytes > 1000)
    assert.equal(parsed.filename, 'encrypted.pdf')
  })

  it('returns isError true for document with invalid element type', async () => {
    const result = await generatePdfTool.handler({
      document: {
        content: [{ type: 'not-a-real-element', text: 'bad' }],
      },
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, false)
    assert.ok(parsed.error, 'error code should be present')
  })
})
