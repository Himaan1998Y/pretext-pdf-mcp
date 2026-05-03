---
name: Bug report
about: Something isn't working as expected
title: '[Bug] '
labels: bug
assignees: ''
---

## Bug Description

A clear description of the bug.

## Reproduction

Which tool were you calling?
- [ ] `generate_pdf`
- [ ] `generate_invoice`
- [ ] `generate_report`
- [ ] `generate_from_markdown`
- [ ] `validate_document`
- [ ] `list_element_types`

Minimal input JSON that reproduces the issue:

```json
{
  "tool": "generate_pdf",
  "args": {
    "document": {
      "content": []
    }
  }
}
```

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened. Include the full error response or error message.

## Environment

- **pretext-pdf-mcp version**:
- **pretext-pdf version** (run `npm list pretext-pdf`):
- **Node.js version** (`node -v`):
- **MCP client**: (Claude Desktop / Cursor / Windsurf / Claude Code / other)
- **Transport**: (stdio / HTTP)
- **OS**:
