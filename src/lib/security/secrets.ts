/**
 * Secret detection for environment-style files (Phase 8, spec §21).
 *
 * Heuristics only — the goal is a LOUD privacy warning before an .env
 * file is imported, committed to GitHub or exposed through a share, not
 * perfect classification. False positives are cheap; silent leaks are
 * not.
 */

/** File names/extensions that are environment files by convention. */
export function isEnvFileName(name: string): boolean {
  const base = name.toLowerCase().split(/[\\/]/).pop() ?? ''
  return (
    base === '.env' ||
    base.startsWith('.env.') ||
    base.endsWith('.env') ||
    /\.(pem|key|p12|pfx)$/.test(base)
  )
}

const SECRET_KEY_RE =
  /(secret|token|password|passwd|api[_-]?key|private[_-]?key|client[_-]?secret|access[_-]?key|auth)/i

const HIGH_ENTROPY_VALUE_RE = /^[A-Za-z0-9+/_=-]{24,}$/

export interface SecretFinding {
  line: number
  key: string
  /** why it matched (never contains the value) */
  reason: 'key-name' | 'high-entropy-value' | 'private-key-block'
}

/** Scan text for likely secrets. Findings never include the value. */
export function findLikelySecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = []
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) {
    findings.push({ line: 1, key: 'PRIVATE KEY', reason: 'private-key-block' })
  }
  const lines = text.split('\n')
  for (let i = 0; i < lines.length && findings.length < 20; i++) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*[=:]\s*(.+)$/.exec(lines[i])
    if (!m) continue
    const [, key, rawValue] = m
    const value = rawValue.trim().replace(/^["']|["']$/g, '')
    if (!value || value.length < 8) continue
    if (SECRET_KEY_RE.test(key)) {
      findings.push({ line: i + 1, key, reason: 'key-name' })
    } else if (HIGH_ENTROPY_VALUE_RE.test(value) && value.length >= 32) {
      findings.push({ line: i + 1, key, reason: 'high-entropy-value' })
    }
  }
  return findings
}

/** One-line warning for the UI, or null when nothing was found. */
export function secretWarningFor(name: string, text: string): string | null {
  const findings = findLikelySecrets(text)
  if (!findings.length && !isEnvFileName(name)) return null
  if (!findings.length) {
    return 'Environment file — double-check for credentials before sharing or committing.'
  }
  const keys = [...new Set(findings.map((f) => f.key))].slice(0, 3).join(', ')
  return `Likely secrets detected (${keys}${findings.length > 3 ? ', …' : ''}). This file is never auto-committed or shared — export it only on purpose.`
}
