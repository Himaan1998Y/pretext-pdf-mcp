import { validate } from 'pretext-pdf';
export const validateDocumentTool = {
    schema: {
        name: 'validate_document',
        description: 'Validate a pretext-pdf document schema without rendering it. Returns immediately with all validation errors — use this as a cheap preflight check before calling generate_pdf.',
        inputSchema: {
            type: 'object',
            properties: {
                document: {
                    type: 'object',
                    description: 'The pretext-pdf document to validate (same shape as generate_pdf.document)',
                },
                strict: {
                    type: 'boolean',
                    description: 'When true, also report unknown/misspelled properties (default: true)',
                },
            },
            required: ['document'],
        },
    },
    async handler(args) {
        const doc = args.document;
        const strict = args.strict ?? true;
        if (doc === null || doc === undefined || typeof doc !== 'object' || Array.isArray(doc)) {
            return {
                content: [{ type: 'text', text: JSON.stringify({ valid: false, error_count: 1, message: 'document must be a non-null object' }) }],
                isError: true,
            };
        }
        try {
            validate(doc, { strict });
            return {
                content: [{ type: 'text', text: JSON.stringify({ valid: true, error_count: 0 }) }],
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const lineCount = message.split('\n').filter(Boolean).length;
            return {
                content: [{ type: 'text', text: JSON.stringify({ valid: false, error_count: lineCount, message }) }],
                isError: true,
            };
        }
    },
};
