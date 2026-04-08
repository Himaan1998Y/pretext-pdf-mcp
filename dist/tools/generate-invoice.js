import { render } from 'pretext-pdf';
import { toBase64 } from '../utils/base64.js';
const CURRENCY_SYMBOLS = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
};
function formatMoney(amount, symbol) {
    return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function partyBlock(p) {
    const lines = [p.company];
    if (p.address)
        lines.push(p.address);
    if (p.gstin)
        lines.push(`GSTIN: ${p.gstin}`);
    if (p.email)
        lines.push(p.email);
    if (p.phone)
        lines.push(p.phone);
    return lines.join('\n');
}
function todayISO() {
    return new Date().toISOString().slice(0, 10);
}
function buildInvoiceDocument(input) {
    const currency = input.currency ?? 'INR';
    const sym = CURRENCY_SYMBOLS[currency];
    const date = input.date ?? todayISO();
    const invoiceNo = input.invoice_number ?? `INV-${Date.now()}`;
    const hasHsn = input.items.some(i => i.hsn_code);
    const hasGst = input.items.some(i => i.gst_rate !== undefined && i.gst_rate > 0);
    // Build columns for line items table
    const itemColumns = [{ width: '3*', align: 'left' }];
    if (hasHsn)
        itemColumns.push({ width: 70, align: 'center' });
    itemColumns.push({ width: 60, align: 'right' });
    itemColumns.push({ width: 80, align: 'right' });
    itemColumns.push({ width: 90, align: 'right' });
    // Header row for items table
    const headerCells = [
        { text: 'Description', fontWeight: 700, color: '#ffffff' },
    ];
    if (hasHsn)
        headerCells.push({ text: 'HSN', fontWeight: 700, color: '#ffffff' });
    headerCells.push({ text: 'Qty', fontWeight: 700, color: '#ffffff' });
    headerCells.push({ text: 'Rate', fontWeight: 700, color: '#ffffff' });
    headerCells.push({ text: 'Amount', fontWeight: 700, color: '#ffffff' });
    // Data rows
    let subtotal = 0;
    const itemRows = [{ isHeader: true, cells: headerCells }];
    for (const item of input.items) {
        const amount = item.quantity * item.rate;
        subtotal += amount;
        const cells = [{ text: item.description }];
        if (hasHsn)
            cells.push({ text: item.hsn_code ?? '' });
        cells.push({ text: String(item.quantity) });
        cells.push({ text: formatMoney(item.rate, sym) });
        cells.push({ text: formatMoney(amount, sym) });
        itemRows.push({ cells });
    }
    // GST calculation: use IGST if inter-state (default), or CGST+SGST if intra
    // We'll use IGST for simplicity (single tax line)
    const totalGst = hasGst
        ? input.items.reduce((sum, item) => {
            const amount = item.quantity * item.rate;
            const rate = item.gst_rate ?? 0;
            return sum + (amount * rate) / 100;
        }, 0)
        : 0;
    const grandTotal = subtotal + totalGst;
    // Build totals section
    const totalsContent = [
        { type: 'hr', color: '#dddddd', thickness: 0.5, spaceBelow: 6 },
        {
            type: 'paragraph',
            text: `Subtotal:  ${formatMoney(subtotal, sym)}`,
            align: 'right',
            spaceAfter: hasGst ? 4 : 8,
        },
    ];
    if (hasGst) {
        // Build per-rate GST breakdown
        const rateGroups = {};
        for (const item of input.items) {
            if (!item.gst_rate)
                continue;
            const amount = item.quantity * item.rate;
            rateGroups[item.gst_rate] = (rateGroups[item.gst_rate] ?? 0) + (amount * item.gst_rate) / 100;
        }
        for (const [rate, gstAmt] of Object.entries(rateGroups)) {
            totalsContent.push({
                type: 'paragraph',
                text: `IGST @ ${rate}%:  ${formatMoney(gstAmt, sym)}`,
                align: 'right',
                color: '#555555',
                spaceAfter: 4,
            });
        }
        totalsContent.push({ type: 'hr', color: '#1a1a2e', thickness: 1, spaceBelow: 6 });
        totalsContent.push({
            type: 'paragraph',
            text: `GRAND TOTAL:  ${formatMoney(grandTotal, sym)}`,
            fontSize: 13,
            fontWeight: 700,
            color: '#1a1a2e',
            align: 'right',
            spaceAfter: 16,
        });
    }
    else {
        totalsContent.push({ type: 'hr', color: '#1a1a2e', thickness: 1, spaceBelow: 6 });
        totalsContent.push({
            type: 'paragraph',
            text: `TOTAL:  ${formatMoney(grandTotal, sym)}`,
            fontSize: 13,
            fontWeight: 700,
            color: '#1a1a2e',
            align: 'right',
            spaceAfter: 16,
        });
    }
    const content = [
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
    ];
    // Notes
    if (input.notes) {
        content.push({ type: 'hr', color: '#e8e8e8', thickness: 0.5, spaceBelow: 10 });
        content.push({ type: 'heading', level: 4, text: 'Notes', spaceAfter: 4 });
        content.push({ type: 'paragraph', text: input.notes, fontSize: 10, color: '#555555', spaceAfter: 12 });
    }
    // Footer note
    content.push({ type: 'hr', color: '#e8e8e8', thickness: 0.5, spaceBelow: 8 });
    content.push({
        type: 'paragraph',
        text: 'Generated by pretext-pdf',
        fontSize: 8,
        color: '#aaaaaa',
        align: 'center',
    });
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
    };
}
export const generateInvoiceTool = {
    schema: {
        name: 'generate_invoice',
        description: 'Generate a professional invoice PDF. Accepts structured invoice data (from/to parties, line items, GST). Returns base64-encoded PDF. Supports INR/USD/EUR/GBP currencies. GST (IGST) is auto-calculated when gst_rate is set on items.',
        inputSchema: {
            type: 'object',
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
                    },
                    required: ['company'],
                },
                invoice_number: { type: 'string', description: 'Invoice identifier e.g. INV-2026-001' },
                date: { type: 'string', description: 'Invoice date ISO format YYYY-MM-DD. Defaults to today.' },
                due_date: { type: 'string', description: 'Payment due date ISO format.' },
                currency: {
                    type: 'string',
                    enum: ['INR', 'USD', 'EUR', 'GBP'],
                    description: 'Currency. Default: INR',
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
                filename: { type: 'string', description: 'Suggested filename without .pdf extension.' },
            },
            required: ['from', 'to', 'items'],
        },
    },
    handler: async (args) => {
        try {
            // Validate required fields
            if (!args.from || !args.to) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from and to are required' }) }],
                    isError: true,
                };
            }
            const items = args.items;
            if (!Array.isArray(items) || items.length === 0) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'items must be a non-empty array' }) }],
                    isError: true,
                };
            }
            const input = args;
            const doc = buildInvoiceDocument(input);
            const bytes = await render(doc);
            const base64 = toBase64(bytes);
            const invoiceNo = input.invoice_number ?? 'invoice';
            const filename = (args.filename ?? `invoice-${invoiceNo}`) + '.pdf';
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({ success: true, base64, filename, size_bytes: bytes.length }),
                    },
                ],
            };
        }
        catch (err) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: err.code ?? 'UNKNOWN_ERROR',
                            message: err.message,
                        }),
                    },
                ],
                isError: true,
            };
        }
    },
};
