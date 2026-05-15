import { render, type PdfDocument } from 'pretext-pdf'
import { markdownToContent } from 'pretext-pdf/markdown'
import { toBase64 } from '../utils/base64.js'
import { runDocumentSafetyChecks } from '../utils/safety.js'

export const generateFromMarkdownTool = {
  schema: {
    name: 'generate_from_markdown',
    description:
      'Convert a Markdown string to a PDF. Supports headings, bold/italic, strikethrough, inline code, links, ordered/unordered lists (nested up to 3 levels), GFM tables (with column alignment), GFM task lists (☑/☐), blockquotes, fenced code blocks (rendered as plain indented text — not styled monospace), and horizontal rules. For richer layouts or styled code blocks, use generate_pdf instead. Returns a base64-encoded PDF.',
    inputSchema: {
      type: 'object' as const,
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
          enum: ['A4', 'Letter', 'Legal', 'A3', 'A5', 'Tabloid'],
          description: 'Page size. Default: A4. Matches the NamedPageSize union exported by pretext-pdf.',
        },
        font_size: {
          type: 'number',
          description: 'Body font size in pt. Default: 12',
        },
      },
      required: ['markdown'],
    },
  },

  handler: async (args: Record<string, unknown>) => {
    try {
      const markdown = args.markdown as string
      if (typeof markdown !== 'string' || markdown.trim() === '') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'markdown is required and must be a non-empty string' }) }],
          isError: true,
        }
      }
      if (markdown.length > 100_000) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'markdown must be 100,000 characters or fewer' }) }],
          isError: true,
        }
      }

      const VALID_PAGE_SIZES: readonly string[] = ['A4', 'Letter', 'Legal', 'A3', 'A5', 'Tabloid']
      if (args.page_size !== undefined && !VALID_PAGE_SIZES.includes(String(args.page_size))) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `page_size must be one of: ${VALID_PAGE_SIZES.join(', ')}. Received: "${String(args.page_size)}"` }) }],
          isError: true,
        }
      }

      if (typeof args.font_size === 'number' && (args.font_size < 6 || args.font_size > 144)) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'font_size must be between 6 and 144' }) }],
          isError: true,
        }
      }

      const content = await markdownToContent(markdown)
      const pageSizeArg = (args.page_size as string | undefined) ?? 'A4'
      const doc: PdfDocument = {
        pageSize: pageSizeArg as PdfDocument['pageSize'],
        defaultFontSize: typeof args.font_size === 'number' ? args.font_size : 12,
        content,
      }

      // Defence-in-depth: validate the built doc structurally before render.
      // Markdown can't introduce __proto__ keys, but content shape drift in
      // the markdown parser would otherwise surface mid-render.
      const safetyError = runDocumentSafetyChecks(doc)
      if (safetyError) return safetyError

      const bytes = await render(doc)
      const base64 = toBase64(bytes)
      const filename = ((args.filename as string | undefined) ?? 'document') + '.pdf'
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
        process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', tool: 'generate_from_markdown', msg: message }) + '\n')
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
