# Contributing to pretext-pdf-mcp

## Development Setup

```bash
git clone https://github.com/Himaan1998Y/pretext-pdf-mcp
cd pretext-pdf-mcp
npm install
npm run build
npm test
```

## Running Tests

```bash
npm test              # Run all test suites (41 tests)
npm run build         # TypeScript compilation
```

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make changes and add tests
4. Run `npm run build && npm test` — all 41 tests must pass
5. Commit using conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
6. Open a pull request

## Code Style

- TypeScript with strict mode
- MCP SDK patterns — tool handlers return `{ content: [{ type: 'text', text: JSON.stringify({...}) }] }`
- All new tools require an integration test in `test/`

## Reporting Bugs

Open a [GitHub issue](https://github.com/Himaan1998Y/pretext-pdf-mcp/issues) with:
- Node.js version (`node --version`)
- Package version + pretext-pdf version
- The exact MCP tool call that failed
- Expected vs actual response
