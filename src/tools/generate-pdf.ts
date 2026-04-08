import { render } from 'pretext-pdf'
import { toBase64 } from '../utils/base64.js'

export const generatePdfTool = {
  schema: {
    name: 'generate_pdf',
    description:
      'Generate a PDF from a pretext-pdf document descriptor (PdfDocument JSON). Returns base64-encoded PDF bytes. Use list_element_types to see available elements.',
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
      if (!args.document || typeof args.document !== 'object') {
        return {
          content: [{ type: 'text', text: 'Error: document is required and must be an object' }],
          isError: true,
        }
      }
      const bytes = await render(args.document as any)
      const base64 = toBase64(bytes)
      const filename = (args.filename as string ?? 'document') + '.pdf'
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, base64, filename, size_bytes: bytes.length }),
          },
        ],
      }
    } catch (err: any) {
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
      }
    }
  },
}
