import { render } from 'pretext-pdf';
import { toBase64 } from '../utils/base64.js';
import { hasUnsafeKeys, runDocumentSafetyChecks } from '../utils/safety.js';
import { assertOutputSize, MAX_REPORT_SECTIONS } from '../utils/limits.js';
const CALLOUT_COLORS = {
    info: '#0070f3',
    warning: '#f59e0b',
    tip: '#10b981',
    note: '#6366f1',
};
function todayISO() {
    return new Date().toISOString().slice(0, 10);
}
function buildReportDocument(input) {
    const includeToc = input.include_toc !== false;
    const date = input.date ?? todayISO();
    const content = [
        // Cover block
        { type: 'spacer', height: 40 },
        {
            type: 'heading',
            level: 1,
            text: input.title,
            fontSize: 28,
            color: '#1a1a2e',
            align: 'center',
            spaceAfter: 10,
            bookmark: false,
        },
    ];
    if (input.subtitle) {
        content.push({
            type: 'paragraph',
            text: input.subtitle,
            fontSize: 14,
            color: '#555555',
            align: 'center',
            spaceAfter: 10,
        });
    }
    const metaParts = [];
    if (input.author)
        metaParts.push(input.author);
    metaParts.push(date);
    content.push({
        type: 'paragraph',
        text: metaParts.join('  ·  '),
        fontSize: 10,
        color: '#888888',
        align: 'center',
        spaceAfter: 6,
    });
    content.push({ type: 'hr', color: '#1a1a2e', thickness: 2, spaceBelow: 40 });
    // TOC
    if (includeToc) {
        content.push({
            type: 'toc',
            title: 'Contents',
            showTitle: true,
            leader: '.',
            minLevel: 1,
            maxLevel: 2,
            fontSize: 11,
            spaceAfter: 24,
        });
        content.push({ type: 'page-break' });
    }
    // Sections
    for (const section of input.sections) {
        content.push({
            type: 'heading',
            level: 1,
            text: section.heading,
            anchor: section.heading.toLowerCase().replace(/\s+/g, '-'),
            spaceAfter: 8,
        });
        // Body: split on double newlines for multiple paragraphs, single newlines become spaces
        const paragraphs = section.body.split(/\n\n+/);
        for (const para of paragraphs) {
            if (para.trim()) {
                content.push({
                    type: 'paragraph',
                    text: para.trim().replace(/\n/g, ' '),
                    spaceAfter: 8,
                });
            }
        }
        if (section.table) {
            const { headers, rows } = section.table;
            const fracColumns = headers.map(() => ({ width: '1*', align: 'left' }));
            const headerRow = {
                isHeader: true,
                cells: headers.map(h => ({ text: h, fontWeight: 700, color: '#ffffff' })),
            };
            const dataRows = rows.map(row => ({
                cells: row.map(cell => ({ text: cell })),
            }));
            content.push({
                type: 'table',
                columns: fracColumns,
                rows: [headerRow, ...dataRows],
                headerBgColor: '#1a1a2e',
                borderColor: '#dddddd',
                borderWidth: 0.5,
                cellPaddingH: 8,
                cellPaddingV: 6,
                spaceAfter: 12,
            });
        }
        if (section.callout) {
            const borderColor = CALLOUT_COLORS[section.callout.style] ?? '#888888';
            content.push({
                type: 'callout',
                style: section.callout.style,
                content: section.callout.text,
                borderColor,
                spaceAfter: 12,
            });
        }
    }
    return {
        pageSize: 'A4',
        margins: { top: 60, bottom: 60, left: 64, right: 64 },
        defaultFontSize: 11,
        bookmarks: { minLevel: 1, maxLevel: 3 },
        header: {
            text: input.title,
            fontSize: 8,
            color: '#999999',
            align: 'right',
        },
        footer: {
            text: 'Page {{pageNumber}} of {{totalPages}}',
            fontSize: 8,
            color: '#999999',
            align: 'center',
        },
        metadata: {
            title: input.title,
            author: input.author,
            subject: input.subtitle,
        },
        content,
    };
}
export const generateReportTool = {
    schema: {
        name: 'generate_report',
        description: 'Generate a professional multi-section report PDF. Features: auto-generated TOC, per-section headings with PDF bookmarks, page-numbered footer, running header, optional tables and callout boxes per section. Returns base64-encoded PDF.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Report title' },
                subtitle: { type: 'string', description: 'Report subtitle or description' },
                author: { type: 'string', description: 'Author name' },
                date: { type: 'string', description: 'Date string. Defaults to today.' },
                include_toc: {
                    type: 'boolean',
                    description: 'Include a Table of Contents page. Default: true',
                    default: true,
                },
                sections: {
                    type: 'array',
                    description: 'Report sections',
                    items: {
                        type: 'object',
                        properties: {
                            heading: { type: 'string', description: 'Section heading' },
                            body: {
                                type: 'string',
                                description: 'Section body text. Use double newlines (\\n\\n) to separate paragraphs.',
                            },
                            table: {
                                type: 'object',
                                description: 'Optional data table',
                                properties: {
                                    headers: { type: 'array', items: { type: 'string' } },
                                    rows: {
                                        type: 'array',
                                        items: { type: 'array', items: { type: 'string' } },
                                    },
                                },
                                required: ['headers', 'rows'],
                            },
                            callout: {
                                type: 'object',
                                description: 'Optional callout / alert box',
                                properties: {
                                    style: {
                                        type: 'string',
                                        enum: ['info', 'warning', 'tip', 'note'],
                                    },
                                    text: { type: 'string' },
                                },
                                required: ['style', 'text'],
                            },
                        },
                        required: ['heading', 'body'],
                    },
                },
                filename: { type: 'string', description: 'Suggested filename without .pdf extension.' },
            },
            required: ['title', 'sections'],
        },
    },
    handler: async (args) => {
        try {
            // Early guard: catch __proto__ / constructor / prototype pollution before
            // iterating section / table / callout field values below. The
            // constructed `doc` is built internally and cannot carry pollution from
            // args, but a polluted args object could crash field accessors mid-loop.
            // A second `runDocumentSafetyChecks(doc)` call later validates the
            // *built* doc as defence-in-depth against future builder drift.
            if (hasUnsafeKeys(args)) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Input contains unsafe keys (__proto__, constructor, prototype)' }) }],
                    isError: true,
                };
            }
            if (!args.title || typeof args.title !== 'string') {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'title is required' }) }],
                    isError: true,
                };
            }
            const sections = args.sections;
            if (!Array.isArray(sections) || sections.length === 0) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'sections must be a non-empty array' }) }],
                    isError: true,
                };
            }
            if (sections.length > MAX_REPORT_SECTIONS) {
                return { content: [{ type: 'text', text: `sections exceeds limit of ${MAX_REPORT_SECTIONS}` }], isError: true };
            }
            for (let i = 0; i < sections.length; i++) {
                const s = sections[i];
                if (!s || typeof s !== 'object') {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `sections[${i}] must be an object` }) }], isError: true };
                }
                if (typeof s.heading !== 'string' || s.heading.trim() === '') {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `sections[${i}].heading is required and must be a non-empty string` }) }], isError: true };
                }
                if (typeof s.body !== 'string') {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `sections[${i}].body is required and must be a string` }) }], isError: true };
                }
                if (s.table !== undefined) {
                    if (typeof s.table !== 'object' || Array.isArray(s.table)) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `sections[${i}].table must be an object` }) }], isError: true };
                    }
                    if (!Array.isArray(s.table.headers)) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `sections[${i}].table.headers must be an array of strings` }) }], isError: true };
                    }
                    if (!Array.isArray(s.table.rows) || !s.table.rows.every((r) => Array.isArray(r))) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `sections[${i}].table.rows must be an array of arrays` }) }], isError: true };
                    }
                }
                if (s.callout !== undefined) {
                    if (typeof s.callout !== 'object' || Array.isArray(s.callout)) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `sections[${i}].callout must be an object` }) }], isError: true };
                    }
                    if (typeof s.callout.text !== 'string' || s.callout.text.trim() === '') {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `sections[${i}].callout.text is required and must be a non-empty string` }) }], isError: true };
                    }
                    const VALID_CALLOUT_STYLES = ['info', 'warning', 'tip', 'note'];
                    if (s.callout.style !== undefined && !VALID_CALLOUT_STYLES.includes(s.callout.style)) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `sections[${i}].callout.style must be one of: info, warning, tip, note` }) }], isError: true };
                    }
                }
            }
            const input = args;
            const doc = buildReportDocument(input);
            // Defence-in-depth: validate the built doc structurally before render.
            const safetyError = runDocumentSafetyChecks(doc);
            if (safetyError)
                return safetyError;
            const bytes = await render(doc);
            assertOutputSize(bytes, 'generate_report');
            const base64 = toBase64(bytes);
            const filename = (args.filename || `report-${Date.now()}`) + '.pdf';
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
                process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', tool: 'generate_report', msg: message }) + '\n');
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
