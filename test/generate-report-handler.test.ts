/**
 * Handler-level unit tests for generateReportTool in src/tools/generate-report.ts.
 *
 * Tests all validation paths that return before reaching render(), so no mock needed.
 * Each validation path is independent — tested by omitting / malforming one field at a time.
 *
 * Run standalone:
 *   cd F:\Antigravity\brain\projects\pretext-pdf-mcp
 *   npx tsx --test test/generate-report-handler.test.ts
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { generateReportTool } = await import('../src/tools/generate-report.js')
const handler = generateReportTool.handler

const VALID_SECTION = { heading: 'Introduction', body: 'This is the body.' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseError(result: Awaited<ReturnType<typeof handler>>) {
  assert.strictEqual(result.isError, true, 'expected isError: true')
  return JSON.parse(result.content[0]!.text) as { success: boolean; error: string; message: string }
}

// ─── Validation paths (all return before render()) ───────────────────────────

describe('generateReportTool.handler — missing title', () => {
  it('missing title returns VALIDATION_ERROR', async () => {
    const result = await handler({ sections: [VALID_SECTION] })
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
    assert.ok(err.message.toLowerCase().includes('title'), `expected message to mention title, got: ${err.message}`)
  })

  it('title: null returns VALIDATION_ERROR', async () => {
    const result = await handler({ title: null, sections: [VALID_SECTION] })
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
  })

  it('title: 123 (non-string) returns VALIDATION_ERROR', async () => {
    const result = await handler({ title: 123, sections: [VALID_SECTION] })
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
  })
})

describe('generateReportTool.handler — invalid sections', () => {
  it('empty sections array returns VALIDATION_ERROR', async () => {
    const result = await handler({ title: 'T', sections: [] })
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
    assert.ok(err.message.toLowerCase().includes('sections'))
  })

  it('sections: undefined returns VALIDATION_ERROR', async () => {
    const result = await handler({ title: 'T' })
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
  })

  it('sections: "string" (non-array) returns VALIDATION_ERROR', async () => {
    const result = await handler({ title: 'T', sections: 'not-an-array' })
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
  })

  it('section with missing heading returns VALIDATION_ERROR', async () => {
    const result = await handler({ title: 'T', sections: [{ body: 'B' }] })
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
    assert.ok(err.message.includes('heading'))
  })

  it('section with missing body returns VALIDATION_ERROR', async () => {
    const result = await handler({ title: 'T', sections: [{ heading: 'H' }] })
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
    assert.ok(err.message.includes('body'))
  })
})

describe('generateReportTool.handler — callout validation', () => {
  it('invalid callout style returns VALIDATION_ERROR with message about callout.style', async () => {
    const result = await handler({
      title: 'T',
      sections: [{ heading: 'H', body: 'B', callout: { style: 'danger', text: 'Alert!' } }],
    })
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
    assert.ok(err.message.includes('callout.style'), `expected message about callout.style, got: ${err.message}`)
  })

  it('callout with empty text returns VALIDATION_ERROR', async () => {
    const result = await handler({
      title: 'T',
      sections: [{ heading: 'H', body: 'B', callout: { style: 'info', text: '' } }],
    })
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
    assert.ok(err.message.includes('callout.text'))
  })

  it('callout with non-object value returns VALIDATION_ERROR', async () => {
    const result = await handler({
      title: 'T',
      sections: [{ heading: 'H', body: 'B', callout: 'not-an-object' }],
    })
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
  })
})

describe('generateReportTool.handler — unsafe keys guard', () => {
  it('args with __proto__ key returns VALIDATION_ERROR about unsafe keys', async () => {
    // Build an args object that has __proto__ as an enumerable own property
    const args = JSON.parse('{"title":"T","sections":[{"heading":"H","body":"B"}],"__proto__":{"x":1}}')
    const result = await handler(args)
    const err = parseError(result)
    assert.strictEqual(err.error, 'VALIDATION_ERROR')
    assert.ok(err.message.toLowerCase().includes('unsafe'), `expected 'unsafe' in message, got: ${err.message}`)
  })
})

describe('generateReportTool.handler — response shape contract', () => {
  it('happy path or render error both produce a content[0].text JSON string', async () => {
    const result = await handler({ title: 'My Report', sections: [VALID_SECTION] })
    assert.ok(Array.isArray(result.content), 'content must be an array')
    assert.ok(result.content.length > 0, 'content must be non-empty')
    const text = result.content[0]!.text
    assert.ok(typeof text === 'string', 'content[0].text must be a string')
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (result.isError) {
      assert.strictEqual(parsed.success, false)
      assert.ok(typeof parsed.error === 'string', 'error field must be a string on error path')
      assert.ok(typeof parsed.message === 'string', 'message field must be a string on error path')
    } else {
      assert.strictEqual(parsed.success, true)
      assert.ok(typeof parsed.base64 === 'string', 'base64 must be a string on success path')
      assert.ok(typeof parsed.filename === 'string', 'filename must be a string on success path')
      assert.ok((parsed.filename as string).endsWith('.pdf'), 'filename must end with .pdf')
    }
  })
})
