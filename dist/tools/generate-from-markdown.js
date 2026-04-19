import { render } from 'pretext-pdf';
import { markdownToContent } from 'pretext-pdf/markdown';
import { toBase64 } from '../utils/base64.js';
export const generateFromMarkdownTool = {
    schema: {
        name: 'generate_from_markdown',
        description: 'Convert a Markdown string to a PDF. Supports headings, bold/italic, links, ordered/unordered lists (2 levels), blockquotes, code blocks, and horizontal rules. Returns a base64-encoded PDF.',
        inputSchema: {
            type: 'object',
            properties: {
                markdown: {
                    type: 'string',
                    description: 'Markdown source to convert. Max 100,000 characters.',
                },
                filename: {
                    type: 'string',
                    description: 'Suggested filename without .pdf extension. Default: document',
                },
                page_size: {
                    type: 'string',
                    enum: ['A4', 'Letter', 'Legal'],
                    description: 'Page size. Default: A4',
                },
                font_size: {
                    type: 'number',
                    description: 'Body font size in pt. Default: 12',
                },
            },
            required: ['markdown'],
        },
    },
    handler: async (args) => {
        try {
            const markdown = args.markdown;
            if (typeof markdown !== 'string' || markdown.trim() === '') {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'markdown is required and must be a non-empty string' }) }],
                    isError: true,
                };
            }
            if (markdown.length > 100_000) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'markdown must be 100,000 characters or fewer' }) }],
                    isError: true,
                };
            }
            if (typeof args.font_size === 'number' && (args.font_size < 6 || args.font_size > 144)) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'font_size must be between 6 and 144' }) }],
                    isError: true,
                };
            }
            const content = await markdownToContent(markdown);
            const pageSizeArg = args.page_size ?? 'A4';
            const doc = {
                pageSize: pageSizeArg,
                defaultFontSize: typeof args.font_size === 'number' ? args.font_size : 12,
                content,
            };
            const bytes = await render(doc);
            const base64 = toBase64(bytes);
            const filename = (args.filename ?? 'document') + '.pdf';
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
                process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', tool: 'generate_from_markdown', msg: message }) + '\n');
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
