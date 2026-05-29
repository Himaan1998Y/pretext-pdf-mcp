/**
 * base64.test.ts — Unit tests for src/utils/base64.ts
 *
 * Covers toBase64() which is called by every tool that returns a PDF.
 * Small surface but exercising it directly pins the encoding contract
 * and ensures a refactor (e.g. switching from Buffer to btoa) doesn't
 * silently change output format.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toBase64 } from '../src/utils/base64.js'

describe('toBase64', () => {
  it('encodes an empty Uint8Array to an empty string', () => {
    const result = toBase64(new Uint8Array(0))
    assert.equal(result, '')
  })

  it('encodes a single byte correctly', () => {
    // 0x00 → 'AA==' in base64
    const result = toBase64(new Uint8Array([0x00]))
    assert.equal(result, 'AA==')
  })

  it('encodes [0xFF] correctly', () => {
    // 255 decimal → '/w==' in base64
    const result = toBase64(new Uint8Array([0xff]))
    assert.equal(result, '/w==')
  })

  it('encodes known ASCII string bytes', () => {
    // 'Hello' in ASCII → 'SGVsbG8=' in base64
    const bytes = new Uint8Array([72, 101, 108, 108, 111])
    const result = toBase64(bytes)
    assert.equal(result, 'SGVsbG8=')
  })

  it('output can be decoded back to the original bytes', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 128, 200, 255])
    const encoded = toBase64(original)
    const decoded = Buffer.from(encoded, 'base64')
    assert.deepEqual(Array.from(decoded), Array.from(original))
  })

  it('returns a string type', () => {
    const result = toBase64(new Uint8Array([65]))
    assert.equal(typeof result, 'string')
  })

  it('only contains valid base64 characters', () => {
    const bytes = new Uint8Array(256).map((_, i) => i)
    const result = toBase64(bytes)
    assert.match(result, /^[A-Za-z0-9+/]+=*$/, 'result must be valid base64 characters only')
  })

  it('length follows base64 sizing rule (ceil(n/3)*4 chars)', () => {
    for (const n of [0, 1, 2, 3, 4, 9, 12, 100]) {
      const bytes = new Uint8Array(n).fill(42)
      const result = toBase64(bytes)
      const expectedLength = n === 0 ? 0 : Math.ceil(n / 3) * 4
      assert.equal(result.length, expectedLength, `n=${n}: expected length ${expectedLength}, got ${result.length}`)
    }
  })

  it('encodes a 1 KB buffer without throwing', () => {
    const bytes = new Uint8Array(1024).fill(0xab)
    assert.doesNotThrow(() => toBase64(bytes))
    const result = toBase64(bytes)
    assert.ok(result.length > 0)
  })

  it('encodes a PDF-like header bytes correctly (roundtrip)', () => {
    // %PDF-1.7 signature bytes
    const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
    const encoded = toBase64(pdfHeader)
    const decoded = Buffer.from(encoded, 'base64')
    assert.equal(decoded.toString('ascii'), '%PDF-1.7')
  })
})
