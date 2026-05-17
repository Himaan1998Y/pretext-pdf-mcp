/**
 * Limits and guard-function tests for pretext-pdf-mcp.
 *
 * Covers the string-aware checkJsonDepth state machine, assertOutputSize,
 * and the limit constants exported from src/utils/limits.ts.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  checkJsonDepth,
  assertOutputSize,
  MAX_PDF_OUTPUT_BYTES,
  MAX_CONTENT_ELEMENTS,
  MAX_REPORT_SECTIONS,
  JSON_MAX_DEPTH,
  MAX_MARKDOWN_CHARS,
} from '../src/utils/limits.js'

describe('checkJsonDepth', () => {
  it('accepts empty string', () => {
    assert.doesNotThrow(() => checkJsonDepth(''))
  })

  it('accepts a flat object', () => {
    assert.doesNotThrow(() => checkJsonDepth('{"a":1,"b":2}'))
  })

  it('accepts depth equal to the limit (50)', () => {
    const raw = '['.repeat(50) + ']'.repeat(50)
    assert.doesNotThrow(() => checkJsonDepth(raw))
  })

  it('rejects depth exceeding the limit (51)', () => {
    const raw = '['.repeat(51) + ']'.repeat(51)
    assert.throws(() => checkJsonDepth(raw), /JSON depth 51 exceeds limit 50/)
  })

  it('does not count brackets inside string values (false-positive guard)', () => {
    // 60 literal '{' characters inside one string value — naive counter would trip.
    const payload = JSON.stringify({ s: '{'.repeat(60) + '['.repeat(60) })
    assert.doesNotThrow(() => checkJsonDepth(payload))
  })

  it('handles escaped quotes inside strings', () => {
    // String contains an escaped quote followed by brackets — must remain in-string.
    const payload = '{"k":"a\\"' + '{'.repeat(60) + '"}'
    assert.doesNotThrow(() => checkJsonDepth(payload))
  })

  it('respects a custom max', () => {
    const raw = '[[[]]]'
    assert.throws(() => checkJsonDepth(raw, 2), /exceeds limit 2/)
    assert.doesNotThrow(() => checkJsonDepth(raw, 3))
  })
})

describe('assertOutputSize', () => {
  it('passes for bytes under the cap', () => {
    const bytes = new Uint8Array(1024)
    assert.doesNotThrow(() => assertOutputSize(bytes, 'test_tool'))
  })

  it('throws for bytes over the cap and includes the size in the message', () => {
    const oversized = new Uint8Array(MAX_PDF_OUTPUT_BYTES + 1)
    assert.throws(
      () => assertOutputSize(oversized, 'test_tool'),
      /test_tool: output PDF exceeds 50MB limit/,
    )
  })
})

describe('limit constants', () => {
  it('MAX_PDF_OUTPUT_BYTES is 50MB', () => {
    assert.equal(MAX_PDF_OUTPUT_BYTES, 50 * 1024 * 1024)
  })
  it('MAX_CONTENT_ELEMENTS is 500', () => {
    assert.equal(MAX_CONTENT_ELEMENTS, 500)
  })
  it('MAX_REPORT_SECTIONS is 100', () => {
    assert.equal(MAX_REPORT_SECTIONS, 100)
  })
  it('JSON_MAX_DEPTH is 50', () => {
    assert.equal(JSON_MAX_DEPTH, 50)
  })
  it('MAX_MARKDOWN_CHARS is 200_000', () => {
    assert.equal(MAX_MARKDOWN_CHARS, 200_000)
  })
})
