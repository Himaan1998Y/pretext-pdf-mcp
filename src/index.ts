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