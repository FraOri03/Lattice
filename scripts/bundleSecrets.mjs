/**
 * Detecting secrets in a built client bundle (Phase 17.4, #87).
 *
 * Vite inlines every `VITE_`-prefixed variable into the bundle at BUILD
 * time. That single fact is the whole security boundary of this
 * deployment: a secret behind that prefix is not a secret, it is published
 * to every visitor, and nothing at runtime can take it back.
 *
 * Reviews are a poor guard for that, because the mistake is one character
 * long and looks like every correct line around it. This module is the
 * guard instead, and it is deliberately three checks rather than one — each
 * catches the failure at a different stage:
 *
 *   1. NAMES  — a `VITE_`-prefixed variable that is obviously a secret,
 *               caught before it ever holds a value.
 *   2. VALUES — a secret from the build environment appearing verbatim in
 *               the output. The definitive check, and the only one that
 *               needs no pattern to know what it is looking at.
 *   3. SHAPES — credential-shaped strings, whatever the environment held.
 *               Catches a key someone pasted into a source file.
 *
 * Pure functions, so the detection is unit-tested rather than trusted.
 */

/* ---------------- 1. names ---------------- */

/** Words that make a variable name a secret regardless of its value. */
const SECRET_WORDS =
  /(SECRET|PASSWORD|PRIVATE|SERVICE_ROLE|CREDENTIAL|_DSN|CONNECTION_STRING|SESSION_TOKEN)/i

/**
 * Names that CONTAIN a secret-ish word but are public by definition.
 *
 * The anon/publishable keys are the case the issue calls out: they are
 * meant to be readable by anyone, and RLS is what makes that safe
 * (docs/authorisation-phase-16-3.md). Treating them as leaks would train
 * everyone to ignore this check, which is worse than not having it.
 */
const PUBLIC_BY_DEFINITION = [
  /^(VITE_|NEXT_PUBLIC_)?SUPABASE_ANON_KEY$/i,
  /^(VITE_|NEXT_PUBLIC_)?SUPABASE_PUBLISHABLE_KEY$/i,
  /^VITE_GOOGLE_CLIENT_ID$/i,
  /**
   * A Google *browser* API key. Public by design and useless without the
   * HTTP-referrer restriction set on it in the Google console — the
   * restriction is the control, not secrecy. Named here rather than
   * matched by pattern, so a genuinely secret `*_API_KEY` still trips.
   */
  /^VITE_GOOGLE_API_KEY$/i,
  /^VITE_GITHUB_CLIENT_ID$/i,
  /^VITE_LIVEKIT_URL$/i,
]

export function isPublicByDefinition(name) {
  return PUBLIC_BY_DEFINITION.some((re) => re.test(name))
}

/** Whether this name denotes something that must never reach a browser. */
export function isSecretName(name) {
  if (isPublicByDefinition(name)) return false
  if (SECRET_WORDS.test(name)) return true
  // `*_API_KEY` is a secret unless it was allowlisted above
  return /_API_KEY$/i.test(name) || /^(RESEND|STRIPE|OPENAI|ANTHROPIC)_/i.test(name)
}

/**
 * Variable names that would be compiled into the bundle AND are secrets.
 *
 * This is the mistake the phase exists to make impossible: the moment a
 * secret is given a `VITE_` prefix it is published, and it is published by
 * the build rather than by any line of code anyone will think to review.
 */
export function dangerousNames(names) {
  return names.filter((name) => name.startsWith('VITE_') && isSecretName(name))
}

/* ---------------- 2. values ---------------- */

/**
 * Values short or ordinary enough that finding them in a bundle means
 * nothing. `true`, `production`, a port number — matching those would
 * bury a real finding in noise.
 */
const TRIVIAL_VALUE = /^(true|false|null|undefined|production|preview|development|\d+)$/i

export function isCheckableValue(value) {
  return typeof value === 'string' && value.length >= 12 && !TRIVIAL_VALUE.test(value)
}

/**
 * Secrets from the build environment that appear verbatim in the output.
 *
 * The definitive check: no pattern has to recognise the credential,
 * because the environment already said what it was. It only works where
 * the environment is populated — CI, and a local build with `.env.local` —
 * which is why the other two checks exist.
 */
export function findLeakedValues(env, files) {
  const findings = []
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith('VITE_')) continue // inlined on purpose; see names check
    if (!isSecretName(name) || !isCheckableValue(value)) continue
    for (const file of files) {
      if (file.text.includes(value)) {
        findings.push({
          kind: 'value',
          name,
          file: file.path,
          detail: `the value of ${name} appears verbatim in the bundle`,
        })
        break // one report per variable is enough to act on
      }
    }
  }
  return findings
}

/* ---------------- 3. shapes ---------------- */

/**
 * Credential shapes, recognised without help from the environment.
 *
 * These catch the case no environment check can: a key pasted straight
 * into a source file, where there is no variable to have been named
 * wrongly in the first place.
 */
const SHAPES = [
  { label: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { label: 'Resend API key', re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/ },
  { label: 'Stripe secret key', re: /\bsk_(live|test)_[A-Za-z0-9]{16,}/ },
  { label: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { label: 'OpenAI key', re: /\bsk-[A-Za-z0-9]{32,}/ },
  { label: 'private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  {
    label: 'Postgres connection string with password',
    re: /\bpostgres(ql)?:\/\/[^\s:@/]+:[^\s@/]+@/,
  },
]

/** A JWT whose payload claims a privileged role — a service_role key. */
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g

function privilegedJwt(text) {
  for (const match of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(
        Buffer.from(match[1], 'base64').toString('utf8'),
      )
      if (payload.role && payload.role !== 'anon') return payload.role
    } catch {
      // not a JWT we can read: the shape rules above cover the rest
    }
  }
  return null
}

export function findCredentialShapes(files) {
  const findings = []
  for (const file of files) {
    for (const { label, re } of SHAPES) {
      if (re.test(file.text)) {
        findings.push({
          kind: 'shape',
          name: label,
          file: file.path,
          detail: `a ${label} appears in the bundle`,
        })
      }
    }
    const role = privilegedJwt(file.text)
    if (role) {
      findings.push({
        kind: 'shape',
        name: 'privileged JWT',
        file: file.path,
        detail: `a JWT claiming role "${role}" appears in the bundle`,
      })
    }
  }
  return findings
}

/* ---------------- the whole check ---------------- */

/**
 * Every finding, in the order a person would want to read them.
 *
 * `files` is `{ path, text }[]`; reading them is the caller's job so this
 * module stays pure and testable.
 */
export function auditBundle({ env = {}, files = [], envNames = [] }) {
  const names = dangerousNames(envNames.length ? envNames : Object.keys(env))
  return [
    ...names.map((name) => ({
      kind: 'name',
      name,
      file: '(environment)',
      detail: `${name} is VITE_-prefixed, so its value is compiled into the client bundle`,
    })),
    ...findLeakedValues(env, files),
    ...findCredentialShapes(files),
  ]
}
