import { randomBytes } from 'node:crypto';
import { render } from 'pretext-pdf';
import { toBase64 } from '../utils/base64.js';
import { hasUnsafeKeys, runDocumentSafetyChecks } from '../utils/safety.js';
import { assertOutputSize } from '../utils/limits.js';
import { SUPPORTED_CURRENCIES } from './invoice/types.js';
import { buildInvoiceDocument } from './invoice/build.js';
export const generateInvoiceTool = {
    schema: {
        name: 'generate_invoice',
        description: `Generate a professional invoice PDF. Accepts structured invoice data (from/to parties, line items, optional GST/tax). Returns base64-encoded PDF. Supports ${SUPPORTED_CURRENCIES.join('/')} currencies. Currency symbols (₹ $ € £) are guaranteed not to break away from adjacent numbers across line wraps. gst_rate on items creates a tax column — use it for any tax system (GST, VAT, sales tax). Per-item gst_rate is summed as IGST in the totals; CGST/SGST inter-vs-intra-state routing is not currently supported.`,
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
                                minimum: 0,
                                maximum: 100,
                                description: 'Tax rate % (GST, VAT, sales tax, etc.). Common Indian GST slabs: 0, 5, 12, 18, 28. Any non-negative value up to 100 is accepted.',
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
    handler: async (args) => {
        try {
            if (hasUnsafeKeys(args)) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Input contains unsafe keys (__proto__, constructor, prototype)' }) }],
                    isError: true,
                };
            }
            if (!args.from || typeof args.from !== 'object' || typeof args.from.company !== 'string') {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.company is required and must be a string' }) }], isError: true };
            }
            if (!args.to || typeof args.to !== 'object' || typeof args.to.company !== 'string') {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.company is required and must be a string' }) }], isError: true };
            }
            const rawCurrency = args.currency ?? 'INR';
            if (!SUPPORTED_CURRENCIES.includes(rawCurrency)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `Unsupported currency: ${rawCurrency}. Supported: ${SUPPORTED_CURRENCIES.join(', ')}` }) }], isError: true };
            }
            const items = args.items;
            if (!Array.isArray(items) || items.length === 0) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'items must be a non-empty array' }) }], isError: true };
            }
            if (items.length > 500) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'items must have 500 or fewer entries' }) }], isError: true };
            }
            // Control-character regex — available for items loop and party field checks below
            const CTRL_CHARS = /[\n\r\x00]/;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item || typeof item !== 'object') {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}] must be an object` }) }], isError: true };
                }
                if (typeof item.description !== 'string' || item.description.trim() === '') {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].description is required` }) }], isError: true };
                }
                if (typeof item.quantity !== 'number' || item.quantity <= 0 || !isFinite(item.quantity)) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].quantity must be a positive finite number` }) }], isError: true };
                }
                if (typeof item.rate !== 'number' || item.rate < 0 || !isFinite(item.rate)) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].rate must be a non-negative finite number` }) }], isError: true };
                }
                if (item.gst_rate !== undefined && (typeof item.gst_rate !== 'number' || !isFinite(item.gst_rate) || item.gst_rate < 0 || item.gst_rate > 100)) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].gst_rate must be a finite number between 0 and 100` }) }], isError: true };
                }
                if (item.hsn_code !== undefined && typeof item.hsn_code !== 'string') {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].hsn_code must be a string` }) }], isError: true };
                }
                if (typeof item.hsn_code === 'string' && item.hsn_code.length > 20) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].hsn_code must be 20 characters or fewer` }) }], isError: true };
                }
                if (typeof item.hsn_code === 'string' && CTRL_CHARS.test(item.hsn_code)) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].hsn_code must not contain newline or null characters` }) }], isError: true };
                }
                if (typeof item.description === 'string' && item.description.length > 500) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `items[${i}].description must be 500 characters or fewer` }) }], isError: true };
                }
            }
            const fromParty = args.from;
            const toParty = args.to;
            if (fromParty.company.length > 200) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.company must be 200 characters or fewer' }) }], isError: true };
            }
            if (typeof fromParty.address === 'string' && fromParty.address.length > 200) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.address must be 200 characters or fewer' }) }], isError: true };
            }
            if (toParty.company.length > 200) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.company must be 200 characters or fewer' }) }], isError: true };
            }
            if (typeof toParty.address === 'string' && toParty.address.length > 200) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.address must be 200 characters or fewer' }) }], isError: true };
            }
            if (typeof args.notes === 'string' && args.notes.length > 2000) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'notes must be 2000 characters or fewer' }) }], isError: true };
            }
            if (typeof args.upi_qr_data === 'string' && args.upi_qr_data.length > 2953) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'upi_qr_data must be 2953 characters or fewer (QR code capacity limit)' }) }], isError: true };
            }
            if (typeof fromParty.gstin === 'string' && fromParty.gstin.length > 20) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.gstin must be 20 characters or fewer' }) }], isError: true };
            }
            if (typeof fromParty.gstin === 'string' && CTRL_CHARS.test(fromParty.gstin)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.gstin must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof fromParty.email === 'string' && fromParty.email.length > 254) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.email must be 254 characters or fewer' }) }], isError: true };
            }
            if (typeof fromParty.phone === 'string' && fromParty.phone.length > 20) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.phone must be 20 characters or fewer' }) }], isError: true };
            }
            if (typeof toParty.gstin === 'string' && toParty.gstin.length > 20) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.gstin must be 20 characters or fewer' }) }], isError: true };
            }
            if (typeof toParty.gstin === 'string' && CTRL_CHARS.test(toParty.gstin)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.gstin must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof toParty.email === 'string' && toParty.email.length > 254) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.email must be 254 characters or fewer' }) }], isError: true };
            }
            if (typeof toParty.phone === 'string' && toParty.phone.length > 20) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.phone must be 20 characters or fewer' }) }], isError: true };
            }
            if (CTRL_CHARS.test(fromParty.company)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.company must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof fromParty.address === 'string' && CTRL_CHARS.test(fromParty.address)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.address must not contain newline or null characters' }) }], isError: true };
            }
            if (CTRL_CHARS.test(toParty.company)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.company must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof toParty.address === 'string' && CTRL_CHARS.test(toParty.address)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.address must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof args.invoice_number === 'string' && CTRL_CHARS.test(args.invoice_number)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'invoice_number must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof args.date === 'string' && CTRL_CHARS.test(args.date)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'date must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof args.due_date === 'string' && CTRL_CHARS.test(args.due_date)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'due_date must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof fromParty.email === 'string' && CTRL_CHARS.test(fromParty.email)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.email must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof fromParty.phone === 'string' && CTRL_CHARS.test(fromParty.phone)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'from.phone must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof toParty.email === 'string' && CTRL_CHARS.test(toParty.email)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.email must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof toParty.phone === 'string' && CTRL_CHARS.test(toParty.phone)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'to.phone must not contain newline or null characters' }) }], isError: true };
            }
            if (typeof args.notes === 'string' && CTRL_CHARS.test(args.notes)) {
                return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'notes must not contain newline or null characters' }) }], isError: true };
            }
            const input = args;
            const invoiceNo = (input.invoice_number) || `INV-${Date.now()}-${randomBytes(3).toString('hex')}`;
            const doc = buildInvoiceDocument(input, invoiceNo);
            const safetyError = runDocumentSafetyChecks(doc);
            if (safetyError)
                return safetyError;
            const bytes = await render(doc);
            assertOutputSize(bytes, 'generate_invoice');
            const base64 = toBase64(bytes);
            const filename = (args.filename || `invoice-${invoiceNo}`) + '.pdf';
            return {
                content: [
                    { type: 'text', text: JSON.stringify({ success: true, base64, filename, size_bytes: bytes.length }) },
                ],
            };
        }
        catch (err) {
            const e = err;
            const message = err instanceof Error ? err.message : String(err);
            const safeMessage = e.code ? message : 'Internal error — see server logs for details';
            if (!(err instanceof Error) || !e.code) {
                process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', tool: 'generate_invoice', msg: message }) + '\n');
            }
            return {
                content: [
                    { type: 'text', text: JSON.stringify({ success: false, error: e.code ?? 'UNKNOWN_ERROR', message: safeMessage }) },
                ],
                isError: true,
            };
        }
    },
};
