import { validateDocument } from 'pretext-pdf';
export const validateDocumentTool = {
    schema: {
        name: 'validate_document',
        description: 'Validate a pretext-pdf document schema without rendering it. Returns immediately with all validation errors — use this as a cheap preflight check before calling generate_pdf. Each error includes a structured path, message, and optional typo suggestion.',
        inputSchema: {
            type: 'object',
            properties: {
                document: {
                    type: 'object',
                    description: 'The pretext-pdf document to validate (same shape as generate_pdf.document)',
                },
                strict: {
                    type: 'boolean',
                    description: 'When true, also report unknown/misspelled properties (default: false)',
                },
            },
            required: ['document'],
        },
    },
    async handler(args) {
        const doc = args.document;
        const strict = args.strict ?? false;
        if (doc === null || doc === undefined || typeof doc !== 'object' || Array.isArray(doc)) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            valid: false,
                            error_count: 1,
                            warning_count: 0,
                            errors: [{
                                    path: 'document',
                                    message: 'document must be a non-null object',
                                    severity: 'error',
                                    code: 'INVALID_INPUT',
                                }],
                            warnings: [],
                        }),
                    },
                ],
            };
        }
        const result = validateDocument(doc, { strict });
        if (result.valid) {
            return {
                content: [{ type: 'text', text: JSON.stringify({ valid: true, error_count: 0, warning_count: 0, errors: [], warnings: [] }) }],
            };
        }
        const warnings = result.errors.filter((e) => e.severity === 'warning');
        const errors = result.errors.filter((e) => e.severity !== 'warning');
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        valid: false,
                        error_count: errors.length,
                        warning_count: warnings.length,
                        errors,
                        warnings,
                    }),
                },
            ],
        };
    },
};
