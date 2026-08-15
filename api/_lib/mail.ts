/**
 * Sending mail (Phase 17.3 #86, extended by 18.2 #89).
 *
 * A SEAM rather than a provider: what a message *is* lives in
 * `mailTemplates.ts`, and this file only knows how to hand one to Resend.
 * The split is what lets 18.2 add HTML, a second language and a second
 * template family without touching the transport at all.
 *
 * ## No dependency
 *
 * Resend's API is one HTTP POST, so this is `fetch` and nothing else. A
 * mail SDK would be a package, a bundle of transitive dependencies and a
 * release cadence, in exchange for a function that fits on a screen.
 *
 * ## Unconfigured is a valid state
 *
 * Like every other backend in this codebase, absent configuration means
 * the feature is honestly unavailable rather than broken. `mailSender()`
 * returns null and the caller answers 501 saying exactly what is missing —
 * it never pretends to have sent something.
 *
 * ## The domain is the part code cannot do
 *
 * `MAIL_FROM` has to be an address on a domain verified with the provider,
 * or every message is rejected at the API and no amount of correct code
 * helps. See docs/invitation-email.md.
 *
 * ## The FORMAT of that address, however, is
 *
 * See `normaliseFrom` below: a value that is correct in a `.env` file is not
 * always correct once it has been pasted into a deployment's settings, and
 * the provider answers a bare 422 either way.
 */

/**
 * One message, in both forms.
 *
 * `text` is not a fallback that nobody sees: it is what a client stripping
 * markup renders, what a screen reader gets the cleanest run at, and what
 * survives when images and CSS are refused. Every template produces both,
 * and the plain part is written to stand on its own rather than to say
 * "view this in a browser".
 */
export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

export interface MailSender {
  send(message: MailMessage): Promise<void>
  /**
   * Set when this transport is configured wrongly and every send will fail
   * without a request being made.
   *
   * Callers that spend something before sending — the mail allowance, a row
   * in `mail_sends` — read it first and stop. A message that never reached
   * the provider touched no mailbox, so counting it would only lock the
   * sender out of a project's invitations for an hour over a typo in an
   * environment variable.
   */
  readonly problem?: string
}

/**
 * Quote pairs a value can arrive wrapped in, by code point: straight double,
 * straight single, backtick, typographic single, typographic double, and
 * guillemets. Written numerically because the glyphs themselves do not
 * survive every editor between here and the file.
 */
const QUOTE_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0x22, 0x22],
  [0x27, 0x27],
  [0x60, 0x60],
  [0x2018, 0x2019],
  [0x201c, 0x201d],
  [0xab, 0xbb],
]

/** Strip one matching pair of quotes wrapping the WHOLE value, repeatedly. */
function unwrap(value: string): string {
  let out = value
  // bounded: a doubly quoted value is already pathological, and this reads
  // configuration — it has no business looping on it
  for (let i = 0; i < 3; i += 1) {
    if (out.length < 2) break
    const first = out.codePointAt(0)
    const last = out.codePointAt(out.length - 1)
    if (!QUOTE_PAIRS.some(([open, close]) => first === open && last === close)) break
    out = out.slice(1, -1).trim()
  }
  return out
}

/**
 * `MAIL_FROM` as the provider will actually take it.
 *
 * The value reaches this process from two places that disagree about quotes.
 * A `.env` file — and every example documenting one, this repo's included —
 * writes `MAIL_FROM="Lattice <no-reply@example.com>"`, where the quotes are
 * the file format and the loader removes them. Pasted into a deployment's
 * environment settings, which is the only place a production value is ever
 * actually set, the very same line's quotes become part of the value. Resend
 * then answers 422 `Invalid \`from\` field` for a string that looks perfectly
 * correct in the settings UI, and the message never leaves.
 *
 * So they are stripped here rather than trusting that nobody copies the
 * documented line. Only a MATCHING pair wrapping the whole value goes: a
 * quoted display name (`"Ori, Francesco" <a@b.com>`) is RFC 5322 valid, ends
 * in `>`, and is never touched. Newlines and doubled spaces — the other
 * thing a paste carries in — collapse, because a header value cannot hold
 * them either.
 */
export function normaliseFrom(raw: string): string {
  return unwrap(raw.trim()).replace(/\s+/g, ' ').trim()
}

/** An address, loosely: enough to catch a typo, not an RFC implementation. */
const ADDRESS = String.raw`[^\s<>@,;:"]+@[^\s<>@,;:"]+\.[^\s<>@,;:".]+`
const BARE = new RegExp(`^${ADDRESS}$`)
const NAMED = new RegExp(`^[^<>]*<${ADDRESS}>$`)

/**
 * Why this value cannot be a `From:`, or null when it can.
 *
 * Checked here so the answer names the variable to fix. The provider's own
 * 422 says a format is wrong without saying which of the deployment's
 * settings holds it, and it costs a round trip, a rate-limit slot and a row
 * in `mail_sends` to find out.
 */
export function fromProblem(from: string): string | null {
  if (BARE.test(from) || NAMED.test(from)) return null
  return (
    'MAIL_FROM is not a valid From address: it has to be name@example.com ' +
    'or Name <name@example.com>, on a domain verified with Resend.'
  )
}

/** The transport for this deployment, or null when it has none. */
export function mailSender(env: NodeJS.ProcessEnv = process.env): MailSender | null {
  // trimmed for the same reason as the address: a pasted secret brings a
  // trailing newline often enough, and it costs a 401 to discover
  const apiKey = (env.RESEND_API_KEY ?? '').trim()
  const from = normaliseFrom(env.MAIL_FROM ?? '')
  if (!apiKey || !from) return null
  const problem = fromProblem(from)
  if (problem) return new MisconfiguredSender(problem)
  return new ResendSender(apiKey, from)
}

/**
 * The transport for a deployment that HAS mail configured, wrongly.
 *
 * Deliberately not null. Null means "this deployment has no mail backend",
 * and the share dialog says exactly that — which is untrue here, and untrue
 * in the direction that points the one person who can fix it away from the
 * fix. Failing every send with the sentence naming the variable is the
 * honest state: mail exists, and it is broken.
 */
class MisconfiguredSender implements MailSender {
  constructor(readonly problem: string) {}

  async send(): Promise<void> {
    // `/api/session` swallows delivery failures by design, so for a sign-in
    // code the log is the only place this is ever reported
    console.error(`[mail] ${this.problem}`)
    throw new Error(`[mail] ${this.problem}`)
  }
}

class ResendSender implements MailSender {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        // both parts, always — Resend assembles the multipart message, and
        // sending only one would decide for the recipient's client
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    })
    if (!res.ok) {
      // the caller turns this into a neutral answer; the detail is for logs
      const detail = await res.text().catch(() => '')
      throw new Error(`[mail] send failed (${res.status}): ${detail.slice(0, 200)}`)
    }
  }
}
