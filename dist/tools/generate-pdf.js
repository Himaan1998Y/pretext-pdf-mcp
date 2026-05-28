import { render } from 'pretext-pdf';
import { toBase64 } from '../utils/base64.js';
import { runDocumentSafetyChecks } from '../utils/safety.js';
import { assertOutputSize, MAX_CONTENT_ELEMENTS } from '../utils/limits.js';
export const generatePdfTool = {
    schema: {
        name: 'generate_pdf',
        description: 'Generate a PDF from a custom PdfDocument JSON descriptor. Use this for any layout not covered by generate_invoice or generate_report — e.g. resumes, contracts, certificates, presentations, or any multi-element composition. Returns base64-encoded PDF bytes. Call list_element_types first to see available elements and options.',
        inputSchema: {
            type: 'object',
            properties: {
                document: {
                    type: 'object',
                    description: 'A PdfDocument config object. Call list_element_types first to see available element shapes for the content array.',
                    properties: {
                        content: {
                            type: 'array',
                            description: 'Array of content elements. Each element has a "type" field — see list_element_types for all shapes.',
                            items: { type: 'object', required: ['type'] },
                        },
                        pageSize: {
                            description: 'Page size. Named: "A4" | "Letter" | "Legal" | "A3" | "A5". Or [width, height] in pt.',
                        },
                        margins: {
                            type: 'object',
                            description: 'Page margins in pt. Fields: top, bottom, left, right. Default: 72pt each.',
                            properties: {
                                top: { type: 'number' }, bottom: { type: 'number' },
                                left: { type: 'number' }, right: { type: 'number' },
                            },
                        },
                        metadata: {
                            type: 'object',
                            description: 'PDF metadata: title, author, subject, keywords (string[]), language (BCP47), creator, producer.',
                        },
                        header: {
                            type: 'object',
                            description: 'Page header. Props: text (supports {{pageNumber}}/{{totalPages}}/{{date}}/{{author}}), fontSize, color, align.',
                        },
                        footer: {
                            type: 'object',
                            description: 'Page footer. Same props as header.',
                        },
                        defaultFont: {
                            type: 'string',
                            description: 'Primary font family. Default: "Inter". Must be registered via fonts array or be a system font.',
                        },
                        fonts: {
                            type: 'array',
                            description: 'Custom font registrations. Each: { family, src (https:// or file path), weight, style }.',
                        },
                        watermark: {
                            type: 'object',
                            description: 'Background watermark. Text: { text, opacity, rotation?, color? }. Image: { image (Uint8Array), opacity }.',
                        },
                        encryption: {
                            type: 'object',
                            description: 'PDF password encryption. Props: userPassword, ownerPassword, permissions (printing, copying, modifying, annotating).',
                        },
                        bookmarks: {
                            description: 'Bookmark outline from headings. true (all), false (off), or { minLevel, maxLevel }.',
                        },
                    },
                    required: ['content'],
                },
                filename: {
                    type: 'string',
                    description: 'Suggested filename (without .pdf extension)',
                    default: 'document',
                },
            },
            required: ['document'],
        },
    },
    handler: async (args) => {
        try {
            if (!args.document || typeof args.document !== 'object' || Array.isArray(args.document)) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'document is required and must be an object' }) }],
                    isError: true,
                };
            }
            // Defence-in-depth: prototype-pollution guard + schema validation.
            // Shared with generate_invoice, generate_report, and generate_from_markdown.
            const safetyError = runDocumentSafetyChecks(args.document);
            if (safetyError)
                return safetyError;
            const doc = args.document;
            if (Array.isArray(doc.content) && doc.content.length > MAX_CONTENT_ELEMENTS) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `content array length ${doc.content.length} exceeds limit ${MAX_CONTENT_ELEMENTS}` }) }],
                    isError: true,
                };
            }
            // Safe cast to PdfDocument: runDocumentSafetyChecks proved doc conforms structurally
            const bytes = await render(doc);
            assertOutputSize(bytes, 'generate_pdf');
            const base64 = toBase64(bytes);
            const filename = (args.filename || 'document') + '.pdf';
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
            const e = err;
            const message = err instanceof Error ? err.message : String(err);
            if (!(err instanceof Error) || !e.code) {
                process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', tool: 'generate_pdf', msg: message }) + '\n');
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({ success: false, error: e.code ?? 'UNKNOWN_ERROR', message }),
                    },
                ],
                isError: true,
            };
        }
    },
};
