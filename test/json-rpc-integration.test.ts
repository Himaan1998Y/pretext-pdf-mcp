/**
 * JSON-RPC integration test — exercises the real stdio dispatcher.
 *
 * Spawns dist/index.js as a subprocess, drives the full MCP handshake
 * (initialize → initialized notification → tools/list → tools/call),
 * and asserts response shapes. This is the only test that exercises the
 * MCP dispatcher wiring end-to-end rather than calling handler functions
 * directly.
 *
 * Requires a built dist/index.js. Run `npm run build` before this test.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_PATH = resolve(__dirname, '..', 'dist', 'index.js')
const TIMEOUT_MS = 10_000

// ─── Subprocess helpers ───────────────────────────────────────────────────────

function spawnServer(): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '' }, // force stdio mode
  })
}

function sendMessage(proc: ChildProcessWithoutNullStreams, msg: object): void {
  proc.stdin.write(JSON.stringify(msg) + '\n')
}

function nextMessage(proc: ChildProcessWithoutNullStreams): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${TIMEOUT_MS}ms waiting for response`)), TIMEOUT_MS)
    const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity })
    rl.once('line', line => {
      clearTimeout(timer)
      rl.close()
      try {
        resolve(JSON.parse(line) as Record<string, unknown>)
      } catch {
        reject(new Error(`Server sent non-JSON line: ${line}`))
      }
    })
    proc.once('error', err => { clearTimeout(timer); rl.close(); reject(err) })
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MCP JSON-RPC integration', () => {
  let proc: ChildProcessWithoutNullStreams

  before(() => {
    proc = spawnServer()
  })

  after(() => {
    proc.stdin.end()
    proc.kill()
  })

  it('responds to initialize with server identity', async () => {
    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    })

    const response = await nextMessage(proc)
    assert.equal(response.jsonrpc, '2.0')
    assert.equal(response.id, 1)
    assert.ok(response.result, 'expected result field')
    const result = response.result as Record<string, unknown>
    assert.ok(result.serverInfo, 'expected serverInfo in result')
    const serverInfo = result.serverInfo as Record<string, unknown>
    assert.equal(serverInfo.name, 'pretext-pdf')
    assert.ok(typeof serverInfo.version === 'string', 'expected version string')
  })

  it('tools/list returns all expected tools', async () => {
    // Send initialized notification (required by MCP protocol after initialize)
    sendMessage(proc, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    })

    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    })

    const response = await nextMessage(proc)
    assert.equal(response.jsonrpc, '2.0')
    assert.equal(response.id, 2)
    assert.ok(response.result, 'expected result field')
    const result = response.result as Record<string, unknown>
    assert.ok(Array.isArray(result.tools), 'expected tools array')
    const tools = result.tools as Array<{ name: string }>
    const toolNames = tools.map(t => t.name)

    const expectedTools = ['generate_pdf', 'generate_invoice', 'generate_report', 'generate_from_markdown', 'list_element_types']
    for (const name of expectedTools) {
      assert.ok(toolNames.includes(name), `Missing tool: ${name}`)
    }
  })

  it('tools/call list_element_types returns element reference', async () => {
    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'list_element_types',
        arguments: {},
      },
    })

    const response = await nextMessage(proc)
    assert.equal(response.jsonrpc, '2.0')
    assert.equal(response.id, 3)
    assert.ok(response.result, 'expected result field')
    const result = response.result as Record<string, unknown>
    assert.ok(Array.isArray(result.content), 'expected content array')
    const content = result.content as Array<{ type: string; text: string }>
    assert.equal(content[0]?.type, 'text')
    assert.ok(content[0]?.text.includes('## paragraph'), 'expected element reference markdown')
    assert.ok(content[0]?.text.includes('## heading'), 'expected heading entry')
  })

  it('tools/call with unknown tool returns error', async () => {
    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'nonexistent_tool',
        arguments: {},
      },
    })

    const response = await nextMessage(proc)
    assert.equal(response.jsonrpc, '2.0')
    assert.equal(response.id, 4)
    // MCP SDK returns either an error field or isError in result
    const hasError = response.error != null ||
      (response.result != null && (response.result as Record<string, unknown>).isError === true)
    assert.ok(hasError, 'expected error response for unknown tool')
  })
})
