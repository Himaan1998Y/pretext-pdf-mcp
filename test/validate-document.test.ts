import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateDocumentTool } from '../src/tools/validate-document.js'

describe('validate_document tool', () => {
  it('returns valid:true for a minimal well-formed document', async () => {
    const result = await validateDocumentTool.handler({
      document: { content: [{ type: 'paragraph', text: 'Hello' }] },
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.valid, true)
    assert.equal(parsed.error_count, 0)
  })

  it('returns valid:false with errors for a document with invalid element type', async () => {
    const result = await validateDocumentTool.handler({
      document: { content: [{ type: 'not-a-real-type', text: 'x' }] },
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.valid, false)
    assert.ok(parsed.error_count > 0, 'expected at least one error')
    assert.ok(Array.isArray(parsed.errors) && parsed.errors.length > 0, 'expected errors array')
    assert.ok(typeof parsed.errors[0].message === 'string' && parsed.errors[0].message.length > 0, 'expected error message')
  })

  it('returns valid:false when document has no content array', async () => {
    const result = await validateDocumentTool.handler({
      document: { content: [] },
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.valid, false)
    assert.ok(Array.isArray(parsed.errors) && parsed.errors.length > 0, 'expected errors array')
  })

  it('returns valid:false for null document input', async () => {
    const result = await validateDocumentTool.handler({ document: null })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.valid, false)
  })

  it('catches unknown properties in strict mode and reports them all', async () => {
    const result = await validateDocumentTool.handler({
      document: {
        content: [{ type: 'paragraph', text: 'Hello', unknownProp: 'x' } as any],
      },
      strict: true,
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.valid, false)
    assert.ok(
      Array.isArray(parsed.errors) && parsed.errors.some((e: { message: string }) => e.message.includes('unknown')),
      'expected "unknown" in an error message'
    )
  })

  it('valid:true even when strict:false for doc with unknown properties', async () => {
    const result = await validateDocumentTool.handler({
      document: {
        content: [{ type: 'paragraph', text: 'Hello', unknownProp: 'x' } as any],
      },
      strict: false,
    })
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.valid, true)
  })
})
