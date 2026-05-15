import { render } from 'pretext-pdf'
import { toBase64 } from '../utils/base64.js'
import { runDocumentSafetyChecks } from '../utils/safety.js'

export const generatePdfTool = {
  schema: {
    name: 'generate_pdf',
    description:
      'Generate a PDF from a custom PdfDocument JSON descriptor. Use this for any layout not covered by generate_invoice or generate_report — e.g. resumes, contracts, certificates, presentations, or any multi-element composition. Returns base64-encoded PDF bytes. Call list_element_types first to see available elements and options.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document: {
          type: 'object',
          description:
            'A PdfDocument config object with content array and optional pageSize, margins, fonts, header, footer, watermark, encryption, etc.',
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

  handler: async (args: Record<string, unknown>) => {
    try {
      if (!args.document || typeof args.document !== 'object' || Array.isArray(args.document)) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'document is required and must be an object' }) }],
          isError: true,
        }
      }

      // Defence-in-depth: prototype-pollution guard + schema validation.
      // Shared with generate_invoice, generate_report, and generate_from_markdown.
      const safetyError = runDocumentSafetyChecks(args.document)
      if (safetyError) return safetyError

      const doc = args.document as Record<string, unknown>

      // Safe cast to PdfDocument: runDocumentSafetyChecks proved doc conforms structurally
      const bytes = await render(doc as unknown as Parameters<typeof render>[0])
      const base64 = toBase64(bytes)
      const filename = ((args.filename as string) || 'document') + '.pdf'
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
        process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', tool: 'generate_pdf', msg: message }) + '\n')
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
