import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateFromMarkdownTool } from '../src/tools/generate-from-markdown.js'

describe('generate_from_markdown tool', () => {
  it('converts markdown to a valid PDF', async () => {
    const result = await generateFromMarkdownTool.handler({
      markdown: '# Hello\n\nThis is **bold** text and a [link](https://example.com).',
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(typeof parsed.base64 === 'string' && parsed.base64.length > 0)
    assert.ok(parsed.size_bytes > 1000)
    assert.equal(parsed.filename, 'document.pdf')
  })

  it('uses custom filename and page_size', async () => {
    const result = await generateFromMarkdownTool.handler({
      markdown: '# Report\n\nContent.',
      filename: 'my-report',
      page_size: 'Letter',
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.equal(parsed.filename, 'my-report.pdf')
  })

  it('returns VALIDATION_ERROR for empty markdown', async () => {
    const result = await generateFromMarkdownTool.handler({ markdown: '   ' })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
  })

  it('returns VALIDATION_ERROR when markdown exceeds 100,000 characters', async () => {
    const result = await generateFromMarkdownTool.handler({ markdown: 'x'.repeat(100_001) })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
    assert.ok(parsed.message.includes('100,000'))
  })

  it('returns VALIDATION_ERROR when font_size is below 6', async () => {
    const result = await generateFromMarkdownTool.handler({
      markdown: '# Test',
      font_size: 4,
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
    assert.ok(parsed.message.includes('6') && parsed.message.includes('144'))
  })

  it('returns VALIDATION_ERROR when font_size is above 144', async () => {
    const result = await generateFromMarkdownTool.handler({
      markdown: '# Test',
      font_size: 200,
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
  })

  it('accepts font_size at boundary values (6 and 144)', async () => {
    for (const font_size of [6, 144]) {
      const result = await generateFromMarkdownTool.handler({ markdown: 'Boundary test.', font_size })
      assert.equal(result.isError, undefined, `font_size ${font_size} should be accepted`)
    }
  })
})
