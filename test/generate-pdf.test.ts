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

  // Phase C: Structural prototype-pollution tests
  describe('Security: prototype-pollution hardening', () => {
    it('rejects constructor key in nested object', async () => {
      const doc: any = {
        content: [
          {
            type: 'paragraph',
            text: 'Hello',
          },
        ],
      }
      // Explicitly set the dangerous key after object construction
      Object.defineProperty(doc.content[0], 'constructor', {
        value: { prototype: { polluted: true } },
        enumerable: true,
      })

      const result = await generatePdfTool.handler({ document: doc })
      assert.equal(result.isError, true)
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.success, false)
      assert.match(parsed.message, /unsafe keys|constructor/)
    })

    it('rejects prototype key in deeply nested object', async () => {
      const doc: any = {
        content: [
          {
            type: 'table',
            columns: [{ width: 100 }],
            rows: [
              {
                cells: [
                  {
                    text: 'Safe text',
                  },
                ],
              },
            ],
          },
        ],
      }
      // Set prototype key at depth 4
      Object.defineProperty(doc.content[0].rows[0].cells[0], 'prototype', {
        value: { polluted: true },
        enumerable: true,
      })

      const result = await generatePdfTool.handler({ document: doc })
      assert.equal(result.isError, true)
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.success, false)
      assert.match(parsed.message, /unsafe keys|prototype/)
    })

    it('rejects __proto__ via Object.assign attack', async () => {
      const payload = {
        content: [{ type: 'paragraph', text: 'Hello' }],
      }
      // Simulate JSON.parse attack: __proto__ from malicious JSON
      const malicious = JSON.parse('{"content":[{"type":"paragraph","text":"Hello"}],"__proto__":{"polluted":true}}')

      const result = await generatePdfTool.handler({ document: malicious })
      assert.equal(result.isError, true)
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.success, false)
      assert.match(parsed.message, /unsafe keys|__proto__/)
    })

    it('accepts paragraph with "__proto__" as literal text (no false positive)', async () => {
      // The string "__proto__" appearing as paragraph text should not trigger the check
      // because the check looks at object keys, not text values.
      const result = await generatePdfTool.handler({
        document: {
          content: [{ type: 'paragraph', text: 'This mentions "__proto__" in the actual text.' }],
        },
      })
      assert.equal(result.isError, undefined, 'should succeed because text is not a key')
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.success, true)
    })

    it('accepts object with "prototype" in a string value (not a key)', async () => {
      const result = await generatePdfTool.handler({
        document: {
          content: [
            {
              type: 'paragraph',
              text: 'JavaScript prototype property is important.',
            },
          ],
        },
      })
      assert.equal(result.isError, undefined)
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.success, true)
    })

    it('rejects constructor in content array element', async () => {
      const doc: any = {
        content: [
          {
            type: 'heading',
            level: 1,
            text: 'Title',
          },
        ],
      }
      Object.defineProperty(doc.content[0], 'constructor', {
        value: { prototype: { polluted: true } },
        enumerable: true,
      })

      const result = await generatePdfTool.handler({ document: doc })
      assert.equal(result.isError, true)
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.success, false)
    })

    it('rejects multiple unsafe keys in single document', async () => {
      const doc: any = {
        content: [{ type: 'paragraph', text: 'Hello' }],
      }
      Object.defineProperty(doc, 'constructor', {
        value: { prototype: { polluted: true } },
        enumerable: true,
      })
      Object.defineProperty(doc, '__proto__', {
        value: { alsoPolluted: true },
        enumerable: true,
      })

      const result = await generatePdfTool.handler({ document: doc })
      assert.equal(result.isError, true)
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.success, false)
    })
  })
})
