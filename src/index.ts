#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { PretextPdfError, validate } from 'pretext-pdf'
import type { PdfDocument } from 'pretext-pdf'
import { generatePdfTool } from './tools/generate-pdf.js'
import { generateInvoiceTool } from './tools/generate-invoice.js'
import { generateReportTool } from './tools/generate-report.js'
import { generateFromMarkdownTool } from './tools/generate-from-markdown.js'
import { listElementsTool } from './tools/list-elements.js'
import { validateDocumentTool } from './tools/validate-document.js'

// Read version from package.json so the server identity tracks the release —
// hardcoding a version string here was the drift bug that left /mcp announcing
// 1.1.2 while package.json said 1.2.0. Root fix: single source of truth.
const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
const SERVER_VERSION = pkg.version

// ─── Structured logging ───────────────────────────────────────────────────────
function log(level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) {
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }) + '\n')
}

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
  if (!(err instanceof PretextPdfError)) return false // Unknown errors → server error (500)
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
    { name: 'pretext-pdf', version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  )

  const tools = [generatePdfTool, generateInvoiceTool, generateReportTool, generateFromMarkdownTool, listElementsTool, validateDocumentTool]

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => t.schema),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.schema.name === request.params.name)
    if (!tool) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'UNKNOWN_TOOL', message: `Unknown tool: ${request.params.name}` }) }],
        isError: true,
      }
    }
    try {
      return await tool.handler(request.params.arguments ?? {})
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: msg }) }],
        isError: true,
      }
    }
  })

  return server
}

function setCorsHeaders(res: import('node:http').ServerResponse, requestOrigin?: string) {
  const allowed = process.env.ALLOWED_ORIGINS
  if (allowed && allowed !== '*') {
    // Restrict to explicit whitelist (comma-separated)
    const origins = allowed.split(',').map(o => o.trim())
    if (requestOrigin && origins.includes(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin)
    }
    res.setHeader('Vary', 'Origin')
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const rawPort = process.env.MCP_PORT ?? process.env.PORT
const port = rawPort ? parseInt(rawPort, 10) : null
if (port !== null && isNaN(port)) {
  process.stderr.write(`[pretext-pdf-mcp] Error: MCP_PORT="${rawPort}" is not a valid port number\n`)
  process.exit(1)
}

if (port) {
  const { createServer: createHttpServer } = await import('node:http')
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')
  const { render } = await import('pretext-pdf')

  const httpServer = createHttpServer(async (req, res) => {
    try {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    setCorsHeaders(res, req.headers['origin'] as string | undefined)

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
          log('warn', 'request too large', { endpoint: '/api/generate', size_bytes: totalSize })
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
        log('warn', 'invalid json body', { endpoint: '/api/generate' })
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }

      try {
        // Null/type guard: ensure body.data is an object before schema validation
        validatePdfDocumentInput(body.data)
        // Schema validation: catches all element-level errors before the render pipeline starts
        validate(body.data as unknown as PdfDocument)
        const pdf = await render(body.data as unknown as Parameters<typeof render>[0])
        log('info', 'pdf generated', { endpoint: '/api/generate', size_bytes: pdf.byteLength })
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
        log(isClient ? 'warn' : 'error', 'pdf generation failed', { endpoint: '/api/generate', code: errorCode, statusCode })
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
          log('warn', 'request too large', { endpoint: '/mcp', size_bytes: mcpSize })
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request too large (max 500 KB)' }))
          return
        }
        chunks.push(chunk as Buffer)
      }
      let body: unknown
      try {
        body = JSON.parse(Buffer.concat(chunks).toString())
      } catch {
        log('warn', 'invalid json body', { endpoint: '/mcp' })
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }

      log('info', 'mcp request received', { endpoint: '/mcp', size_bytes: mcpSize })
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      log('error', 'unhandled http handler error', { msg })
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal server error', message: msg }))
      }
    }
  })

  const host = process.env.MCP_HOST ?? '127.0.0.1'
  httpServer.listen(port, host, () => {
    process.stderr.write(`pretext-pdf-mcp HTTP server listening on ${host}:${port}\n`)
  })
} else {
  // Stdio mode — for local npx usage (Claude Desktop, Cursor, etc.)
  process.stderr.write(`pretext-pdf-mcp v${SERVER_VERSION} ready (stdio). Waiting for MCP client connection.\n`)
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
