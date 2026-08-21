import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The acceptance criterion, as a test: no RunPod hostname, endpoint id or
 * credential appears anywhere the browser can read.
 *
 * It scans the SOURCE rather than the bundle, on purpose. `npm run
 * check:secrets` already audits `dist/` after a build and catches a leaked
 * *value*; this catches the mistake earlier and without a build — the line
 * that reaches for `import.meta.env.VITE_RUNPOD_...`, or the one that
 * shortcuts past `/api/ai/*` and calls `api.runpod.ai` directly because it
 * was quicker to debug that way.
 *
 * The word "RunPod" is allowed, and so is naming `RUNPOD_API_KEY` in a
 * sentence that tells an administrator what to configure: a variable name
 * is not a credential. What is forbidden is an ADDRESS the browser could
 * call, and any attempt to READ a RunPod variable from client code — which
 * either publishes it (`VITE_`) or silently reads undefined.
 *
 * Test files are skipped: they are never bundled, and several of them
 * assert on exactly these strings.
 */

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  {
    pattern: /api\.runpod\.ai|runpod\.io/i,
    why: 'a RunPod address — the browser must go through /api/ai/*',
  },
  {
    pattern: /VITE_RUNPOD[A-Z_]*/i,
    why: 'a RunPod value compiled into the public bundle by every build',
  },
  {
    pattern: /process\.env\.RUNPOD[A-Z_]*/,
    why: 'a server-only variable read from client code',
  },
]

const SOURCE = /\.(ts|tsx)$/
const TEST = /\.test\.(ts|tsx)$/

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (SOURCE.test(entry) && !TEST.test(entry)) out.push(full)
  }
  return out
}

describe('the trust boundary', () => {
  it('keeps every RunPod address and variable out of the client source', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8')
      for (const { pattern, why } of FORBIDDEN) {
        const hit = pattern.exec(text)
        if (hit) offenders.push(`${file}: ${hit[0]} — ${why}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('routes the hosted provider through our own endpoints and nowhere else', async () => {
    const { AI_CANCEL_URL, AI_CAPABILITIES_URL, AI_STATUS_URL, AI_SUBMIT_URL } = await import(
      './protocol'
    )
    for (const url of [AI_SUBMIT_URL, AI_STATUS_URL, AI_CANCEL_URL, AI_CAPABILITIES_URL]) {
      expect(url.startsWith('/api/ai/')).toBe(true)
    }
  })
})
