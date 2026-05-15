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
    assert.equal(parsed.warning_count, 0)
    assert.ok(Array.isArray(parsed.warnings) && parsed.warnings.length === 0)
  })

  it('returns valid:false with errors for a document with invalid element type', async () => {
    const result = await validateDocumentTool.handler({
      document: { content: [{ type: 'not-a-real-type', text: 'x' }] },
    })
    assert.equal(result.isError, undefined)
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
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.valid, false)
    assert.ok(Array.isArray(parsed.errors) && parsed.errors.length > 0, 'expected errors array')
  })

  it('returns valid:false for null document input', async () => {
    const result = await validateDocumentTool.handler({ document: null })
    // Tool succeeded — null input is a valid call that returns valid:false. isError must be absent.
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.valid, false)
  })

  it('null document returns structured INVALID_INPUT error', async () => {
    const result = await validateDocumentTool.handler({ document: null })
    // Tool succeeded — returning validation errors is not a crash. isError must be absent.
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.valid, false)
    assert.equal(parsed.error_count, 1)
    assert.equal(parsed.warning_count, 0)
    assert.ok(Array.isArray(parsed.errors) && parsed.errors.length === 1)
    assert.ok(Array.isArray(parsed.warnings) && parsed.warnings.length === 0)
    assert.equal(parsed.errors[0].code, 'INVALID_INPUT')
    assert.equal(parsed.errors[0].path, 'document')
    assert.equal(parsed.errors[0].severity, 'error')
  })

  it('catches unknown properties in strict mode and reports them all', async () => {
    const result = await validateDocumentTool.handler({
      document: {
        content: [{ type: 'paragraph', text: 'Hello', colour: 'red' } as any],
      },
      strict: true,
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.valid, false)
    assert.ok(Array.isArray(parsed.errors) && parsed.errors.length > 0, 'expected errors array')
    const err = parsed.errors[0]
    assert.ok(err.path.includes('colour'), 'path should reference the unknown property')
    assert.equal(err.code, 'UNKNOWN_PROPERTY')
    assert.equal(err.severity, 'error')
    assert.equal(err.suggestion, 'color', 'should suggest "color" for "colour"')
    assert.equal(err.unknownProp, 'colour')
  })

  it('strict mode suggests correction for top-level typo pageSise', async () => {
    const result = await validateDocumentTool.handler({
      document: {
        content: [{ type: 'paragraph', text: 'hi' }],
        pageSise: 'A4',
      } as any,
      strict: true,
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.valid, false)
    const err = parsed.errors.find((e: { unknownProp?: string }) => e.unknownProp === 'pageSise')
    assert.ok(err, 'expected error for pageSise')
    assert.equal(err.suggestion, 'pageSize')
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

  describe('Security: prototype-pollution hardening', () => {
    it('rejects __proto__ key on top-level input', async () => {
      const doc: Record<string, unknown> = { content: [{ type: 'paragraph', text: 'x' }] }
      // Inject __proto__ as an own property without polluting Object.prototype
      Object.defineProperty(doc, '__proto__', { value: { polluted: true }, enumerable: true, configurable: true, writable: true })
      const result = await validateDocumentTool.handler({ document: doc })
      assert.equal(result.isError, undefined)
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.valid, false)
      assert.equal(parsed.errors[0].code, 'INVALID_INPUT')
      assert.ok(/unsafe property keys/i.test(parsed.errors[0].message), `Expected unsafe-keys message, got: ${parsed.errors[0].message}`)
    })

    it('rejects constructor key nested in content element', async () => {
      const result = await validateDocumentTool.handler({
        document: {
          content: [{ type: 'paragraph', text: 'x', constructor: { evil: true } } as any],
        },
      })
      assert.equal(result.isError, undefined)
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.valid, false)
      assert.ok(/unsafe property keys/i.test(parsed.errors[0].message))
    })

    it('rejects prototype key nested deeply', async () => {
      const result = await validateDocumentTool.handler({
        document: {
          content: [{ type: 'table', rows: [[{ prototype: { evil: true } } as any]] }],
        },
      })
      assert.equal(result.isError, undefined)
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.valid, false)
      assert.ok(/unsafe property keys/i.test(parsed.errors[0].message))
    })
  })
})
