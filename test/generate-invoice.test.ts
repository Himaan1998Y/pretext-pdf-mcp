import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateInvoiceTool } from '../src/tools/generate-invoice.js'

const BASE_FROM = { company: 'Antigravity Systems', address: 'Gurugram, Haryana', gstin: '06AABCA1234Z1ZK', email: 'hello@antigravity.dev', phone: '+91 98765 43210' }
const BASE_TO = { company: 'TCS Ltd', address: 'Mumbai, Maharashtra', gstin: '27AAACT2727Q1ZW' }

describe('generate_invoice tool', () => {
  it('generates a minimal invoice (from, to, 2 items, INR)', async () => {
    const result = await generateInvoiceTool.handler({
      from: BASE_FROM,
      to: BASE_TO,
      invoice_number: 'INV-2026-001',
      currency: 'INR',
      items: [
        { description: 'Consulting Services', quantity: 10, rate: 5000 },
        { description: 'Travel Expenses', quantity: 1, rate: 12000 },
      ],
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(typeof parsed.base64 === 'string' && parsed.base64.length > 0)
    assert.ok(parsed.size_bytes > 1000, `expected > 1000 bytes, got ${parsed.size_bytes}`)
  })

  it('generates an invoice with GST fields and size > 5000 bytes', async () => {
    const result = await generateInvoiceTool.handler({
      from: BASE_FROM,
      to: BASE_TO,
      invoice_number: 'INV-2026-002',
      date: '2026-04-08',
      due_date: '2026-05-08',
      currency: 'INR',
      items: [
        { description: 'LLM Fine-tuning Pipeline', hsn_code: '998314', quantity: 1, rate: 250000, gst_rate: 18 },
        { description: 'AI Strategy Workshop', hsn_code: '998399', quantity: 2, rate: 75000, gst_rate: 18 },
        { description: 'ML Engineer (March)', hsn_code: '998313', quantity: 1, rate: 180000, gst_rate: 18 },
        { description: 'Infrastructure Setup', hsn_code: '998315', quantity: 1, rate: 80000, gst_rate: 12 },
        { description: 'Monthly Retainer', hsn_code: '998316', quantity: 1, rate: 50000, gst_rate: 18 },
      ],
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(parsed.size_bytes > 5000, `expected > 5000 bytes, got ${parsed.size_bytes}`)
  })

  it('generates an invoice with USD currency', async () => {
    const result = await generateInvoiceTool.handler({
      from: { company: 'Acme Corp', address: 'San Francisco, CA', email: 'billing@acme.com' },
      to: { company: 'Globex Inc', address: 'New York, NY' },
      currency: 'USD',
      items: [
        { description: 'Software License', quantity: 5, rate: 299 },
        { description: 'Support Plan', quantity: 1, rate: 1500 },
      ],
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(parsed.size_bytes > 1000)
  })

  it('generates an invoice with notes section', async () => {
    const result = await generateInvoiceTool.handler({
      from: BASE_FROM,
      to: BASE_TO,
      currency: 'INR',
      items: [{ description: 'Data Analysis', quantity: 40, rate: 2000 }],
      notes: 'Payment via NEFT/IMPS. Late fee of 1.5% per month after due date. Subject to Gurugram jurisdiction.',
    })
    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
    assert.ok(parsed.size_bytes > 1000)
  })

  it('returns isError true when items array is missing', async () => {
    const result = await generateInvoiceTool.handler({
      from: BASE_FROM,
      to: BASE_TO,
      items: [],
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, false)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
  })
})
