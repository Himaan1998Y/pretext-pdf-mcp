import { randomBytes } from 'node:crypto'
import { render } from 'pretext-pdf'
import { toBase64 } from '../utils/base64.js'

interface InvoiceParty {
  company: string
  address?: string
  gstin?: string
  email?: string
  phone?: string
}

interface InvoiceItem {
  description: string
  hsn_code?: string
  quantity: number
  rate: number
  gst_rate?: number
}

const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const
type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]

const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
}

interface InvoiceInput {
  from: InvoiceParty
  to: InvoiceParty
  invoice_number?: string
  date?: string
  due_date?: string
  currency?: SupportedCurrency
  items: InvoiceItem[]
  notes?: string
  upi_qr_data?: string
}

const CURRENCY_LOCALES: Record<SupportedCurrency, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
}

function formatMoney(amount: number, symbol: string, currency: SupportedCurrency): string {
  const locale = CURRENCY_LOCALES[currency]
  return `${symbol}${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function partyBlock(p: InvoiceParty): string {
  const lines: string[] = [p.company]
  if (p.address) lines.push(p.address)
  if (p.gstin) lines.push(`GSTIN: ${p.gstin}`)
  if (p.email) lines.push(p.email)
  if (p.phone) lines.push(p.phone)
  return lines.join('\n')
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildInvoiceDocument(input: InvoiceInput, invoiceNo: string): any {
  const currency = input.currency ?? 'INR'
  const sym = CURRENCY_SYMBOLS[currency]
  const date = input.date ?? todayISO()
  const hasHsn = input.items.some(i => i.hsn_code)
  const hasGst = input.items.some(i => i.gst_rate !== undefined && i.gst_rate > 0)

  // Build columns for line items table
  const itemColumns: any[] = [{ width: '3*', align: 'left' }]
  if (hasHsn) itemColumns.push({ width: 70, align: 'center' })
  itemColumns.push({ width: 60, align: 'right' })
  itemColumns.push({ width: 80, align: 'right' })
  itemColumns.push({ width: 90, align: 'right' })

  // Header row for items table
  const headerCells: any[] = [
    { text: 'Description', fontWeight: 700, color: '#ffffff' },
  ]
  if (hasHsn) headerCells.push({ text: 'HSN', fontWeight: 700, color: '#ffffff' })
  headerCells.push({ text: 'Qty', fontWeight: 700, color: '#ffffff' })
  headerCells.push({ text: 'Rate', fontWeight: 700, color: '#ffffff' })
  headerCells.push({ text: 'Amount', fontWeight: 700, color: '#ffffff' })

  // Data rows
  let subtotal = 0
  const itemRows: any[] = [{ isHeader: true, cells: headerCells }]

  for (const item of input.items) {
    const amount = item.quantity * item.rate
    subtotal += amount
    const cells: any[] = [{ text: item.description }]
    if (hasHsn) cells.push({ text: item.hsn_code ?? '' })
    cells.push({ text: String(item.quantity) })
    cells.push({ text: formatMoney(item.rate, sym, currency) })
    cells.push({ text: formatMoney(amount, sym, currency) })
    itemRows.push({ cells })
  }

  // GST calculation: use IGST if inter-state (default), or CGST+SGST if intra
  // We'll use IGST for simplicity (single tax line)
  const totalGst = hasGst
    ? input.items.reduce((sum, item) => {
        const amount = item.quantity * item.rate
        const rate = item.gst_rate ?? 0
        return sum + (amount * rate) / 100
      }, 0)
    : 0

  const grandTotal = Math.round((subtotal + totalGst) * 100) / 100

  // Build totals section
  const totalsContent: any[] = [
    { type: 'hr', color: '#dddddd', thickness: 0.5, spaceBelow: 6 },
    {
      type: 'paragraph',
      text: `Subtotal:  ${formatMoney(subtotal, sym, currency)}`,
      align: 'right',
      spaceAfter: hasGst ? 4 : 8,
    },
  ]

  if (hasGst) {
    // Build per-rate GST breakdown
    const rateGroups: Record<number, number> = {}
    for (const item of input.items) {
      if (!item.gst_rate) continue
      const amount = item.quantity * item.rate
      const gst = Math.round((amount * item.gst_rate) / 100 * 100) / 100
      rateGroups[item.gst_rate] = Math.round(((rateGroups[item.gst_rate] ?? 0) + gst) * 100) / 100
    }
    for (const [rate, gstAmt] of Object.entries(rateGroups)) {
      totalsContent.push({
        type: 'paragraph',
        text: `IGST @ ${rate}%:  ${formatMoney(gstAmt, sym, currency)}`,
        align: 'right',
        color: '#555555',
        spaceAfter: 4,
      })
    }
    totalsContent.push({ type: 'hr', color: '#1a1a2e', thickness: 1, spaceBelow: 6 })
    totalsContent.push({
      type: 'paragraph',
      text: `GRAND TOTAL:  ${formatMoney(grandTotal, sym, currency)}`,
      fontSize: 13,
      fontWeight: 700,
      color: '#1a1a2e',
      align: 'right',
      spaceAfter: 16,
    })
  } else {
    totalsContent.push({ type: 'hr', color: '#1a1a2e', thickness: 1, spaceBelow: 6 })
    totalsContent.push({
      type: 'paragraph',
      text: `TOTAL:  ${formatMoney(grandTotal, sym, currency)}`,
      fontSize: 13,
      fontWeight: 700,
      color: '#1a1a2e',
      align: 'right',
      spaceAfter: 16,
    })
  }

  const content: any[] = [
    // Header: company name
    { type: 'heading', level: 1, text: input.from.company, fontSize: 22, color: '#1a1a2e', spaceAfter: 4 },
    {
      type: 'paragraph',
      text: [input.from.address, input.from.gstin ? `GSTIN: ${input.from.gstin}` : null]
        .filter(Boolean)
        .join('  ·  '),
      fontSize: 9,
      color: '#666666',
      spaceAfter: 2,
    },
    {
      type: 'paragraph',
      text: [input.from.email, input.from.phone].filter(Boolean).join('  ·  '),
      fontSize: 9,
      color: '#0070f3',
      spaceAfter: 14,
    },
    { type: 'hr', color: '#1a1a2e', thickness: 2, spaceBelow: 12 },

    // Invoice meta
    { type: 'heading', level: 3, text: 'INVOICE', fontSize: 16, color: '#1a1a2e', spaceAfter: 8 },
    {
      type: 'table',
      columns: [{ width: '1*' }, { width: '1*' }],
      rows: [
        {
          cells: [
            { text: `Invoice No.\n${invoiceNo}` },
            { text: `Bill To\n${partyBlock(input.to)}` },
          ],
        },
        {
          cells: [
            { text: `Date\n${date}` },
            { text: input.due_date ? `Due Date\n${input.due_date}` : '' },
          ],
        },
      ],
      borderColor: '#e8e8e8',
      borderWidth: 0.5,
      cellPaddingH: 10,
      cellPaddingV: 8,
      spaceAfter: 16,
    },

    // Line items
    { type: 'heading', level: 3, text: 'Services / Items', color: '#1a1a2e', spaceAfter: 6 },
    {
      type: 'table',
      columns: itemColumns,
      rows: itemRows,
      headerBgColor: '#1a1a2e',
      borderColor: '#e0e0e0',
      borderWidth: 0.5,
      cellPaddingH: 8,
      cellPaddingV: 6,
      spaceAfter: 4,
    },

    // Totals
    ...totalsContent,
  ]

  // UPI QR code (optional)
  if (input.upi_qr_data) {
    content.push({ type: 'paragraph', text: 'Scan to pay via UPI:', fontSize: 9, color: '#555555', spaceAfter: 4 })
    content.push({ type: 'qr-code', data: input.upi_qr_data, size: 72, align: 'left', spaceAfter: 8 })
  }

  // Notes
  if (input.notes) {
    content.push({ type: 'hr', color: '#e8e8e8', thickness: 0.5, spaceBelow: 10 })
    content.push({ type: 'heading', level: 4, text: 'Notes', spaceAfter: 4 })
    content.push({ type: 'paragraph', text: input.notes, fontSize: 10, color: '#555555', spaceAfter: 12 })
  }

  // Footer note
  content.push({ type: 'hr', color: '#e8e8e8', thickness: 0.5, spaceBelow: 8 })
  content.push({
    type: 'paragraph',
    text: 'Generated by pretext-pdf',
    fontSize: 8,
    color: '#aaaaaa',
    align: 'center',
  })

  return {
    pageSize: 'A4',
    margins: { top: 50, bottom: 50, left: 56, right: 56 },
    defaultFontSize: 10,
    footer: {
      text: `Invoice ${invoiceNo}  ·  Page {{pageNumber}} of {{totalPages}}`,
      fontSize: 8,
      color: '#aaaaaa',
      align: 'center',
    },
    content,
  }
}

export const generateInvoiceTool = {
  schema: {
    name: 'generate_invoice',
    description:
      `Generate a professional invoice PDF. Accepts structured invoice data (from/to parties, line items, optional GST/tax). Returns base64-encoded PDF. Supports ${SUPPORTED_CURRENCIES.join('/')} currencies. Currency symbols (₹ $ € £) are guaranteed not to break away from adjacent numbers across line wraps. gst_rate on items creates a tax column — use it for any tax system (GST, VAT, sales tax). For Indian invoices, provide supplier.state and buyer.state to auto-route IGST (inter-state) vs CGST+SGST (intra-state).`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        from: {
          type: 'object',
          description: 'Issuing party (your company)',
          properties: {
            company: { type: 'string' },
            address: { type: 'string' },
            gstin: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
          },
          required: ['company'],
        },
        to: {
          type: 'object',
          description: 'Billing party (client)',
          properties: {
            company: { type: 'string' },
            address: { type: 'string' },
            gstin: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
          },
          required: ['company'],
        },
        invoice_number: { type: 'string', description: 'Invoice identifier e.g. INV-2026-001' },
        date: { type: 'string', description: 'Invoice date ISO format YYYY-MM-DD. Defaults to today.' },
        due_date: { type: 'string', description: 'Payment due date ISO format.' },
        currency: {
          type: 'string',
          enum: [...SUPPORTED_CURRENCIES],
          description: `Currency. Default: INR`,
        },
        items: {
          type: 'array',
          description: 'Line items',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              hsn_code: { type: 'string', description: 'HSN/SAC code for India GST' },
              quantity: { type: 'number' },
              rate: { type: 'number', description: 'Unit price' },
              gst_rate: {
                type: 'number',
                enum: [0, 5, 12, 18, 28],
                description: 'GST rate %. If set, IGST is calculated.',
              },
            },
            required: ['description', 'quantity', 'rate'],
          },
        },
        notes: { type: 'string', description: 'Additional notes or payment terms.' },
        upi_qr_data: { type: 'string', description: 'UPI payment string for QR code, e.g. "upi://pay?pa=merchant@upi&pn=Name&am=1000". When provided, a scannable QR code is embedded in the PDF.' },
        filename: { type: 'string', description: 'Suggested filename without .pdf extension.' },
      },
      required: ['from', 'to', 'items'],
    },
  },

  handler: async (args: Record<string, unknown>) => {
    try {
      // C5: validate from/to are objects with required company string
      if (!args.from || typeof args.from !== 'object' || typeof (args.from as any).company !== 'string') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.company is required and must be a string' }) }],
          isError: true,
        }
      }
      if (!args.to || typeof args.to !== 'object' || typeof (args.to as any).company !== 'string') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.company is required and must be a string' }) }],
          isError: true,
        }
      }

      // C3: validate currency before buildInvoiceDocument uses it
      const rawCurrency = (args.currency as string | undefined) ?? 'INR'
      if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(rawCurrency)) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `Unsupported currency: ${rawCurrency}. Supported: ${SUPPORTED_CURRENCIES.join(', ')}` }) }],
          isError: true,
        }
      }

      const items = args.items as any[]
      if (!Array.isArray(items) || items.length === 0) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'items must be a non-empty array' }) }],
          isError: true,
        }
      }
      if (items.length > 500) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'items must have 500 or fewer entries' }) }],
          isError: true,
        }
      }

      // C4: validate each item's numeric fields to prevent NaN/Infinity in financial calculations
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (!item || typeof item !== 'object') {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}] must be an object` }) }], isError: true }
        }
        if (typeof item.description !== 'string' || item.description.trim() === '') {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].description is required` }) }], isError: true }
        }
        if (typeof item.quantity !== 'number' || item.quantity <= 0 || !isFinite(item.quantity)) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].quantity must be a positive finite number` }) }], isError: true }
        }
        if (typeof item.rate !== 'number' || item.rate < 0 || !isFinite(item.rate)) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].rate must be a non-negative finite number` }) }], isError: true }
        }
        if (item.gst_rate !== undefined && ![0, 5, 12, 18, 28].includes(item.gst_rate)) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].gst_rate must be one of [0, 5, 12, 18, 28]` }) }], isError: true }
        }
        if (item.hsn_code !== undefined && typeof item.hsn_code !== 'string') {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].hsn_code must be a string` }) }], isError: true }
        }
        if (typeof item.hsn_code === 'string' && item.hsn_code.length > 20) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].hsn_code must be 20 characters or fewer` }) }], isError: true }
        }
        if (typeof item.description === 'string' && item.description.length > 500) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].description must be 500 characters or fewer` }) }], isError: true }
        }
      }

      // Length caps on free-text fields to prevent resource exhaustion in the renderer
      const fromParty = args.from as any
      const toParty = args.to as any
      if ((fromParty.company as string).length > 200) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.company must be 200 characters or fewer' }) }], isError: true }
      }
      if (typeof fromParty.address === 'string' && fromParty.address.length > 200) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.address must be 200 characters or fewer' }) }], isError: true }
      }
      if ((toParty.company as string).length > 200) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.company must be 200 characters or fewer' }) }], isError: true }
      }
      if (typeof toParty.address === 'string' && toParty.address.length > 200) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.address must be 200 characters or fewer' }) }], isError: true }
      }
      if (typeof args.notes === 'string' && (args.notes as string).length > 2000) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'notes must be 2000 characters or fewer' }) }], isError: true }
      }
      if (typeof args.upi_qr_data === 'string' && (args.upi_qr_data as string).length > 2953) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'upi_qr_data must be 2953 characters or fewer (QR code capacity limit)' }) }], isError: true }
      }
      // Additional length caps for optional party fields
      if (typeof fromParty.gstin === 'string' && fromParty.gstin.length > 20) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.gstin must be 20 characters or fewer' }) }], isError: true }
      }
      if (typeof fromParty.email === 'string' && fromParty.email.length > 254) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.email must be 254 characters or fewer' }) }], isError: true }
      }
      if (typeof fromParty.phone === 'string' && fromParty.phone.length > 20) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.phone must be 20 characters or fewer' }) }], isError: true }
      }
      if (typeof toParty.gstin === 'string' && toParty.gstin.length > 20) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.gstin must be 20 characters or fewer' }) }], isError: true }
      }
      if (typeof toParty.email === 'string' && toParty.email.length > 254) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.email must be 254 characters or fewer' }) }], isError: true }
      }
      if (typeof toParty.phone === 'string' && toParty.phone.length > 20) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.phone must be 20 characters or fewer' }) }], isError: true }
      }
      // Control-character guard: covers metadata/footer fields and rendered heading/paragraph text
      const CTRL_CHARS = /[\n\r\x00]/
      if (CTRL_CHARS.test(fromParty.company as string)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.company must not contain newline or null characters' }) }], isError: true }
      }
      if (typeof fromParty.address === 'string' && CTRL_CHARS.test(fromParty.address)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.address must not contain newline or null characters' }) }], isError: true }
      }
      if (CTRL_CHARS.test(toParty.company as string)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.company must not contain newline or null characters' }) }], isError: true }
      }
      if (typeof toParty.address === 'string' && CTRL_CHARS.test(toParty.address)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.address must not contain newline or null characters' }) }], isError: true }
      }
      if (typeof args.invoice_number === 'string' && CTRL_CHARS.test(args.invoice_number as string)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'invoice_number must not contain newline or null characters' }) }], isError: true }
      }
      if (typeof args.date === 'string' && CTRL_CHARS.test(args.date as string)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'date must not contain newline or null characters' }) }], isError: true }
      }
      if (typeof args.due_date === 'string' && CTRL_CHARS.test(args.due_date as string)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'due_date must not contain newline or null characters' }) }], isError: true }
      }

      const input = args as unknown as InvoiceInput
      const invoiceNo = (input.invoice_number) || `INV-${Date.now()}-${randomBytes(3).toString('hex')}`
      const doc = buildInvoiceDocument(input, invoiceNo)
      const bytes = await render(doc)
      const base64 = toBase64(bytes)
      const filename = ((args.filename as string) || `invoice-${invoiceNo}`) + '.pdf'
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, base64, filename, size_bytes: bytes.length }),
          },
        ],
      }
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      const message = err instanceof Error ? err.message : String(err)
      if (!(err instanceof Error) || !e.code) {
        process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', tool: 'generate_invoice', msg: message }) + '\n')
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: false, error: e.code ?? 'UNKNOWN_ERROR', message }),
          },
        ],
        isError: true,
      }
    }
  },
}
