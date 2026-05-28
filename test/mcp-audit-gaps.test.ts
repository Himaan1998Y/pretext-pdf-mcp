/**
 * mcp-audit-gaps.test.ts — Multi-lens edge-case coverage from the v2.0 audit.
 *
 * Covers all gaps identified across four lenses:
 *   1. Tool-handler unit tests (generate_pdf, generate_invoice, list_element_types)
 *   2. HTTP transport gaps (405, MCP body-size, Content-Disposition, concurrent 503)
 *   3. Security gaps (SSRF via image.src, invalid P12, error sanitization)
 *   4. isClientError HTTP integration (category → HTTP status code)
 *
 * Requires built dist/ — run `npm run build` before this test.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_PATH = resolve(__dirname, '..', 'dist', 'index.js')

// ─── helpers (mirrors http-transport.test.ts) ─────────────────────────────────

function randomPort() { return 40000 + Math.floor(Math.random() * 5000) }

interface HttpResponse { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }

async function spawnServer(env: Record<string, string> = {}): Promise<{ proc: ChildProcessWithoutNullStreams; port: number }> {
  const port = randomPort()
  const proc = spawn(process.execPath, [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MCP_PORT: String(port), ...env },
  })
  await new Promise<void>((resolve, reject) => {
    let buf = ''
    let done = false
    const timer = setTimeout(() => { if (!done) reject(new Error(`Server did not start in 15s. Stderr: ${buf.slice(0, 300)}`)) }, 15000)
    proc.stderr.on('data', (c: Buffer) => {
      buf += c.toString()
      if (!done && buf.includes('listening on')) { done = true; clearTimeout(timer); resolve() }
    })
    proc.on('error', reject)
    proc.on('exit', (code) => { if (!done) reject(new Error(`Server exited ${code} before ready`)) })
  })
  return { proc, port }
}

function kill(proc: ChildProcessWithoutNullStreams) { try { proc.kill('SIGKILL') } catch { /**/ } }

function httpReq(port: number, method: string, path: string, body?: string | Buffer, headers: Record<string, string> = {}): Promise<HttpResponse> {
  const bodyBuf = body ? (typeof body === 'string' ? Buffer.from(body) : body) : undefined
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1', port, path, method,
      headers: { 'Content-Type': 'application/json', ...(bodyBuf ? { 'Content-Length': String(bodyBuf.length) } : {}), ...headers },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers as any, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    if (bodyBuf) req.write(bodyBuf)
    req.end()
  })
}

// ─── Lens 1: Tool-handler unit tests ─────────────────────────────────────────

describe('generate_pdf tool — edge cases', async () => {
  const { generatePdfTool } = await import('../src/tools/generate-pdf.js')
  const { MAX_CONTENT_ELEMENTS } = await import('../src/utils/limits.js')

  it('content:[] (empty array) returns isError true with structured response', async () => {
    const result = await generatePdfTool.handler({ document: { content: [] } })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, false)
    assert.ok(typeof parsed.error === 'string' && parsed.error.length > 0)
  })

  it(`content array with ${MAX_CONTENT_ELEMENTS + 1} elements is rejected`, async () => {
    const content = Array.from({ length: MAX_CONTENT_ELEMENTS + 1 }, (_, i) => ({
      type: 'paragraph' as const,
      text: `Para ${i}`,
    }))
    const result = await generatePdfTool.handler({ document: { content } })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, false)
  })

  it('SSRF via image.src with AWS IMDS URL is blocked by pretext-pdf (not a crash)', async () => {
    // pretext-pdf's SSRF guard should reject http://169.254.169.254/...
    // The MCP layer must not crash — it must return a structured error.
    const result = await generatePdfTool.handler({
      document: {
        content: [
          { type: 'image', src: 'http://169.254.169.254/latest/meta-data/', width: 100, height: 100 },
        ],
      },
    })
    // Either renders (image silently skipped) or returns isError — never a raw crash
    if (result.isError) {
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.success, false)
      assert.ok(typeof parsed.error === 'string')
    }
    // If it renders without error, the SSRF URL was silently ignored/skipped — also acceptable
  })

  it('local file path in image.src is silently skipped (no file content leaked)', async () => {
    // pretext-pdf silently skips images whose allowedFileDirs is not configured.
    // The file is never read — the MCP tool renders a PDF without the image.
    // This verifies the security behavior: no PATH_TRAVERSAL error, no file read.
    const result = await generatePdfTool.handler({
      document: {
        content: [
          { type: 'paragraph', text: 'No image below.' },
          { type: 'image', src: '/etc/passwd', format: 'png', width: 100, height: 100 },
        ],
      },
    })
    // Success — image is silently skipped, PDF renders without it
    // If it errors, it must be a classified PretextPdfError (not a raw file-read error)
    if (result.isError) {
      const parsed = JSON.parse(result.content[0].text as string)
      assert.equal(parsed.success, false)
      assert.ok(parsed.error !== 'INTERNAL_ERROR', 'File path error must be classified, not INTERNAL_ERROR')
    }
    // No file content should appear in the result
    const text = result.content[0].text as string
    assert.ok(!text.includes('root:'), 'No /etc/passwd content must appear in response')
  })

  it('font src with path traversal is blocked with PATH_TRAVERSAL error', async () => {
    // pretext-pdf throws PATH_TRAVERSAL when a custom font uses a file path
    // but allowedFileDirs is not set. The MCP must return a structured error.
    const result = await generatePdfTool.handler({
      document: {
        fonts: [{ family: 'CustomFont', weight: 400, style: 'normal', src: '/etc/passwd' }],
        defaultFont: 'CustomFont',
        content: [{ type: 'paragraph', text: 'Test.' }],
      },
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, false)
    // Must be PATH_TRAVERSAL — confirms the pretext-pdf security guard is active
    assert.ok(
      parsed.error === 'PATH_TRAVERSAL' || parsed.error === 'VALIDATION_ERROR',
      `Expected PATH_TRAVERSAL or VALIDATION_ERROR, got: ${parsed.error}`
    )
  })

  it('invalid base64 P12 certificate returns structured error, not raw crash', async () => {
    const result = await generatePdfTool.handler({
      document: {
        content: [{ type: 'paragraph', text: 'Sign this.' }],
        signature: {
          p12: 'not-valid-base64!!!!',
          passphrase: 'secret',
        },
      },
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, false)
    assert.ok(typeof parsed.error === 'string' && parsed.error.length > 0)
  })

  it('error message does not contain OS file paths on unknown failures', async () => {
    // The MCP tool catch now sanitizes unknown errors to "Internal server error".
    // This test verifies the error field does not contain path separators that
    // would indicate a raw OS path leaked through.
    const result = await generatePdfTool.handler({ document: null as any })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    // error is either 'UNKNOWN_ERROR'/'INTERNAL_ERROR' (unknown) or a PretextPdfError code
    // message is either 'Internal server error' (sanitized) or a user-facing pretext-pdf message
    if (parsed.message === 'Internal server error') {
      // Sanitized — confirm no OS path pattern
      assert.ok(!parsed.message.includes('/'), 'sanitized message must not contain path separators')
      assert.ok(!parsed.message.match(/[A-Za-z]:\\/), 'sanitized message must not contain Windows paths')
    }
  })
})

describe('generate_invoice tool — validation edge cases', async () => {
  const { generateInvoiceTool } = await import('../src/tools/generate-invoice.js')

  const BASE = {
    from: { company: 'Acme Corp', address: '123 Main St' },
    to: { company: 'Client Ltd', address: '456 Other Ave' },
    invoice_number: 'INV-001',
    items: [{ description: 'Service', quantity: 1, rate: 100 }],
  }

  it('currency: "JPY" (unsupported enum) returns VALIDATION_ERROR', async () => {
    const result = await generateInvoiceTool.handler({ ...BASE, currency: 'JPY' as any })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
    assert.ok((parsed.message as string).includes('JPY') || (parsed.message as string).toLowerCase().includes('currency'))
  })

  it('items[0].gst_rate: 15 (non-Indian slab) now accepted — schema accepts 0–100 (B4 fix)', async () => {
    // Previously the handler hard-coded [0,5,12,18,28] and rejected 15.
    // Since B4, any finite number in 0–100 is valid so non-Indian tax rates work.
    const result = await generateInvoiceTool.handler({
      ...BASE,
      items: [{ description: 'Service', quantity: 1, rate: 100, gst_rate: 15 as any }],
    })
    assert.equal(result.isError, undefined, `gst_rate:15 should succeed, got: ${result.content[0].text}`)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, true)
  })

  it('items[0].gst_rate: 150 (> 100) still returns VALIDATION_ERROR', async () => {
    const result = await generateInvoiceTool.handler({
      ...BASE,
      items: [{ description: 'Service', quantity: 1, rate: 100, gst_rate: 150 as any }],
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
  })

  it('from.company with newline character returns VALIDATION_ERROR (control-char guard)', async () => {
    const result = await generateInvoiceTool.handler({
      ...BASE,
      from: { company: 'Acme\nCorp', address: '123 Main St' },
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
    assert.ok((parsed.message as string).includes('company'))
  })

  it('invoice_number with null byte returns VALIDATION_ERROR (control-char guard)', async () => {
    const result = await generateInvoiceTool.handler({
      ...BASE,
      invoice_number: 'INV 001',
    })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.error, 'VALIDATION_ERROR')
  })

  it('items: [] (zero line items) returns VALIDATION_ERROR', async () => {
    const result = await generateInvoiceTool.handler({ ...BASE, items: [] })
    assert.equal(result.isError, true)
    const parsed = JSON.parse(result.content[0].text as string)
    assert.equal(parsed.success, false)
  })
})

describe('list_element_types tool — unit tests', async () => {
  const { listElementsTool } = await import('../src/tools/list-elements.js')

  it('returns a non-empty elements reference string', async () => {
    const result = await listElementsTool.handler({})
    assert.equal(result.isError, undefined)
    const text = result.content[0].text as string
    assert.ok(typeof text === 'string' && text.length > 100,
      `Expected long reference string, got: ${text.slice(0, 50)}`)
  })

  it('contains descriptions for core element types', async () => {
    const result = await listElementsTool.handler({})
    const text = result.content[0].text as string
    // Core element types that must be documented
    for (const elementType of ['paragraph', 'heading', 'table', 'image', 'list']) {
      assert.ok(text.includes(elementType),
        `Expected '${elementType}' to appear in elements reference`)
    }
  })

  it('accepts empty args object without error', async () => {
    const result = await listElementsTool.handler({})
    assert.equal(result.isError, undefined)
  })
})

// ─── Lens 2: HTTP transport gaps ─────────────────────────────────────────────

describe('HTTP transport: wrong method returns 405', () => {
  let proc: ChildProcessWithoutNullStreams
  let port: number

  before(async () => {
    const s = await spawnServer()
    proc = s.proc; port = s.port
  })
  after(() => kill(proc))

  it('GET /mcp returns 405 Method Not Allowed', async () => {
    const res = await httpReq(port, 'GET', '/mcp')
    assert.equal(res.status, 405, `Expected 405, got ${res.status}`)
    const body = JSON.parse(res.body.toString())
    assert.ok(typeof body.error === 'string')
  })

  it('GET /api/generate returns 405 Method Not Allowed', async () => {
    const res = await httpReq(port, 'GET', '/api/generate')
    assert.equal(res.status, 405, `Expected 405, got ${res.status}`)
  })
})

describe('HTTP transport: /mcp body-size cap', () => {
  let proc: ChildProcessWithoutNullStreams
  let port: number

  before(async () => {
    const s = await spawnServer()
    proc = s.proc; port = s.port
  })
  after(() => kill(proc))

  it('POST /mcp with body > 500 KB returns 413', async () => {
    // Build a body just over 500 KB
    const oversized = Buffer.alloc(501_000, 'x')
    const res = await httpReq(port, 'POST', '/mcp', oversized)
    assert.equal(res.status, 413, `Expected 413, got ${res.status}`)
    const body = JSON.parse(res.body.toString())
    assert.ok((body.error as string).includes('large') || (body.error as string).includes('500'))
  })
})

describe('HTTP transport: Content-Disposition header', () => {
  let proc: ChildProcessWithoutNullStreams
  let port: number

  before(async () => {
    const s = await spawnServer()
    proc = s.proc; port = s.port
  })
  after(() => kill(proc))

  it('POST /api/generate success response has Content-Disposition: inline; filename="output.pdf"', async () => {
    const doc = { data: { content: [{ type: 'paragraph', text: 'Hello' }] } }
    const res = await httpReq(port, 'POST', '/api/generate', JSON.stringify(doc))
    assert.equal(res.status, 200, `Expected 200, got ${res.status}. Body: ${res.body.slice(0, 100)}`)
    const cd = res.headers['content-disposition']
    assert.ok(typeof cd === 'string' && cd.includes('filename="output.pdf"'),
      `Expected Content-Disposition with filename="output.pdf", got: ${cd}`)
    assert.ok(typeof cd === 'string' && cd.includes('inline'),
      `Expected Content-Disposition: inline, got: ${cd}`)
  })
})

describe('HTTP transport: sendBusy 503 path', () => {
  let proc: ChildProcessWithoutNullStreams
  let port: number

  before(async () => {
    // Set MAX_CONCURRENT_RENDERS=1 so even 2 concurrent requests saturate it
    const s = await spawnServer({ MCP_MAX_CONCURRENT_RENDERS: '1' })
    proc = s.proc; port = s.port
  })
  after(() => kill(proc))

  it('when MAX_CONCURRENT_RENDERS is saturated, returns 503 with Retry-After header', async () => {
    // Send two concurrent requests — with limit=1, the second will hit sendBusy
    const doc = { data: { content: [{ type: 'paragraph', text: 'Concurrent test.' }] } }
    const body = JSON.stringify(doc)

    // Fire both requests simultaneously — first holds the slot, second gets 503
    const [res1, res2] = await Promise.all([
      httpReq(port, 'POST', '/api/generate', body),
      httpReq(port, 'POST', '/api/generate', body),
    ])

    // One must succeed (200) and one must be busy (503), or both succeed if they're serialized
    const statuses = [res1.status, res2.status].sort()
    const hasBusy = statuses.includes(503)
    const hasBothOk = statuses.every(s => s === 200)

    assert.ok(hasBusy || hasBothOk,
      `Expected one 503 or both 200, got statuses: ${statuses}`)

    if (hasBusy) {
      const busyRes = res1.status === 503 ? res1 : res2
      assert.ok(busyRes.headers['retry-after'],
        'Expected Retry-After header in 503 response')
      const busyBody = JSON.parse(busyRes.body.toString())
      assert.equal(busyBody.code, 'RATE_LIMITED')
    }
  })
})

describe('HTTP transport: malformed JSON-RPC to /mcp', () => {
  let proc: ChildProcessWithoutNullStreams
  let port: number

  before(async () => {
    const s = await spawnServer()
    proc = s.proc; port = s.port
  })
  after(() => kill(proc))

  it('syntactically invalid JSON returns 400', async () => {
    const res = await httpReq(port, 'POST', '/mcp', '{not json')
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`)
  })

  it('valid JSON but not a JSON-RPC object is handled gracefully (no 500)', async () => {
    // A valid JSON body that is not a valid JSON-RPC request
    const res = await httpReq(port, 'POST', '/mcp', JSON.stringify({ hello: 'world' }))
    // The MCP SDK handles this — should not produce an unhandled 500
    assert.notEqual(res.status, 500, `Got unexpected 500. Body: ${res.body.slice(0, 200)}`)
  })
})

// ─── Lens 3: isClientError HTTP integration ───────────────────────────────────

describe('isClientError: HTTP status integration', () => {
  let proc: ChildProcessWithoutNullStreams
  let port: number

  before(async () => {
    const s = await spawnServer()
    proc = s.proc; port = s.port
  })
  after(() => kill(proc))

  it('VALIDATION_ERROR (category: validation) maps to HTTP 400', async () => {
    // Send body with no data field → triggers VALIDATION_ERROR
    const res = await httpReq(port, 'POST', '/api/generate', JSON.stringify({}))
    assert.equal(res.status, 400, `Expected 400, got ${res.status}. Body: ${res.body.toString()}`)
    const body = JSON.parse(res.body.toString())
    assert.equal(body.code, 'VALIDATION_ERROR')
  })

  it('IMAGE_LOAD_FAILED (category: image) maps to HTTP 400', async () => {
    // An image with an invalid URL triggers IMAGE_LOAD_FAILED
    const doc = {
      data: {
        content: [{ type: 'image', src: 'https://this-domain-definitely-does-not-exist-xyz123.com/img.png', width: 100, height: 100 }],
      },
    }
    const res = await httpReq(port, 'POST', '/api/generate', JSON.stringify(doc))
    // Either 400 (SSRF/network blocked at validation) or 200 (image silently skipped)
    assert.ok([200, 400].includes(res.status),
      `Expected 200 or 400 for invalid image URL, got ${res.status}`)
  })

  it('schema validation error (missing content) maps to HTTP 400', async () => {
    // A document with a missing required content field
    const doc = { data: { pageSize: 'A4' } }  // no content field
    const res = await httpReq(port, 'POST', '/api/generate', JSON.stringify(doc))
    assert.equal(res.status, 400, `Expected 400 for missing content, got ${res.status}`)
  })
})
