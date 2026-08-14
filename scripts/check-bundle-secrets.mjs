#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { auditBundle } from './bundleSecrets.mjs'

/**
 * `npm run check:secrets` — fail the build if anything secret reached the
 * client bundle (Phase 17.4, #87).
 *
 * Runs in CI after `npm run build`, where the environment holds the real
 * values and the strongest of the three checks can actually fire. Locally
 * it still runs the name and shape checks, which need no secrets at all.
 *
 * The detection lives in `bundleSecrets.mjs` and is unit-tested; this file
 * only decides what to read and what to print.
 */

const DIST = 'dist'

/** Text formats a secret could survive into. Images and fonts cannot hold one. */
const TEXT_FILE = /\.(js|mjs|cjs|css|html|json|map|txt|svg|webmanifest)$/i

function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectFiles(full, out)
    else if (TEXT_FILE.test(entry)) {
      out.push({ path: relative('.', full), text: readFileSync(full, 'utf8') })
    }
  }
  return out
}

/**
 * Every place a variable can be declared.
 *
 * `.env.local` matters most and is the easiest to overlook: it is where a
 * developer actually adds a variable, it is gitignored so no reviewer ever
 * sees it, and it is NOT in `process.env` when this script runs. A check
 * that read only the shell would miss the mistake exactly where it is most
 * likely to be made — which is how the first version of this file passed a
 * build that was deliberately leaking.
 */
const ENV_FILES = ['.env.example', '.env', '.env.local', '.env.production']

function eachDeclaration(file, visit) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (match) visit(match[1], match[2].trim().replace(/^["']|["']$/g, ''))
  }
}

function declaredNames() {
  const names = new Set(Object.keys(process.env))
  for (const file of ENV_FILES) eachDeclaration(file, (name) => names.add(name))
  return [...names]
}

/**
 * Values from the shell and from local env files, so the value check works
 * on a developer's machine and not only in CI. `.env.example` is skipped:
 * it holds placeholders, never real values.
 */
function declaredValues() {
  const values = { ...process.env }
  for (const file of ENV_FILES) {
    if (file === '.env.example') continue
    eachDeclaration(file, (name, value) => {
      if (value && values[name] === undefined) values[name] = value
    })
  }
  return values
}

if (!existsSync(DIST)) {
  console.error(`✗ ${DIST}/ not found — run "npm run build" first.`)
  process.exit(1)
}

const files = collectFiles(DIST)
const findings = auditBundle({
  env: declaredValues(),
  files,
  envNames: declaredNames(),
})

if (findings.length === 0) {
  console.log(
    `✓ no secrets in the client bundle (${files.length} files scanned in ${DIST}/)`,
  )
  process.exit(0)
}

console.error(`\n✗ ${findings.length} secret finding(s) in the client bundle:\n`)
for (const f of findings) {
  console.error(`  [${f.kind}] ${f.name}`)
  console.error(`      ${f.detail}`)
  console.error(`      in ${f.file}\n`)
}
console.error(
  'Every VITE_-prefixed variable is compiled into the bundle at build time.\n' +
    'A server-side secret must NOT carry that prefix — see docs/deploy-and-secrets.md.\n',
)
process.exit(1)
