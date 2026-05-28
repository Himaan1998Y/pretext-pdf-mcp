#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js'
import { PretextPdfError, validate } from 'pretext-pdf'
import { checkJsonDepth, assertOutputSize } from './utils/limits.js'
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

// ─── Concurrency limit ────────────────────────────────────────────────────────
// Bounds the number of in-flight render operations to prevent OOM / event-loop
// starvation under burst load. Render is CPU-heavy and synchronous in places,
// so an unbounded queue can wedge the server. Configurable via
// MCP_MAX_CONCURRENT_RENDERS (preferred) or the legacy MCP_MAX_CONCURRENT alias.
function parseConcurrencyEnv(): number {
  const raw = process.env.MCP_MAX_CONCURRENT_RENDERS ?? process.env.MCP_MAX_CONCURRENT
  const parsed = raw === undefined ? NaN : parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8
}
const MAX_CONCURRENT_RENDERS = parseConcurrencyEnv()
let activeRenders = 0

// ─── Auth helpers ─────────────────────────────────────────────────────────────
/**
 * Constant-time bearer-token check. Returns true when the request is authorized,
 * false when MCP_API_KEY is set and the request does not match. When MCP_API_KEY
 * is unset, all requests are allowed (this is the default localhost-only mode).
 */
function isAuthorized(req: import('node:http').IncomingMessage): boolean {
  const expectedKey = process.env.MCP_API_KEY
  if (!expectedKey) return true
  const auth = req.headers.authorization ?? ''
  const expected = `Bearer ${expectedKey}`
  const authBuf = Buffer.from(auth)
  const expectedBuf = Buffer.from(expected)
  if (authBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(authBuf, expectedBuf)
}

function sendUnauthorized(res: import('node:http').ServerResponse): void {
  res.writeHead(401, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Unauthorized' }))
}

function sendBusy(res: import('node:http').ServerResponse): void {
  // 503 + Retry-After signals transient overload (queue saturated), distinct
  // from 429 (per-client rate limit). Clients with retry/backoff respect both,
  // but 503 better matches the semantics of a global concurrency cap.
  res.writeHead(503, {
    'Content-Type': 'application/json',
    'Retry-After': '5',
  })
  res.end(JSON.stringify({ error: 'Server busy, retry shortly', code: 'RATE_LIMITED' }))
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
// Categories where every code in the group maps to HTTP 400.
// Derived from PretextPdfError.category — no need to enumerate individual codes.
const CLIENT_ERROR_CATEGORIES = new Set<string>(['validation', 'security', 'dependency', 'image', 'layout'])
// Codes whose category is 'font' or 'render' but are still caller-caused (bad config/input).
const ADDITIONAL_CLIENT_CODES = new Set<string>([
  'FONT_NOT_LOADED', 'FONT_LOAD_FAILED', 'ITALIC_FONT_NOT_LOADED', 'MONOSPACE_FONT_REQUIRED',
  'BARCODE_SYMBOLOGY_INVALID', 'CHART_SPEC_INVALID', 'CHART_LOAD_FAILED', 'RTL_REORDER_FAILED',
  'FORM_FIELD_NAME_DUPLICATE',
  'FOOTNOTE_REF_ORPHANED', 'FOOTNOTE_DEF_ORPHANED', 'FOOTNOTE_DEF_DUPLICATE',
  'SIGNATURE_P12_LOAD_FAILED',
])
function isClientError(err: unknown): boolean {
  if (!(err instanceof PretextPdfError)) return false
  // category is present in pretext-pdf v2.0.1+; cast for backward compat with older installs
  const category: string | undefined = (err as unknown as { category?: string }).category
  return (category !== undefined && CLIENT_ERROR_CATEGORIES.has(category)) || ADDITIONAL_CLIENT_CODES.has(err.code)
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
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`)
    }
    try {
      return await tool.handler(request.params.arguments ?? {})
    } catch (err: unknown) {
      // Only PretextPdfError messages are intentional user-facing strings.
      // Unknown errors may contain stack traces, OS paths, or internal details — sanitize them.
      const safeMessage = err instanceof PretextPdfError ? err.message : 'Internal server error'
      const errorCode = err instanceof PretextPdfError ? err.code : 'INTERNAL_ERROR'
      if (!(err instanceof PretextPdfError)) {
        const raw = err instanceof Error ? err.message : String(err)
        log('error', 'unhandled tool error', { tool: request.params.name, msg: raw })
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: errorCode, message: safeMessage }) }],
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

    // Health check — intentionally not behind auth so probes/load balancers
    // can verify liveness without sharing the API key.
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'pretext-pdf-mcp' }))
      return
    }

    // Bearer-token check for any authenticated endpoint. When MCP_API_KEY is
    // unset the check is a no-op — see startup guard for the public-bind requirement.
    if (!isAuthorized(req)) {
      log('warn', 'unauthorized request', {
        path: url.pathname,
        ip: req.socket.remoteAddress ?? 'unknown',
      })
      sendUnauthorized(res)
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
        const raw = Buffer.concat(chunks).toString()
        checkJsonDepth(raw)
        body = JSON.parse(raw)
      } catch {
        log('warn', 'invalid json body', { endpoint: '/api/generate' })
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }

      // Concurrency guard — cap in-flight renders to protect the event loop.
      if (activeRenders >= MAX_CONCURRENT_RENDERS) {
        log('warn', 'render concurrency limit reached', { endpoint: '/api/generate', active: activeRenders, max: MAX_CONCURRENT_RENDERS })
        sendBusy(res)
        return
      }
      activeRenders++
      try {
        // Null/type guard: ensure body.data is an object before schema validation
        validatePdfDocumentInput(body.data)
        // Schema validation: catches all element-level errors before the render pipeline starts
        validate(body.data as unknown as PdfDocument)
        const pdf = await render(body.data as unknown as Parameters<typeof render>[0])
        assertOutputSize(pdf, 'generate_pdf')
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
        log(isClient ? 'warn' : 'error', 'pdf generation failed', { endpoint: '/api/generate', code: errorCode, statusCode, message: msg })
        // Only PretextPdfError messages are intentional user-facing strings.
        // Unknown errors may leak stack traces, file paths, or other internals — sanitize them.
        const safeMessage = err instanceof PretextPdfError ? err.message : 'Internal server error'
        res.writeHead(statusCode, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: safeMessage, code: errorCode }))
      } finally {
        activeRenders--
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
        const raw = Buffer.concat(chunks).toString()
        checkJsonDepth(raw)
        body = JSON.parse(raw)
      } catch {
        log('warn', 'invalid json body', { endpoint: '/mcp' })
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }

      // Concurrency guard — MCP tool calls can invoke render(), so we cap them
      // by the same global counter used for /api/generate.
      if (activeRenders >= MAX_CONCURRENT_RENDERS) {
        log('warn', 'render concurrency limit reached', { endpoint: '/mcp', active: activeRenders, max: MAX_CONCURRENT_RENDERS })
        sendBusy(res)
        return
      }
      activeRenders++
      try {
        log('info', 'mcp request received', { endpoint: '/mcp', size_bytes: mcpSize })
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        })
        const server = createServer()
        await server.connect(transport)
        await transport.handleRequest(req, res, body)
      } finally {
        activeRenders--
      }
      return
    }

    // Known paths only accept POST — return 405 instead of 404 for wrong-method requests
    if ((url.pathname === '/api/generate' || url.pathname === '/mcp') && req.method !== 'POST' && req.method !== 'OPTIONS') {
      res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'POST, OPTIONS' })
      res.end(JSON.stringify({ error: 'Method Not Allowed' }))
      return
    }

    res.writeHead(404)
    res.end()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      log('error', 'unhandled http handler error', { msg })
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        // Do not leak err.message to the client — keep details in stderr only.
        res.end(JSON.stringify({ error: 'Internal server error' }))
      }
    }
  })

  const host = process.env.MCP_HOST ?? '127.0.0.1'
  // Public-bind guard — refuse to start on a non-loopback interface without
  // an API key configured. Prevents accidental exposure of an unauthenticated
  // PDF render endpoint when MCP_HOST is set to a wildcard (0.0.0.0, ::, ::0)
  // or a LAN address. Loopback hosts are the only "private" set; everything
  // else — including all IPv6 wildcard notations — is treated as public.
  const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
  const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '::0', '0:0:0:0:0:0:0:0'])
  const isWildcardBind = WILDCARD_HOSTS.has(host)
  const isPublicBind = !LOOPBACK_HOSTS.has(host)
  if (isPublicBind && !process.env.MCP_API_KEY) {
    process.stderr.write('[FATAL] MCP_HOST is set to a public address but MCP_API_KEY is not configured.\n')
    process.stderr.write('[FATAL] Refusing to start without authentication on a public binding.\n')
    process.stderr.write('[FATAL] Set MCP_API_KEY env var or bind to 127.0.0.1.\n')
    process.exit(1)
  }
  httpServer.listen(port, host, () => {
    process.stderr.write(`pretext-pdf-mcp HTTP server listening on ${host}:${port}\n`)
    if (isWildcardBind) {
      process.stderr.write(`[WARN] Wildcard bind detected (host=${host}). Server is reachable on every network interface.\n`)
    }
    if (isPublicBind && !process.env.MCP_BEHIND_PROXY) {
      process.stderr.write('[WARN] Server is bound to a public interface without MCP_BEHIND_PROXY set. HTTPS is strongly recommended for public deployments.\n')
    }
  })
} else {
  // Stdio mode — for local npx usage (Claude Desktop, Cursor, etc.)
  process.stderr.write(`pretext-pdf-mcp v${SERVER_VERSION} ready (stdio). Waiting for MCP client connection.\n`)
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
