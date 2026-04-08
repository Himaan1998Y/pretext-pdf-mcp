#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { generatePdfTool } from './tools/generate-pdf.js';
import { generateInvoiceTool } from './tools/generate-invoice.js';
import { generateReportTool } from './tools/generate-report.js';
import { listElementsTool } from './tools/list-elements.js';
function createServer() {
    const server = new Server({ name: 'pretext-pdf', version: '1.0.0' }, { capabilities: { tools: {} } });
    const tools = [generatePdfTool, generateInvoiceTool, generateReportTool, listElementsTool];
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: tools.map(t => t.schema),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const tool = tools.find(t => t.schema.name === request.params.name);
        if (!tool) {
            return {
                content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
                isError: true,
            };
        }
        return tool.handler(request.params.arguments ?? {});
    });
    return server;
}
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
if (port) {
    // HTTP mode — for hosted deployments (Smithery, VPS, etc.)
    const { createServer: createHttpServer } = await import('node:http');
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const { randomUUID } = await import('node:crypto');
    const sessions = new Map();
    const httpServer = createHttpServer(async (req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${port}`);
        // Health check
        if (url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, service: 'pretext-pdf-mcp' }));
            return;
        }
        if (url.pathname !== '/mcp') {
            res.writeHead(404);
            res.end();
            return;
        }
        if (req.method === 'POST') {
            // Parse body
            const chunks = [];
            for await (const chunk of req)
                chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks).toString());
            // Check for existing session
            const sessionId = req.headers['mcp-session-id'];
            let transport;
            if (sessionId && sessions.has(sessionId)) {
                transport = sessions.get(sessionId);
            }
            else if (!sessionId && body?.method === 'initialize') {
                // New session
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                });
                const server = createServer();
                await server.connect(transport);
                transport.onclose = () => {
                    if (transport.sessionId)
                        sessions.delete(transport.sessionId);
                };
                sessions.set(transport.sessionId, transport);
            }
            else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Bad request: missing or invalid session' }));
                return;
            }
            await transport.handleRequest(req, res, body);
            return;
        }
        if (req.method === 'GET' || req.method === 'DELETE') {
            const sessionId = req.headers['mcp-session-id'];
            if (!sessionId || !sessions.has(sessionId)) {
                res.writeHead(404);
                res.end();
                return;
            }
            await sessions.get(sessionId).handleRequest(req, res);
            return;
        }
        res.writeHead(405);
        res.end();
    });
    httpServer.listen(port, () => {
        process.stderr.write(`pretext-pdf-mcp HTTP server listening on port ${port}\n`);
    });
}
else {
    // Stdio mode — for local npx usage (Claude Desktop, Cursor, etc.)
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
