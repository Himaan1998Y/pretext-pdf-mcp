/**
 * safety.test.ts — Unit tests for src/utils/safety.ts
 *
 * Covers hasUnsafeKeys() and runDocumentSafetyChecks() directly.
 * These functions are shared by every MCP tool that accepts user-supplied
 * object input, so correctness here protects the entire tool surface.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hasUnsafeKeys, runDocumentSafetyChecks } from '../src/utils/safety.js'

// ─── hasUnsafeKeys ─────────────────────────────────────────────────────────────

describe('hasUnsafeKeys — safe inputs return false', () => {
  it('returns false for a plain object with benign keys', () => {
    assert.equal(hasUnsafeKeys({ foo: 'bar', baz: 42 }), false)
  })

  it('returns false for null (non-object)', () => {
    assert.equal(hasUnsafeKeys(null), false)
  })

  it('returns false for a primitive string', () => {
    assert.equal(hasUnsafeKeys('hello'), false)
  })

  it('returns false for a primitive number', () => {
    assert.equal(hasUnsafeKeys(42), false)
  })

  it('returns false for undefined', () => {
    assert.equal(hasUnsafeKeys(undefined), false)
  })

  it('returns false for an empty object', () => {
    assert.equal(hasUnsafeKeys({}), false)
  })

  it('returns false for an array with no unsafe keys', () => {
    assert.equal(hasUnsafeKeys([1, 2, 3]), false)
  })

  it('returns false for a nested object with safe keys', () => {
    assert.equal(hasUnsafeKeys({ content: [{ type: 'paragraph', text: 'hello' }] }), false)
  })

  it('returns false for an object with keys named like proto but not exactly __proto__', () => {
    // These look similar but are not the forbidden keys
    assert.equal(hasUnsafeKeys({ proto: 'ok', constructorFn: 'ok', prototypical: 'ok' }), false)
  })
})

describe('hasUnsafeKeys — unsafe inputs return true', () => {
  it('returns true for an object with __proto__ as own key', () => {
    const obj: Record<string, unknown> = {}
    Object.defineProperty(obj, '__proto__', {
      value: { polluted: true },
      enumerable: true,
      configurable: true,
      writable: true,
    })
    assert.equal(hasUnsafeKeys(obj), true)
  })

  it('returns true for an object with constructor as own key', () => {
    const obj = { constructor: { evil: true } }
    assert.equal(hasUnsafeKeys(obj), true)
  })

  it('returns true for an object with prototype as own key', () => {
    const obj = { prototype: { polluted: true } }
    assert.equal(hasUnsafeKeys(obj), true)
  })

  it('returns true for __proto__ nested inside an array element', () => {
    // Must use Object.defineProperty — an object literal { __proto__: {} } sets the
    // prototype rather than creating an enumerable own property named "__proto__".
    const inner: Record<string, unknown> = { type: 'paragraph', text: 'x' }
    Object.defineProperty(inner, '__proto__', {
      value: {},
      enumerable: true,
      configurable: true,
      writable: true,
    })
    const obj: Record<string, unknown> = { content: [inner] }
    assert.equal(hasUnsafeKeys(obj), true)
  })

  it('returns true for constructor nested two levels deep', () => {
    const obj = { level1: { level2: { constructor: { evil: true } } } }
    assert.equal(hasUnsafeKeys(obj), true)
  })

  it('returns true for prototype nested inside an array', () => {
    const obj = { items: [{ prototype: { x: 1 } }] }
    assert.equal(hasUnsafeKeys(obj), true)
  })
})

describe('hasUnsafeKeys — depth limit', () => {
  it('returns true for objects nested beyond depth 64', () => {
    // Build a chain 65 levels deep — must be rejected
    let inner: Record<string, unknown> = { safe: true }
    for (let i = 0; i < 65; i++) {
      inner = { child: inner }
    }
    assert.equal(hasUnsafeKeys(inner), true)
  })

  it('returns false for objects nested at exactly depth 64', () => {
    // 63 levels of nesting — just within limit
    let inner: Record<string, unknown> = { safe: true }
    for (let i = 0; i < 63; i++) {
      inner = { child: inner }
    }
    assert.equal(hasUnsafeKeys(inner), false)
  })
})

// ─── runDocumentSafetyChecks ───────────────────────────────────────────────────

describe('runDocumentSafetyChecks — valid documents return null', () => {
  it('returns null for a minimal valid document', () => {
    const result = runDocumentSafetyChecks({ content: [{ type: 'paragraph', text: 'Hello' }] })
    assert.equal(result, null)
  })

  it('returns null for a document with multiple valid elements', () => {
    const result = runDocumentSafetyChecks({
      content: [
        { type: 'heading', level: 1, text: 'Title' },
        { type: 'paragraph', text: 'Body text.' },
        { type: 'spacer', height: 20 },
      ],
    })
    assert.equal(result, null)
  })
})

describe('runDocumentSafetyChecks — prototype pollution returns error', () => {
  it('returns SafetyErrorResponse for __proto__ key on document', () => {
    const doc: Record<string, unknown> = { content: [{ type: 'paragraph', text: 'x' }] }
    Object.defineProperty(doc, '__proto__', {
      value: {},
      enumerable: true,
      configurable: true,
      writable: true,
    })
    const result = runDocumentSafetyChecks(doc)
    assert.notEqual(result, null)
    assert.equal(result!.isError, true)
    const parsed = JSON.parse(result!.content[0].text as string)
    assert.equal(parsed.success, false)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
    assert.ok(/unsafe keys/i.test(parsed.message))
  })

  it('returns SafetyErrorResponse for constructor key nested in content', () => {
    const result = runDocumentSafetyChecks({
      content: [{ type: 'paragraph', text: 'x', constructor: { evil: true } }],
    })
    assert.notEqual(result, null)
    assert.equal(result!.isError, true)
    const parsed = JSON.parse(result!.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
  })
})

describe('runDocumentSafetyChecks — invalid document shape returns error', () => {
  it('returns SafetyErrorResponse for null input', () => {
    const result = runDocumentSafetyChecks(null)
    assert.notEqual(result, null)
    assert.equal(result!.isError, true)
    const parsed = JSON.parse(result!.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
    assert.ok(/non-null object/i.test(parsed.message))
  })

  it('returns SafetyErrorResponse for array input', () => {
    const result = runDocumentSafetyChecks([{ type: 'paragraph', text: 'x' }])
    assert.notEqual(result, null)
    assert.equal(result!.isError, true)
    const parsed = JSON.parse(result!.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
  })

  it('returns SafetyErrorResponse for string input', () => {
    const result = runDocumentSafetyChecks('not an object')
    assert.notEqual(result, null)
    assert.equal(result!.isError, true)
  })

  it('returns SafetyErrorResponse for a document with empty content array', () => {
    const result = runDocumentSafetyChecks({ content: [] })
    assert.notEqual(result, null)
    assert.equal(result!.isError, true)
    const parsed = JSON.parse(result!.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
  })

  it('returns SafetyErrorResponse for a document with invalid element type', () => {
    const result = runDocumentSafetyChecks({
      content: [{ type: 'not-real-type', text: 'x' }],
    })
    assert.notEqual(result, null)
    assert.equal(result!.isError, true)
  })
})

describe('runDocumentSafetyChecks — response envelope shape', () => {
  it('error response has content array with one text item', () => {
    const result = runDocumentSafetyChecks(null)
    assert.notEqual(result, null)
    assert.ok(Array.isArray(result!.content))
    assert.equal(result!.content.length, 1)
    assert.equal(result!.content[0].type, 'text')
    assert.ok(typeof result!.content[0].text === 'string')
  })

  it('error text is valid JSON', () => {
    const result = runDocumentSafetyChecks(null)
    assert.notEqual(result, null)
    assert.doesNotThrow(() => JSON.parse(result!.content[0].text as string))
  })

  it('error response isError is exactly true', () => {
    const result = runDocumentSafetyChecks(null)
    assert.strictEqual(result!.isError, true)
  })
})
