#!/usr/bin/env node
/**
 * Sync the `version:` field in smithery.yaml with the version in package.json.
 *
 * Usage:
 *   node scripts/sync-smithery-version.mjs           # auto-update smithery.yaml
 *   node scripts/sync-smithery-version.mjs --check   # exit 1 if out of sync
 *
 * Prevents publish-time drift between npm metadata and the Smithery registry.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const pkgPath = resolve(repoRoot, 'package.json')
const smitheryPath = resolve(repoRoot, 'smithery.yaml')

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const pkgVersion = pkg.version

if (!pkgVersion || typeof pkgVersion !== 'string') {
  console.error('[sync-smithery-version] package.json has no valid "version" field')
  process.exit(1)
}

const smitheryRaw = readFileSync(smitheryPath, 'utf8')

// Match a top-level `version: x.y.z` line. Tolerates optional quotes.
const versionLineRe = /^version:\s*['"]?([^'"\n]+)['"]?\s*$/m

const match = smitheryRaw.match(versionLineRe)
const currentVersion = match ? match[1].trim() : null

const checkOnly = process.argv.includes('--check')

if (currentVersion === pkgVersion) {
  console.log(`[sync-smithery-version] in sync (${pkgVersion})`)
  process.exit(0)
}

if (checkOnly) {
  console.error(
    `[sync-smithery-version] DRIFT: smithery.yaml=${currentVersion ?? '<missing>'} package.json=${pkgVersion}`
  )
  console.error('[sync-smithery-version] Run: node scripts/sync-smithery-version.mjs')
  process.exit(1)
}

let updated
if (currentVersion === null) {
  // Insert version line after the first `name:` line for predictable ordering.
  updated = smitheryRaw.replace(/(^name:.*$)/m, `$1\nversion: ${pkgVersion}`)
} else {
  updated = smitheryRaw.replace(versionLineRe, `version: ${pkgVersion}`)
}

writeFileSync(smitheryPath, updated)
console.log(
  `[sync-smithery-version] updated smithery.yaml: ${currentVersion ?? '<missing>'} -> ${pkgVersion}`
)
