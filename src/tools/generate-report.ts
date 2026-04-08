import { render } from 'pretext-pdf'
import { toBase64 } from '../utils/base64.js'

interface ReportSection {
  heading: string
  body: string
  table?: { headers: string[]; rows: string[][] }
  callout?: { style: 'info' | 'warning' | 'tip' | 'note'; text: string }
}

interface ReportInput {
  title: string
  subtitle?: string
  author?: string
  date?: string
  include_toc?: boolean
  sections: ReportSection[]
}

const CALLOUT_COLORS: Record<string, string> = {
  info: '#0070f3',
  warning: '#f59e0b',
  tip: '#10b981',
  note: '#6366f1',
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildReportDocument(input: ReportInput): any {
  const includeToc = input.include_toc !== false
  const date = input.date ?? todayISO()

  const content: any[] = [
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
  ]

  if (input.subtitle) {
    content.push({
      type: 'paragraph',
      text: input.subtitle,
      fontSize: 14,
      color: '#555555',
      align: 'center',
      spaceAfter: 10,
    })
  }

  const metaParts: string[] = []
  if (input.author) metaParts.push(input.author)
  metaParts.push(date)
  content.push({
    type: 'paragraph',
    text: metaParts.join('  ·  '),
    fontSize: 10,
    color: '#888888',
    align: 'center',
    spaceAfter: 6,
  })

  content.push({ type: 'hr', color: '#1a1a2e', thickness: 2, spaceBelow: 40 })

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
    })
    content.push({ type: 'page-break' })
  }

  // Sections
  for (const section of input.sections) {
    content.push({
      type: 'heading',
      level: 1,
      text: section.heading,
      anchor: section.heading.toLowerCase().replace(/\s+/g, '-'),
      spaceAfter: 8,
    })

    // Body: split on double newlines for multiple paragraphs, single newlines become spaces
    const paragraphs = section.body.split(/\n\n+/)
    for (const para of paragraphs) {
      if (para.trim()) {
        content.push({
          type: 'paragraph',
          text: para.trim().replace(/\n/g, ' '),
          spaceAfter: 8,
        })
      }
    }

    if (section.table) {
      const { headers, rows } = section.table
      const columns = headers.map(() => ({ width: `${Math.floor(100 / headers.length)}%` as any }))
      // Use equal fractional widths
      const fracColumns = headers.map(() => ({ width: '1*' as any, align: 'left' as const }))

      const headerRow = {
        isHeader: true,
        cells: headers.map(h => ({ text: h, fontWeight: 700, color: '#ffffff' })),
      }
      const dataRows = rows.map(row => ({
        cells: row.map(cell => ({ text: cell })),
      }))

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
      })
      // Suppress unused variable warning
      void columns
    }

    if (section.callout) {
      const borderColor = CALLOUT_COLORS[section.callout.style] ?? '#888888'
      content.push({
        type: 'callout',
        style: section.callout.style,
        content: section.callout.text,
        borderColor,
        spaceAfter: 12,
      })
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
  }
}

export const generateReportTool = {
  schema: {
    name: 'generate_report',
    description:
      'Generate a professional multi-section report PDF with optional TOC, tables, and callout boxes. Returns base64-encoded PDF.',
    inputSchema: {
      type: 'object' as const,
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
                description:
                  'Section body text. Use double newlines (\\n\\n) to separate paragraphs.',
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

  handler: async (args: Record<string, unknown>) => {
    try {
      if (!args.title || typeof args.title !== 'string') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'title is required' }) }],
          isError: true,
        }
      }
      const sections = args.sections as any[]
      if (!Array.isArray(sections) || sections.length === 0) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'sections must be a non-empty array' }) }],
          isError: true,
        }
      }

      const input = args as unknown as ReportInput
      const doc = buildReportDocument(input)
      const bytes = await render(doc)
      const base64 = toBase64(bytes)
      const filename = (args.filename as string ?? `report-${Date.now()}`) + '.pdf'
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
