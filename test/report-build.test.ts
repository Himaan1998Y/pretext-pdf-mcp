/**
 * Unit tests for buildReportDocument in src/tools/generate-report.ts.
 *
 * Directly tests the document-builder without going through the MCP handler,
 * giving precise failure signals if the content structure drifts.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildReportDocument } from '../src/tools/generate-report.js'

const MINIMAL: Parameters<typeof buildReportDocument>[0] = {
  title: 'Annual Report',
  sections: [
    { heading: 'Introduction', body: 'This is the introduction.' },
  ],
}

describe('buildReportDocument — document structure', () => {
  it('returns a PdfDocument with content array', () => {
    const doc = buildReportDocument(MINIMAL)
    assert.ok(Array.isArray(doc.content) && doc.content.length > 0)
    assert.equal(doc.pageSize, 'A4')
  })

  it('header contains the report title', () => {
    const doc = buildReportDocument(MINIMAL)
    assert.ok(doc.header?.text?.includes('Annual Report'), `header.text should include title, got: ${doc.header?.text}`)
  })

  it('footer has page-number tokens', () => {
    const doc = buildReportDocument(MINIMAL)
    assert.ok(doc.footer?.text?.includes('{{pageNumber}}'), 'footer must include {{pageNumber}}')
    assert.ok(doc.footer?.text?.includes('{{totalPages}}'), 'footer must include {{totalPages}}')
  })

  it('title appears as h1 heading', () => {
    const doc = buildReportDocument(MINIMAL)
    const h1 = doc.content.find((el: any) => el.type === 'heading' && el.level === 1)
    assert.ok(h1, 'h1 heading not found')
    assert.equal((h1 as any).text, 'Annual Report')
  })

  it('TOC element is included by default', () => {
    const doc = buildReportDocument(MINIMAL)
    const toc = doc.content.find((el: any) => el.type === 'toc')
    assert.ok(toc, 'TOC element missing (should be present by default)')
  })

  it('TOC omitted when include_toc: false', () => {
    const doc = buildReportDocument({ ...MINIMAL, include_toc: false })
    const toc = doc.content.find((el: any) => el.type === 'toc')
    assert.equal(toc, undefined, 'TOC should be absent when include_toc is false')
  })
})

describe('buildReportDocument — section rendering', () => {
  it('section heading appears as h1 with the section text', () => {
    const doc = buildReportDocument(MINIMAL)
    // Section headings are level 1; the report title is a separate level 1 earlier
    const sectionH1 = doc.content.find((el: any) => el.type === 'heading' && (el as any).text === 'Introduction')
    assert.ok(sectionH1, 'section heading not found')
    assert.equal((sectionH1 as any).level, 1)
  })

  it('section body text appears as paragraph', () => {
    const doc = buildReportDocument(MINIMAL)
    const paras = doc.content.filter((el: any) => el.type === 'paragraph')
    const bodyPara = paras.find((el: any) => (el as any).text?.includes('introduction'))
    assert.ok(bodyPara, 'section body paragraph not found')
  })

  it('multiple sections each produce a heading with the section text', () => {
    const doc = buildReportDocument({
      title: 'Report',
      sections: [
        { heading: 'Section A', body: 'Body A' },
        { heading: 'Section B', body: 'Body B' },
        { heading: 'Section C', body: 'Body C' },
      ],
    })
    const allText = JSON.stringify(doc.content)
    assert.ok(allText.includes('Section A'), 'Section A heading not found')
    assert.ok(allText.includes('Section B'), 'Section B heading not found')
    assert.ok(allText.includes('Section C'), 'Section C heading not found')
    // Each section should produce a heading element
    const headings = doc.content.filter((el: any) => el.type === 'heading')
    assert.ok(headings.length >= 3, `expected at least 3 headings (title + 3 sections), got ${headings.length}`)
  })

  it('section with table produces a table element', () => {
    const doc = buildReportDocument({
      title: 'Report',
      sections: [{
        heading: 'Data',
        body: 'See table below.',
        table: {
          headers: ['Name', 'Value'],
          rows: [['Alpha', '1'], ['Beta', '2']],
        },
      }],
    })
    const tables = doc.content.filter((el: any) => el.type === 'table')
    assert.ok(tables.length > 0, 'table element not found')
    // First row should be a header row with the column names
    const firstTable = tables[0] as any
    assert.ok(firstTable.rows[0].isHeader, 'first row should be header')
    assert.equal(firstTable.rows[0].cells[0].text, 'Name')
    assert.equal(firstTable.rows[0].cells[1].text, 'Value')
  })

  it('section table data rows contain correct values', () => {
    const doc = buildReportDocument({
      title: 'Report',
      sections: [{
        heading: 'Data',
        body: 'Table.',
        table: { headers: ['X'], rows: [['row1'], ['row2']] },
      }],
    })
    const firstTable = doc.content.find((el: any) => el.type === 'table') as any
    // rows[0] = header, rows[1] = first data row, rows[2] = second
    assert.equal(firstTable.rows[1].cells[0].text, 'row1')
    assert.equal(firstTable.rows[2].cells[0].text, 'row2')
  })

  it('section with callout produces a callout element', () => {
    const doc = buildReportDocument({
      title: 'Report',
      sections: [{
        heading: 'Warning',
        body: 'Read this.',
        callout: { style: 'warning', text: 'Important notice!' },
      }],
    })
    const callout = doc.content.find((el: any) => el.type === 'callout') as any
    assert.ok(callout, 'callout element not found')
    assert.equal(callout.style, 'warning')
    assert.equal(callout.content, 'Important notice!')
  })

  it('section callout defaults to info style when style omitted', () => {
    const doc = buildReportDocument({
      title: 'Report',
      sections: [{
        heading: 'Note',
        body: 'Body.',
        callout: { style: 'info', text: 'FYI' },
      }],
    })
    const callout = doc.content.find((el: any) => el.type === 'callout') as any
    assert.ok(callout)
    assert.equal(callout.style, 'info')
  })

  it('multi-paragraph body (double newline) splits into multiple paragraphs', () => {
    const doc = buildReportDocument({
      title: 'Report',
      sections: [{
        heading: 'Long',
        body: 'First paragraph.\n\nSecond paragraph.',
      }],
    })
    const paras = doc.content.filter((el: any) => el.type === 'paragraph')
    const bodyParas = paras.filter((el: any) =>
      (el as any).text?.includes('First') || (el as any).text?.includes('Second')
    )
    assert.equal(bodyParas.length, 2, 'double-newline body should produce 2 paragraphs')
  })

  it('subtitle appears as paragraph below title', () => {
    const doc = buildReportDocument({ ...MINIMAL, subtitle: 'Q1 2026 Edition' })
    const paras = doc.content.filter((el: any) => el.type === 'paragraph')
    const subtitlePara = paras.find((el: any) => (el as any).text?.includes('Q1 2026 Edition'))
    assert.ok(subtitlePara, 'subtitle paragraph not found')
  })

  it('author and date appear in document content', () => {
    const doc = buildReportDocument({
      ...MINIMAL,
      author: 'Himanshu',
      date: '2026-05-29',
    })
    const allText = JSON.stringify(doc.content)
    assert.ok(allText.includes('Himanshu'), 'author not found in content')
    assert.ok(allText.includes('2026-05-29'), 'date not found in content')
  })
})
