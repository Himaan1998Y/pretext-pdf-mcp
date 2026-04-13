#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { PretextPdfError } from 'pretext-pdf'
import { generatePdfTool } from './tools/generate-pdf.js'
import { generateInvoiceTool } from './tools/generate-invoice.js'
import { generateReportTool } from './tools/generate-report.js'
import { listElementsTool } from './tools/list-elements.js'

// ─── Input Validation ─────────────────────────────────────────────────────────
/**
 * Validate that body.data is a plain object (minimal type guard).
 * Prevents obvious type errors before calling render().
 */
function validatePdfDocumentInput(data: unknown): asserts data is Record<string, unknown> {
  if (data === null || data === undefined) {
    throw new PretextPdfError(
      'VALIDATION_ERROR',
      'Request body.data is required and cannot be null or undefined'
    )
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new PretextPdfError(
      'VALIDATION_ERROR',
      `Request body.data must be an object, received ${typeof data}`
    )
  }
}

/**
 * Categorize pretext-pdf errors for HTTP status code determination.
 * Returns true if error is a client error (400), false if server error (500).
 */
function isClientError(err: unknown): boolean {
  if (!(err instanceof PretextPdfError)) return true // Unknown errors → client error by default
  const clientErrors = [
    'VALIDATION_ERROR',
    'IMAGE_LOAD_FAILED',
    'IMAGE_FORMAT_MISMATCH',
    'SVG_LOAD_FAILED',
    'PAGE_TOO_SMALL',
    'FONT_NOT_LOADED',
    'FONT_LOAD_FAILED',
    'MONOSPACE_FONT_REQUIRED',
    'ENCRYPTION_NOT_AVAILABLE',
  ]
  return clientErrors.includes(err.code)
}

function createServer() {
  const server = new Server(
    { name: 'pretext-pdf', version: '1.0.7' },
    { capabilities: { tools: {} } }
  )

  const tools = [generatePdfTool, generateInvoiceTool, generateReportTool, listElementsTool]

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => t.schema),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.schema.name === request.params.name)
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      }
    }
    return tool.handler(request.params.arguments ?? {})
  })

  return server
}

function setCorsHeaders(res: import('node:http').ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : null

if (port) {
  const { createServer: createHttpServer } = await import('node:http')
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')
  const { render } = await import('pretext-pdf')

  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    setCorsHeaders(res)

    // Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'pretext-pdf-mcp' }))
      return
    }

    // REST API — POST /api/generate → returns PDF bytes
    // Limit: 500 KB — accommodates PDFs with images, rich formatting, and new features (v0.5.1+)
    // Validation: body.data must be a PdfDocument object before calling render()
    if (url.pathname === '/api/generate' && req.method === 'POST') {
      const MAX_BODY = 500_000 // 500 KB — same as MCP endpoint, supports full feature set
      const chunks: Buffer[] = []
      let totalSize = 0
      for await (const chunk of req) {
        totalSize += (chunk as Buffer).length
        if (totalSize > MAX_BODY) {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request too large (max 500 KB)' }))
          return
        }
        chunks.push(chunk as Buffer)
      }

      let body: { data?: unknown }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString())
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }

      try {
        // Validate input before calling render()
        validatePdfDocumentInput(body.data)
        const pdf = await render(body.data as unknown as Parameters<typeof render>[0])
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="output.pdf"',
          'Content-Length': pdf.byteLength,
        })
        res.end(Buffer.from(pdf))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        const isClient = isClientError(err)
        const statusCode = isClient ? 400 : 500
        const errorCode = err instanceof PretextPdfError ? err.code : 'UNKNOWN_ERROR'
        res.writeHead(statusCode, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: msg, code: errorCode }))
      }
      return
    }

    // MCP endpoint — POST /mcp (stateless, structured protocol)
    // Limit: 500 KB — same as REST API, accommodates full feature set (images, rich formatting, etc.)
    // Note: MCP protocol adds overhead (jsonrpc wrapper), so same limit across endpoints
    if (url.pathname === '/mcp' && req.method === 'POST') {
      const MAX_MCP_BODY = 500_000 // 500 KB — consistent with /api/generate
      const chunks: Buffer[] = []
      let mcpSize = 0
      for await (const chunk of req) {
        mcpSize += (chunk as Buffer).length
        if (mcpSize > MAX_MCP_BODY) {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request too large (max 500 KB)' }))
          return
        }
        chunks.push(chunk as Buffer)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString())

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
      const server = createServer()
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
      return
    }

    res.writeHead(404)
    res.end()
  })

  httpServer.listen(port, () => {
    process.stderr.write(`pretext-pdf-mcp HTTP server listening on port ${port}\n`)
  })
} else {
  // Stdio mode — for local npx usage (Claude Desktop, Cursor, etc.)
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
