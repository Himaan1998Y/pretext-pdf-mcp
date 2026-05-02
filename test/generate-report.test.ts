import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateReportTool } from '../src/tools/generate-report.js'

describe('generate_report tool', () => {
  it('generates a 3-section report with TOC', async () => {
    const result = await generateReportTool.handler({
      title: 'Haryana Real Estate Market Q1 2026',
      subtitle: 'Residential & Commercial Analysis',
      author: 'Antigravity Research',
      date: '2026-04-08',
      include_toc: true,
      sections: [
        {
          heading: 'Executive Summary',
          body: 'The Haryana residential real estate market demonstrated robust growth in Q1 2026.\n\nWeighted average residential prices across Gurugram reached Rs.12,400/sqft, up 11% year-on-year.',
        },
        {
          heading: 'Market Drivers',
          body: 'Infrastructure completions drove significant re-rating of New Gurugram values.\n\nPolicy environment improvements further boosted buyer confidence.',
        },
        {
          heading: 'Outlook',
          body: 'We maintain a positive outlook for Haryana residential real estate over the next 12 months.',
        },
      ],
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(parsed.size_bytes > 1000)
  })

  it('generates a report with a data table in a section', async () => {
    const result = await generateReportTool.handler({
      title: 'Market Pricing Report',
      include_toc: false,
      sections: [
        {
          heading: 'Price Summary',
          body: 'The following table shows average prices by location.',
          table: {
            headers: ['Location', 'Avg Rs./sqft', 'YoY Change'],
            rows: [
              ['Gurugram - DLF', '18,200', '+9.2%'],
              ['Gurugram - New Gurugram', '9,800', '+15.6%'],
              ['Faridabad', '5,200', '+6.8%'],
            ],
          },
        },
      ],
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(parsed.size_bytes > 1000)
  })

  it('generates a report with callout boxes', async () => {
    const result = await generateReportTool.handler({
      title: 'Risk Assessment Report',
      include_toc: false,
      sections: [
        {
          heading: 'Key Risks',
          body: 'The following risks have been identified for the coming quarter.',
          callout: {
            style: 'warning',
            text: 'Any upward revision to repo rates above 6.75% could compress volumes by 10-15% over two quarters.',
          },
        },
        {
          heading: 'Recommendations',
          body: 'Based on current data, we recommend the following actions.',
          callout: {
            style: 'tip',
            text: 'Early movers in Sonipat RRTS corridor stand to gain 25-30% appreciation over a 3-year horizon.',
          },
        },
      ],
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(parsed.size_bytes > 1000)
  })

  it('generates a minimal report (title + 1 section, no TOC)', async () => {
    const result = await generateReportTool.handler({
      title: 'Quick Summary',
      include_toc: false,
      sections: [
        {
          heading: 'Overview',
          body: 'This is a minimal one-section report.',
        },
      ],
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(parsed.size_bytes > 1000)
  })
})

describe('generate_report tool — validation errors', () => {
  it('rejects missing title', async () => {
    const result = await generateReportTool.handler({
      sections: [{ heading: 'Section', body: 'Body text.' }],
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
    assert.match(parsed.message, /title/)
  })

  it('rejects empty sections array', async () => {
    const result = await generateReportTool.handler({
      title: 'My Report',
      sections: [],
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
    assert.match(parsed.message, /sections/)
  })

  it('rejects section missing heading', async () => {
    const result = await generateReportTool.handler({
      title: 'My Report',
      sections: [{ body: 'No heading here.' }],
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
    assert.match(parsed.message, /heading/)
  })

  it('rejects section missing body', async () => {
    const result = await generateReportTool.handler({
      title: 'My Report',
      sections: [{ heading: 'No body here.' }],
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
    assert.match(parsed.message, /body/)
  })

  it('rejects invalid callout style', async () => {
    const result = await generateReportTool.handler({
      title: 'My Report',
      sections: [{
        heading: 'Section',
        body: 'Body.',
        callout: { style: 'danger', text: 'Watch out.' },
      }],
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
    assert.match(parsed.message, /callout\.style/)
  })

  it('rejects table with non-array headers', async () => {
    const result = await generateReportTool.handler({
      title: 'My Report',
      sections: [{
        heading: 'Section',
        body: 'Body.',
        table: { headers: 'Col1,Col2', rows: [] },
      }],
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
  })

  it('includes section index in error for multi-section docs', async () => {
    const result = await generateReportTool.handler({
      title: 'My Report',
      sections: [
        { heading: 'Valid section', body: 'Fine.' },
        { heading: '', body: 'Empty heading.' },
      ],
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.match(parsed.message, /sections\[1\]/)
  })
})
