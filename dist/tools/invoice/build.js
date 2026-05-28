import { CURRENCY_SYMBOLS, CURRENCY_LOCALES } from './types.js';
// Brand colors for invoice rendering
const INVOICE_PRIMARY_COLOR = '#1a1a2e'; // navy — headings, header bg, total accents, separators
const INVOICE_MUTED_COLOR = '#aaaaaa'; // gray — footer text
export function formatMoney(amount, symbol, currency) {
    const locale = CURRENCY_LOCALES[currency];
    return `${symbol}${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function partyBlock(p) {
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
export function todayISO() {
    return new Date().toISOString().slice(0, 10);
}
export function buildInvoiceDocument(input, invoiceNo) {
    const currency = input.currency ?? 'INR';
    const sym = CURRENCY_SYMBOLS[currency];
    const date = input.date ?? todayISO();
    const hasHsn = input.items.some((i) => i.hsn_code);
    const hasGst = input.items.some((i) => i.gst_rate !== undefined && i.gst_rate > 0);
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
        cells.push({ text: formatMoney(item.rate, sym, currency) });
        cells.push({ text: formatMoney(amount, sym, currency) });
        itemRows.push({ cells });
    }
    // GST: use IGST (single tax line) for simplicity
    const totalGst = hasGst
        ? input.items.reduce((sum, item) => {
            const amount = item.quantity * item.rate;
            const rate = item.gst_rate ?? 0;
            return sum + (amount * rate) / 100;
        }, 0)
        : 0;
    const grandTotal = Math.round((subtotal + totalGst) * 100) / 100;
    // Totals section
    const totalsContent = [
        { type: 'hr', color: '#dddddd', thickness: 0.5, spaceAfter: 6 },
        {
            type: 'paragraph',
            text: `Subtotal:  ${formatMoney(subtotal, sym, currency)}`,
            align: 'right',
            spaceAfter: hasGst ? 4 : 8,
        },
    ];
    if (hasGst) {
        const rateGroups = {};
        for (const item of input.items) {
            if (!item.gst_rate)
                continue;
            const amount = item.quantity * item.rate;
            const gst = Math.round((amount * item.gst_rate) / 100 * 100) / 100;
            rateGroups[item.gst_rate] = Math.round(((rateGroups[item.gst_rate] ?? 0) + gst) * 100) / 100;
        }
        for (const [rate, gstAmt] of Object.entries(rateGroups)) {
            totalsContent.push({
                type: 'paragraph',
                text: `IGST @ ${rate}%:  ${formatMoney(gstAmt, sym, currency)}`,
                align: 'right',
                color: '#555555',
                spaceAfter: 4,
            });
        }
        totalsContent.push({ type: 'hr', color: INVOICE_PRIMARY_COLOR, thickness: 1, spaceAfter: 6 });
        totalsContent.push({
            type: 'paragraph',
            text: `GRAND TOTAL:  ${formatMoney(grandTotal, sym, currency)}`,
            fontSize: 13,
            fontWeight: 700,
            color: INVOICE_PRIMARY_COLOR,
            align: 'right',
            spaceAfter: 16,
        });
    }
    else {
        totalsContent.push({ type: 'hr', color: INVOICE_PRIMARY_COLOR, thickness: 1, spaceAfter: 6 });
        totalsContent.push({
            type: 'paragraph',
            text: `TOTAL:  ${formatMoney(grandTotal, sym, currency)}`,
            fontSize: 13,
            fontWeight: 700,
            color: INVOICE_PRIMARY_COLOR,
            align: 'right',
            spaceAfter: 16,
        });
    }
    const content = [
        { type: 'heading', level: 1, text: input.from.company, fontSize: 22, color: INVOICE_PRIMARY_COLOR, spaceAfter: 4 },
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
        { type: 'hr', color: INVOICE_PRIMARY_COLOR, thickness: 2, spaceAfter: 12 },
        { type: 'heading', level: 3, text: 'INVOICE', fontSize: 16, color: INVOICE_PRIMARY_COLOR, spaceAfter: 8 },
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
        { type: 'heading', level: 3, text: 'Services / Items', color: INVOICE_PRIMARY_COLOR, spaceAfter: 6 },
        {
            type: 'table',
            columns: itemColumns,
            rows: itemRows,
            headerBgColor: INVOICE_PRIMARY_COLOR,
            borderColor: '#e0e0e0',
            borderWidth: 0.5,
            cellPaddingH: 8,
            cellPaddingV: 6,
            spaceAfter: 4,
        },
        ...totalsContent,
    ];
    if (input.upi_qr_data) {
        content.push({ type: 'paragraph', text: 'Scan to pay via UPI:', fontSize: 9, color: '#555555', spaceAfter: 4 });
        content.push({ type: 'qr-code', data: input.upi_qr_data, size: 72, align: 'left', spaceAfter: 8 });
    }
    if (input.notes) {
        content.push({ type: 'hr', color: '#e8e8e8', thickness: 0.5, spaceAfter: 10 });
        content.push({ type: 'heading', level: 4, text: 'Notes', spaceAfter: 4 });
        content.push({ type: 'paragraph', text: input.notes, fontSize: 10, color: '#555555', spaceAfter: 12 });
    }
    content.push({ type: 'hr', color: '#e8e8e8', thickness: 0.5, spaceAfter: 8 });
    content.push({
        type: 'paragraph',
        text: 'Generated by pretext-pdf',
        fontSize: 8,
        color: INVOICE_MUTED_COLOR,
        align: 'center',
    });
    return {
        pageSize: 'A4',
        margins: { top: 50, bottom: 50, left: 56, right: 56 },
        defaultFontSize: 10,
        footer: {
            text: `Invoice ${invoiceNo}  ·  Page {{pageNumber}} of {{totalPages}}`,
            fontSize: 8,
            color: INVOICE_MUTED_COLOR,
            align: 'center',
        },
        content,
    };
}
