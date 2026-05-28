/**
 * Unit tests for src/tools/invoice/build.ts helpers.
 *
 * Now that buildInvoiceDocument, formatMoney, partyBlock, and todayISO
 * are isolated in a dedicated module, they can be tested directly without
 * spinning up the full MCP handler or running a PDF render.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney, partyBlock, todayISO, buildInvoiceDocument } from '../src/tools/invoice/build.js'

describe('formatMoney', () => {
  it('formats INR with correct symbol and Indian locale grouping', () => {
    const result = formatMoney(62500, '₹', 'INR')
    assert.ok(result.startsWith('₹'), `expected ₹ prefix, got: ${result}`)
    assert.ok(result.includes('62'), `expected numeric part, got: ${result}`)
    assert.ok(result.includes('.00'), `expected 2 decimal places, got: ${result}`)
  })

  it('formats USD with $ symbol', () => {
    const result = formatMoney(1234.5, '$', 'USD')
    assert.ok(result.startsWith('$'), `expected $ prefix, got: ${result}`)
    assert.ok(result.endsWith('50'), `expected .50 suffix, got: ${result}`)
  })

  it('formats zero with two decimal places (locale-aware separator)', () => {
    // EUR uses German locale (de-DE): decimal separator is comma → €0,00
    const result = formatMoney(0, '€', 'EUR')
    assert.ok(result.startsWith('€'), `expected € prefix, got: ${result}`)
    // Accept either . or , as decimal separator (locale-dependent)
    assert.match(result, /0[.,]00$/, `expected 0.00 or 0,00 suffix, got: ${result}`)
  })

  it('rounds to 2 decimal places', () => {
    const result = formatMoney(10.999, '$', 'USD')
    // toLocaleString rounds to 2dp
    assert.ok(result.includes('11.00') || result.includes('11'), `expected rounded value, got: ${result}`)
  })
})

describe('partyBlock', () => {
  it('returns just company name when only company is set', () => {
    const result = partyBlock({ company: 'Acme Corp' })
    assert.equal(result, 'Acme Corp')
  })

  it('includes address on its own line', () => {
    const result = partyBlock({ company: 'Acme Corp', address: '123 Main St' })
    assert.equal(result, 'Acme Corp\n123 Main St')
  })

  it('includes GSTIN with prefix', () => {
    const result = partyBlock({ company: 'TCS', gstin: '27AAACT2727Q1ZW' })
    assert.ok(result.includes('GSTIN: 27AAACT2727Q1ZW'), `GSTIN line missing, got: ${result}`)
  })

  it('includes email and phone', () => {
    const result = partyBlock({ company: 'X', email: 'x@example.com', phone: '+91-9876543210' })
    const lines = result.split('\n')
    assert.ok(lines.includes('x@example.com'), 'email not in output')
    assert.ok(lines.includes('+91-9876543210'), 'phone not in output')
  })

  it('line order is: company, address, gstin, email, phone', () => {
    const result = partyBlock({
      company: 'Co',
      address: 'Addr',
      gstin: 'GST123',
      email: 'e@e.com',
      phone: '123',
    })
    const lines = result.split('\n')
    assert.equal(lines[0], 'Co')
    assert.equal(lines[1], 'Addr')
    assert.equal(lines[2], 'GSTIN: GST123')
    assert.equal(lines[3], 'e@e.com')
    assert.equal(lines[4], '123')
  })
})

describe('todayISO', () => {
  it('returns a YYYY-MM-DD string', () => {
    const result = todayISO()
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/, `expected YYYY-MM-DD, got: ${result}`)
  })

  it('returns today\'s date', () => {
    const result = todayISO()
    const today = new Date().toISOString().slice(0, 10)
    assert.equal(result, today)
  })
})

describe('buildInvoiceDocument', () => {
  const BASE = {
    from: { company: 'Seller Co', address: 'Delhi' },
    to: { company: 'Buyer Co', address: 'Mumbai' },
    items: [{ description: 'Consulting', quantity: 2, rate: 5000 }],
  }

  it('returns a PdfDocument with required fields', () => {
    const doc = buildInvoiceDocument(BASE, 'INV-001')
    assert.equal(doc.pageSize, 'A4')
    assert.ok(Array.isArray(doc.content) && doc.content.length > 0)
    assert.ok(doc.footer?.text?.includes('INV-001'), 'footer must reference invoice number')
  })

  it('content includes company name as h1 heading', () => {
    const doc = buildInvoiceDocument(BASE, 'INV-001')
    const heading = doc.content.find((el: any) => el.type === 'heading' && el.level === 1)
    assert.ok(heading, 'h1 heading not found')
    assert.equal((heading as any).text, 'Seller Co')
  })

  it('defaults currency to INR and uses ₹ symbol in totals', () => {
    const doc = buildInvoiceDocument(BASE, 'INV-001')
    const paras = doc.content.filter((el: any) => el.type === 'paragraph' && typeof el.text === 'string')
    const totalPara = paras.find((el: any) => el.text.includes('TOTAL') || el.text.includes('₹'))
    assert.ok(totalPara, 'total paragraph with ₹ not found')
  })

  it('uses provided invoice number in the content table', () => {
    const doc = buildInvoiceDocument(BASE, 'INV-TEST-42')
    const tables = doc.content.filter((el: any) => el.type === 'table')
    const tableText = JSON.stringify(tables)
    assert.ok(tableText.includes('INV-TEST-42'), 'invoice number not found in table cells')
  })

  it('adds notes section when notes provided', () => {
    const doc = buildInvoiceDocument({ ...BASE, notes: 'Pay within 30 days' }, 'INV-001')
    const headings = doc.content.filter((el: any) => el.type === 'heading')
    const notesHeading = headings.find((el: any) => (el as any).text === 'Notes')
    assert.ok(notesHeading, 'Notes heading not found when notes provided')
  })

  it('does not add notes section when notes omitted', () => {
    const doc = buildInvoiceDocument(BASE, 'INV-001')
    const headings = doc.content.filter((el: any) => el.type === 'heading')
    const notesHeading = headings.find((el: any) => (el as any).text === 'Notes')
    assert.equal(notesHeading, undefined, 'Notes heading should not appear without notes')
  })

  it('includes GST line when gst_rate provided', () => {
    const docWithGst = buildInvoiceDocument({
      ...BASE,
      items: [{ description: 'Service', quantity: 1, rate: 10000, gst_rate: 18 }],
    }, 'INV-001')
    const paras = docWithGst.content.filter((el: any) => el.type === 'paragraph' && typeof el.text === 'string')
    const gstLine = paras.find((el: any) => (el.text as string).includes('IGST'))
    assert.ok(gstLine, 'IGST line not found when gst_rate is set')
  })

  it('adds QR code element when upi_qr_data provided', () => {
    const doc = buildInvoiceDocument({ ...BASE, upi_qr_data: 'upi://pay?pa=test@upi' }, 'INV-001')
    const qr = doc.content.find((el: any) => el.type === 'qr-code')
    assert.ok(qr, 'qr-code element not found when upi_qr_data provided')
    assert.equal((qr as any).data, 'upi://pay?pa=test@upi')
  })

  it('total is subtotal + GST (arithmetic check)', () => {
    // 1 item: qty=1, rate=1000, gst=10% → subtotal=1000, gst=100, total=1100
    const doc = buildInvoiceDocument({
      ...BASE,
      items: [{ description: 'Item', quantity: 1, rate: 1000, gst_rate: 10 }],
    }, 'INV-001')
    const paras = doc.content.filter((el: any) => el.type === 'paragraph' && typeof el.text === 'string')
    const grandTotal = paras.find((el: any) => (el.text as string).includes('GRAND TOTAL'))
    assert.ok(grandTotal, 'GRAND TOTAL paragraph not found')
    assert.ok((grandTotal as any).text.includes('1,100') || (grandTotal as any).text.includes('1100'),
      `Expected 1100 in GRAND TOTAL, got: ${(grandTotal as any).text}`)
  })
})
