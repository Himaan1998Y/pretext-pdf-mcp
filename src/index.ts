#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { generatePdfTool } from './tools/generate-pdf.js'
import { generateInvoiceTool } from './tools/generate-invoice.js'
import { generateReportTool } from './tools/generate-report.js'
import { listElementsTool } from './tools/list-elements.js'

function createServer() {
  const server = new Server(
    { name: 'pretext-pdf', version: '1.0.0' },
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

    // REST demo API — POST /api/generate → returns PDF bytes
    if (url.pathname === '/api/generate' && req.method === 'POST') {
      const MAX_BODY = 100_000
      const chunks: Buffer[] = []
      let totalSize = 0
      for await (const chunk of req) {
        totalSize += (chunk as Buffer).length
        if (totalSize > MAX_BODY) {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request too large' }))
          return
        }
        chunks.push(chunk as Buffer)
      }

      let body: { data?: unknown }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString())
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
        return
      }

      try {
        const pdf = await render(body.data as Parameters<typeof render>[0])
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="output.pdf"',
          'Content-Length': pdf.byteLength,
        })
        res.end(Buffer.from(pdf))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: msg }))
      }
      return
    }

    // MCP endpoint — POST /mcp (stateless)
    if (url.pathname === '/mcp' && req.method === 'POST') {
      const MAX_MCP_BODY = 500_000
      const chunks: Buffer[] = []
      let mcpSize = 0
      for await (const chunk of req) {
        mcpSize += (chunk as Buffer).length
        if (mcpSize > MAX_MCP_BODY) {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request too large' }))
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
