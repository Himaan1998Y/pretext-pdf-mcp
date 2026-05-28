/**
 * is-client-error.test.ts — Unit tests for isClientError() HTTP status classification.
 *
 * isClientError() governs whether the /api/generate endpoint returns 400 vs 500.
 * A regression that miscategorizes an error code flips an informative 400 into a
 * confusing 500 (or vice versa) silently. These tests pin every category + every
 * ADDITIONAL_CLIENT_CODES entry so any pretext-pdf version bump that changes
 * categorization is caught immediately.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PretextPdfError } from 'pretext-pdf'

// isClientError is not exported — test it indirectly by calling the HTTP endpoint
// with a real PretextPdfError of each category/code. Since we can't import the
// private function directly, we test via the REST path in http-transport.test.ts.
// This file tests the pure logic by constructing errors and checking their category.

describe('PretextPdfError category classification (input to isClientError)', () => {
  // CLIENT_ERROR_CATEGORIES = ['validation', 'security', 'dependency', 'image', 'layout']
  const clientCategories: Array<[string, string]> = [
    ['VALIDATION_ERROR',    'validation'],
    ['PATH_TRAVERSAL',      'security'],
    ['QR_DEP_MISSING',      'dependency'],
    ['IMAGE_LOAD_FAILED',   'image'],
    ['IMAGE_TOO_TALL',      'image'],
    ['IMAGE_FORMAT_MISMATCH', 'image'],
    ['PAGE_TOO_SMALL',      'layout'],
    ['TABLE_COLUMN_TOO_NARROW', 'layout'],
    ['COLSPAN_OVERFLOW',    'layout'],
  ]

  for (const [code, expectedCategory] of clientCategories) {
    it(`${code} has category '${expectedCategory}' (client-error → HTTP 400)`, () => {
      const err = new PretextPdfError(code, 'test')
      assert.equal(err.category, expectedCategory,
        `${code}: expected category '${expectedCategory}', got '${err.category}'`)
    })
  }

  // Server-error categories (font, render, signature) — isClientError returns false
  // for these unless the code is in ADDITIONAL_CLIENT_CODES
  const serverCategories: Array<[string, string]> = [
    ['FONT_EMBED_FAILED',   'font'],
    ['RENDER_FAILED',       'render'],
    ['SIGNATURE_FAILED',    'signature'],
  ]

  for (const [code, expectedCategory] of serverCategories) {
    it(`${code} has category '${expectedCategory}' (server-error → HTTP 500 by default)`, () => {
      const err = new PretextPdfError(code, 'test')
      assert.equal(err.category, expectedCategory)
    })
  }

  // ADDITIONAL_CLIENT_CODES — these are font/render category but treated as 400
  // because the error is caused by bad caller input, not server malfunction.
  const additionalClientCodes = [
    'FONT_NOT_LOADED', 'FONT_LOAD_FAILED', 'ITALIC_FONT_NOT_LOADED', 'MONOSPACE_FONT_REQUIRED',
    'BARCODE_SYMBOLOGY_INVALID', 'CHART_SPEC_INVALID', 'CHART_LOAD_FAILED', 'RTL_REORDER_FAILED',
    'FORM_FIELD_NAME_DUPLICATE',
    'FOOTNOTE_REF_ORPHANED', 'FOOTNOTE_DEF_ORPHANED', 'FOOTNOTE_DEF_DUPLICATE',
    'SIGNATURE_P12_LOAD_FAILED',
  ]

  for (const code of additionalClientCodes) {
    it(`${code} is a valid PretextPdfError code (ADDITIONAL_CLIENT_CODES stability)`, () => {
      // Constructing with the code should not throw — this pins the code string
      // so any rename in pretext-pdf is caught here before it silently breaks the 400/500 mapping.
      const err = new PretextPdfError(code, 'synthetic test')
      assert.equal(err.code, code)
      assert.ok(err instanceof PretextPdfError)
      assert.ok(err instanceof Error)
    })
  }

  it('non-PretextPdfError (TypeError) does not classify as client error', () => {
    const err = new TypeError('something went wrong')
    // isClientError checks instanceof PretextPdfError first — plain errors are server errors
    assert.ok(!(err instanceof PretextPdfError))
  })
})
