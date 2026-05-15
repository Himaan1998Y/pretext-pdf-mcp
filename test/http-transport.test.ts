/**
 * HTTP transport test suite for pretext-pdf-mcp.
 *
 * Tests the HTTP server mode activated when MCP_PORT is set. Covers:
 * - Bind regression lock-in (Phase 0 fix)
 * - All HTTP endpoints: OPTIONS, GET /health, POST /api/generate, POST /mcp, 404
 * - MCP JSON-RPC over HTTP (SSE response format from StreamableHTTPServerTransport)
 * - SIGTERM shutdown
 *
 * Requires built dist/ — run `npm run build` before this test.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import { request as httpRequest, IncomingHttpHeaders } from 'node:http'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_PATH = resolve(__dirname, '..', 'dist', 'index.js')

// ─── Subprocess helpers ───────────────────────────────────────────────────────

/**
 * Allocate a random port in a wide range to minimize collision probability.
 * Tests are isolated — each describe block uses its own port.
 */
function randomPort(): number {
  return 30000 + Math.floor(Math.random() * 10000)
}

interface SpawnedServer {
  proc: ChildProcessWithoutNullStreams
  port: number
  bindLog: string
}

async function spawnHttpServer(env: Record<string, string> = {}): Promise<SpawnedServer> {
  const port = randomPort()
  const proc = spawn(process.execPath, [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MCP_PORT: String(port), ...env },
  })

  // Accumulate all stderr output so split-chunk delivery on Windows is handled correctly.
  const bindLog = await new Promise<string>((resolve, reject) => {
    let accumulated = ''
    let settled = false

    const settle = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
    }

    // 15s startup timeout — Windows cold-disk module load can be slow
    const timer = setTimeout(
      () => settle(new Error(`Server did not emit "listening on" within 15 seconds. Stderr so far: ${accumulated.substring(0, 300)}`)),
      15000
    )

    proc.stderr.on('data', (chunk: Buffer) => {
      accumulated += chunk.toString()
      const matchLine = accumulated.split('\n').find((l) => l.includes('listening on'))
      if (matchLine) {
        settled = true
        clearTimeout(timer)
        resolve(matchLine.trim())
      }
    })
    proc.on('error', (err) => settle(err))
    proc.on('exit', (code) => {
      if (!settled) {
        settle(new Error(`Server process exited with code ${code} before emitting ready. Stderr: ${accumulated.substring(0, 300)}`))
      }
    })
  })

  return { proc, port, bindLog }
}

function killProc(proc: ChildProcessWithoutNullStreams): void {
  try {
    proc.kill('SIGKILL')
  } catch {
    // already dead
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

interface HttpResponse {
  status: number
  headers: IncomingHttpHeaders
  body: Buffer
}

function httpGet(port: number, path: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) })
        )
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function httpOptions(port: number, path: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method: 'OPTIONS' },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) })
        )
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function httpPost(
  port: number,
  path: string,
  body: string | Buffer,
  extraHeaders: Record<string, string> = {}
): Promise<HttpResponse> {
  const bodyBuf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.length,
          ...extraHeaders,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) })
        )
      }
    )
    req.on('error', reject)
    req.write(bodyBuf)
    req.end()
  })
}

/**
 * Parse a response that may be either:
 *   - Plain JSON: `{"jsonrpc":"2.0",...}`
 *   - SSE stream: lines of the form `data: <json>\n` followed by `\n`
 *
 * Returns the first parsed JSON object found in either format.
 */
function parseJsonOrSse(body: Buffer): Record<string, unknown> {
  const text = body.toString('utf8')

  // Try plain JSON first
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as Record<string, unknown>
  }

  // SSE format: find lines starting with "data: "
  const lines = text.split('\n')
  for (const line of lines) {
    const dataLine = line.trim()
    if (dataLine.startsWith('data: ')) {
      const jsonStr = dataLine.slice('data: '.length).trim()
      if (jsonStr.length > 0 && (jsonStr.startsWith('{') || jsonStr.startsWith('['))) {
        return JSON.parse(jsonStr) as Record<string, unknown>
      }
    }
  }

  throw new Error(`Could not parse response as JSON or SSE.\nBody:\n${text.substring(0, 500)}`)
}

/**
 * Send a JSON-RPC message to POST /mcp and return the parsed JSON-RPC response.
 * The MCP StreamableHTTP transport requires specific Accept + Content-Type headers.
 * Responses arrive as SSE (text/event-stream) by default.
 *
 * For stateless mode, tools/list can be called without a prior initialize.
 * The MCP-Protocol-Version header is optional for stateless transports (defaults internally).
 */
async function mcpPost(
  port: number,
  message: object,
  extraHeaders: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const body = JSON.stringify(message)
  const res = await httpPost(port, '/mcp', body, {
    Accept: 'application/json, text/event-stream',
    ...extraHeaders,
  })
  return parseJsonOrSse(res.body)
}

// ─── Test blocks ──────────────────────────────────────────────────────────────

describe('bind regression — Phase 0 lock-in', () => {
  it('binds 127.0.0.1 by default — stderr log shows host=127.0.0.1:<port>', async () => {
    const { proc, port, bindLog } = await spawnHttpServer()
    // Phase 0 fix: default host must be 127.0.0.1, not 0.0.0.0.
    // Pinning to the exact "host:port" format prevents a false green from log noise that
    // happens to contain the substring "127.0.0.1" elsewhere (e.g. in a banner or unrelated log).
    assert.match(
      bindLog,
      new RegExp(`listening on 127\\.0\\.0\\.1:${port}\\b`),
      `Expected "listening on 127.0.0.1:${port}" in bind log, got: "${bindLog}"`
    )
    killProc(proc)
  })

  it('MCP_HOST=0.0.0.0 enables all-interface binding — stderr log shows host=0.0.0.0:<port>', async () => {
    // Public-bind requires MCP_API_KEY — see startup guard in src/index.ts.
    // Supply a key here so the binding test exercises the listen path.
    const { proc, port, bindLog } = await spawnHttpServer({ MCP_HOST: '0.0.0.0', MCP_API_KEY: 'test-key' })
    assert.match(
      bindLog,
      new RegExp(`listening on 0\\.0\\.0\\.0:${port}\\b`),
      `Expected "listening on 0.0.0.0:${port}" in bind log, got: "${bindLog}"`
    )
    killProc(proc)
  })
})

describe('endpoints', () => {
  let proc: ChildProcessWithoutNullStreams
  let port: number

  before(async () => {
    const spawned = await spawnHttpServer()
    proc = spawned.proc
    port = spawned.port
  })

  after(() => {
    killProc(proc)
  })

  it('OPTIONS request returns 204 with CORS headers', async () => {
    const res = await httpOptions(port, '/api/generate')
    assert.equal(res.status, 204, `Expected 204, got ${res.status}`)
    assert.ok(
      res.headers['access-control-allow-origin'] !== undefined,
      'Expected Access-Control-Allow-Origin header to be present'
    )
  })

  it('GET /health returns 200 with { ok: true, service }', async () => {
    const res = await httpGet(port, '/health')
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`)
    const body = JSON.parse(res.body.toString('utf8')) as Record<string, unknown>
    assert.equal(body.ok, true, 'Expected ok=true in health response')
    assert.equal(
      body.service,
      'pretext-pdf-mcp',
      `Expected service='pretext-pdf-mcp', got ${String(body.service)}`
    )
  })

  it('POST /api/generate with valid PdfDocument returns application/pdf bytes', async () => {
    const document = JSON.stringify({
      data: {
        content: [{ type: 'heading', level: 1, text: 'Hi' }],
      },
    })
    const res = await httpPost(port, '/api/generate', document)
    assert.equal(res.status, 200, `Expected 200, got ${res.status}. Body: ${res.body.toString().substring(0, 200)}`)
    const ct = res.headers['content-type'] ?? ''
    assert.ok(
      ct.startsWith('application/pdf'),
      `Expected content-type to start with 'application/pdf', got '${ct}'`
    )
    // PDF magic bytes: %PDF-
    assert.equal(res.body[0], 0x25, 'Expected first byte 0x25 (%)')
    assert.equal(res.body[1], 0x50, 'Expected second byte 0x50 (P)')
    assert.equal(res.body[2], 0x44, 'Expected third byte 0x44 (D)')
    assert.equal(res.body[3], 0x46, 'Expected fourth byte 0x46 (F)')
    assert.equal(res.body[4], 0x2d, 'Expected fifth byte 0x2D (-)')
  })

  it('POST /api/generate with invalid JSON returns 400', async () => {
    const res = await httpPost(port, '/api/generate', 'not json{')
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`)
    const body = JSON.parse(res.body.toString('utf8')) as Record<string, unknown>
    assert.ok(
      typeof body.error === 'string',
      `Expected error field in 400 response, got: ${JSON.stringify(body)}`
    )
  })

  it('POST /api/generate with body > 500KB returns 413', async () => {
    // Build a body that is clearly over 500 KB
    const oversized = '{"data":"' + 'a'.repeat(600_000) + '"}'
    const bodyBuf = Buffer.from(oversized, 'utf8')
    assert.ok(bodyBuf.length > 500_000, 'Precondition: body must exceed 500 KB')

    // The server may cut the connection mid-stream; we handle socket errors gracefully
    let res: HttpResponse
    try {
      res = await httpPost(port, '/api/generate', bodyBuf)
    } catch (err: unknown) {
      // Connection reset or ECONNRESET is acceptable when server rejects large bodies
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('ECONNRESET') || msg.includes('socket hang up') || msg.includes('aborted')) {
        // The server correctly rejected the request mid-stream — test passes
        return
      }
      throw err
    }
    assert.equal(res.status, 413, `Expected 413, got ${res.status}`)
  })
})

describe('MCP JSON-RPC over HTTP', () => {
  let proc: ChildProcessWithoutNullStreams
  let port: number

  before(async () => {
    const spawned = await spawnHttpServer()
    proc = spawned.proc
    port = spawned.port
  })

  after(() => {
    killProc(proc)
  })

  it('POST /mcp tools/list returns the 6-tool list', async () => {
    // In stateless mode, tools/list can be called directly without a prior initialize.
    // Each request creates a fresh transport instance.
    const response = await mcpPost(port, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    })

    assert.equal(response.jsonrpc, '2.0', 'Expected jsonrpc=2.0')
    assert.equal(response.id, 1, 'Expected id=1')
    assert.ok(response.result, 'Expected result field')
    const result = response.result as Record<string, unknown>
    assert.ok(Array.isArray(result.tools), 'Expected tools to be an array')
    const tools = result.tools as Array<{ name: string }>
    const toolNames = tools.map((t) => t.name)

    const expectedTools = [
      'generate_pdf',
      'generate_invoice',
      'generate_report',
      'generate_from_markdown',
      'validate_document',
      'list_element_types',
    ]
    for (const name of expectedTools) {
      assert.ok(toolNames.includes(name), `Missing expected tool: ${name}. Got: ${toolNames.join(', ')}`)
    }
  })

  it('POST /mcp tools/call generate_pdf returns base64 PDF in MCP response shape', async () => {
    const response = await mcpPost(port, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'generate_pdf',
        arguments: {
          document: {
            content: [{ type: 'heading', level: 1, text: 'Test' }],
          },
        },
      },
    })

    assert.equal(response.jsonrpc, '2.0', 'Expected jsonrpc=2.0')
    assert.equal(response.id, 2, 'Expected id=2')
    assert.ok(response.result, `Expected result field. Full response: ${JSON.stringify(response)}`)

    const result = response.result as Record<string, unknown>
    assert.ok(Array.isArray(result.content), 'Expected content array in result')
    const content = result.content as Array<{ type: string; text: string }>
    assert.ok(content.length > 0, 'Expected at least one content item')
    assert.equal(content[0].type, 'text', 'Expected content[0].type to be "text"')

    // The tool response is a JSON string inside content[0].text
    const toolPayload = JSON.parse(content[0].text) as Record<string, unknown>
    assert.ok(
      typeof toolPayload.base64 === 'string',
      `Expected base64 field in tool payload. Keys: ${Object.keys(toolPayload).join(', ')}`
    )

    // Base64-encoded PDF starts with 'JVBE' (%PDF- in base64)
    assert.ok(
      toolPayload.base64.startsWith('JVBE'),
      `Expected base64 to start with 'JVBE' (PDF magic). Got: ${(toolPayload.base64 as string).substring(0, 10)}`
    )
  })
})

describe('misc', () => {
  let proc: ChildProcessWithoutNullStreams
  let port: number

  before(async () => {
    const spawned = await spawnHttpServer()
    proc = spawned.proc
    port = spawned.port
  })

  after(() => {
    killProc(proc)
  })

  it('GET /unknown returns 404', async () => {
    const res = await httpGet(port, '/unknown')
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`)
  })

  it('SIGTERM shuts the server down within 1 second', { skip: process.platform === 'win32' ? 'SIGTERM is mapped to TerminateProcess on Windows — graceful-shutdown path is unverifiable here' : false }, async () => {
    const { proc: sigProc } = await spawnHttpServer()

    sigProc.kill('SIGTERM')

    const exitPromise = once(sigProc, 'exit')
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Server did not exit within 1 second after SIGTERM')), 1000)
    )

    await Promise.race([exitPromise, timeoutPromise])
  })
})

// ─── Security: public-bind guard ──────────────────────────────────────────────

/**
 * Spawn the server and wait for it to exit with a non-zero code (i.e. refuse to start).
 * Returns the exit code and accumulated stderr. Used to verify the public-bind guard.
 */
async function spawnExpectFatal(env: Record<string, string>): Promise<{ code: number | null; stderr: string }> {
  const port = randomPort()
  const proc = spawn(process.execPath, [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MCP_PORT: String(port), ...env },
  })

  return new Promise((resolve, reject) => {
    let stderr = ''
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString() })
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* dead */ }
      reject(new Error(`Server did not exit within 5s — stderr so far: ${stderr.substring(0, 300)}`))
    }, 5000)
    proc.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, stderr })
    })
    proc.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

describe('security: public-bind guard', () => {
  it('refuses to start when MCP_HOST=0.0.0.0 and MCP_API_KEY is not set', async () => {
    const { code, stderr } = await spawnExpectFatal({ MCP_HOST: '0.0.0.0' })
    assert.equal(code, 1, `Expected exit code 1, got ${code}. Stderr: ${stderr.substring(0, 300)}`)
    assert.ok(stderr.includes('[FATAL]'), `Expected FATAL log in stderr. Got: ${stderr.substring(0, 300)}`)
    assert.ok(stderr.includes('MCP_API_KEY'), `Expected MCP_API_KEY mention in stderr. Got: ${stderr.substring(0, 300)}`)
  })

  it('refuses to start when MCP_HOST is a LAN address without MCP_API_KEY', async () => {
    const { code } = await spawnExpectFatal({ MCP_HOST: '192.168.1.50' })
    assert.equal(code, 1, `Expected exit code 1, got ${code}`)
  })

  it('starts normally when MCP_HOST=0.0.0.0 and MCP_API_KEY is set', async () => {
    const { proc, bindLog } = await spawnHttpServer({ MCP_HOST: '0.0.0.0', MCP_API_KEY: 'test-key' })
    assert.ok(bindLog.includes('listening on'), `Expected listening message, got: ${bindLog}`)
    killProc(proc)
  })
})

describe('security: bearer auth', () => {
  let proc: ChildProcessWithoutNullStreams
  let port: number
  const API_KEY = 'super-secret-test-key'

  before(async () => {
    // Use 127.0.0.1 (default) plus an API key — auth is active without tripping
    // the public-bind guard.
    const spawned = await spawnHttpServer({ MCP_API_KEY: API_KEY })
    proc = spawned.proc
    port = spawned.port
  })

  after(() => {
    killProc(proc)
  })

  it('rejects /api/generate with no Authorization header (401)', async () => {
    const body = JSON.stringify({ data: { content: [{ type: 'paragraph', text: 'x' }] } })
    const res = await httpPost(port, '/api/generate', body)
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`)
  })

  it('rejects /api/generate with wrong bearer token (401)', async () => {
    const body = JSON.stringify({ data: { content: [{ type: 'paragraph', text: 'x' }] } })
    const res = await httpPost(port, '/api/generate', body, { Authorization: 'Bearer wrong-key' })
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`)
  })

  it('accepts /api/generate with correct bearer token', async () => {
    const body = JSON.stringify({ data: { content: [{ type: 'paragraph', text: 'x' }] } })
    const res = await httpPost(port, '/api/generate', body, { Authorization: `Bearer ${API_KEY}` })
    assert.equal(res.status, 200, `Expected 200, got ${res.status}. Body: ${res.body.toString().substring(0, 200)}`)
  })

  it('/health remains accessible without auth (probes do not have the key)', async () => {
    const res = await httpGet(port, '/health')
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`)
  })

  it('rejects /mcp with no Authorization header (401)', async () => {
    const res = await httpPost(port, '/mcp', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }))
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`)
  })
})

describe('security: error message sanitization', () => {
  let proc: ChildProcessWithoutNullStreams
  let port: number

  before(async () => {
    const spawned = await spawnHttpServer()
    proc = spawned.proc
    port = spawned.port
  })

  after(() => {
    killProc(proc)
  })

  it('does not leak unknown error messages — only structured error+code returned', async () => {
    // Invalid JSON triggers a 400 with a fixed error string.
    const res = await httpPost(port, '/api/generate', 'not json{')
    assert.equal(res.status, 400)
    const body = JSON.parse(res.body.toString('utf8')) as Record<string, unknown>
    // The error message should be a fixed string, not a leaked parser detail.
    assert.equal(body.error, 'Invalid JSON body', `Expected fixed message, got: ${JSON.stringify(body)}`)
  })

  it('returns valid PretextPdfError messages (these are intentional user-facing)', async () => {
    // Body shape valid JSON but missing data → triggers VALIDATION_ERROR
    const res = await httpPost(port, '/api/generate', JSON.stringify({}))
    assert.equal(res.status, 400, `Expected 400, got ${res.status}. Body: ${res.body.toString()}`)
    const body = JSON.parse(res.body.toString('utf8')) as Record<string, unknown>
    assert.equal(body.code, 'VALIDATION_ERROR')
    // The user-facing message is intentionally surfaced because it comes from PretextPdfError.
    assert.ok(typeof body.error === 'string' && (body.error as string).length > 0)
    // It must not equal the sanitized fallback — confirming PretextPdfError messages flow through.
    assert.notEqual(body.error, 'Internal server error')
  })
})
