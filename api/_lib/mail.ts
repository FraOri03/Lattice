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

/** True when every character can appear literally in a header. */
function isPrintableAscii(value: string): boolean {
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp < 0x20 || cp > 0x7e) return false
  }
  return true
}

/**
 * RFC 5322 `specials`: a display name containing one of these is not an atom
 * sequence, and has to be a quoted string or it changes what the header MEANS.
 * A comma is the worst of them — `Ori, Francesco <a@b.com>` is not a name, it
 * is two addresses, the first of which is malformed.
 */
const SPECIALS = /[()<>[\]:;@\\,."]/

/** One RFC 2047 encoded word, which is plain ASCII whatever went in. */
function encodedWord(part: string): string {
  return `=?UTF-8?B?${Buffer.from(part, 'utf8').toString('base64')}?=`
}

/**
 * A display name as a header may carry it: quoted when it holds specials,
 * encoded when it holds anything that is not printable ASCII.
 *
 * Encoding is per code point, not per byte, so a chunk boundary never lands
 * inside a character; 45 bytes keeps each word under the 75-char limit
 * (base64 is 4/3, plus 12 characters of wrapper).
 */
function headerName(name: string): string {
  if (!isPrintableAscii(name)) {
    const words: string[] = []
    let chunk = ''
    for (const ch of name) {
      if (chunk && Buffer.byteLength(chunk + ch, 'utf8') > 45) {
        words.push(encodedWord(chunk))
        chunk = ''
      }
      chunk += ch
    }
    if (chunk) words.push(encodedWord(chunk))
    return words.join(' ')
  }
  if (SPECIALS.test(name)) return `"${name.replace(/([\\"])/g, '\\$1')}"`
  return name
}

/** The display name as a person meant it: no quoting, no escapes. */
function plainName(raw: string): string {
  let out = unwrap(raw.trim()).replace(/\\(.)/g, '$1').trim()
  // a quote with no partner cannot be quoting anything — it is half of a
  // paste, and no one's name begins with it
  out = out.replace(/^["'`]+|["'`]+$/g, '').trim()
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
 * documented line. Newlines and doubled spaces — the other thing a paste
 * carries in — collapse, because a header value cannot hold them either.
 *
 * ## And then the DISPLAY NAME, which is the same bug one layer in
 *
 * Stripping the quotes was not enough, because the half of the value nobody
 * thinks of as syntax is syntax too. `Lattice, Ori <no-reply@example.com>`
 * looks like a name and an address; to a mail parser the comma ends the
 * first address of a list, and Resend answers the identical bare 422. So
 * does an accented or em-dashed name, which is not ASCII and cannot travel
 * in a header literally.
 *
 * Both are fixable HERE, and are fixed rather than reported: a name is
 * quoted when it needs quoting and encoded (RFC 2047) when it is not plain
 * ASCII, so the value an operator typed by hand — which is correct as a
 * NAME, and only wrong as a header — sends instead of failing forever. The
 * address itself is left exactly as written: it is the part no rewriting can
 * guess at.
 */
export function normaliseFrom(raw: string): string {
  const flat = unwrap(raw.trim()).replace(/\s+/g, ' ').trim()
  if (!flat.endsWith('>')) return flat
  const open = flat.lastIndexOf('<')
  if (open < 0) return flat
  const address = flat.slice(open + 1, -1).trim()
  const name = plainName(flat.slice(0, open))
  // `<a@b.com>` alone is a legal header, but the bare form is the one every
  // provider example shows and the one that survives a copy out of a log
  if (!name) return address
  return `${headerName(name)} <${address}>`
}

/**
 * An address, strictly enough to catch what Resend catches.
 *
 * Loose was the old failure: a check that accepted everything the provider
 * then refused turned a typo into a 422 — one round trip, one rate-limit
 * slot and one row in `mail_sends` later, with an error naming no variable.
 * Dots may separate atoms and may not lead, trail or double; a domain is
 * labels and a real TLD, so `no-reply@localhost` and `a@-x.com` stop here.
 */
const ATOM = String.raw`[^\s<>@,;:"\\.]+`
const LOCAL = `${ATOM}(?:\\.${ATOM})*`
const LABEL = String.raw`[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?`
const DOMAIN = `(?:${LABEL}\\.)+[A-Za-z]{2,}`
const ADDRESS = `${LOCAL}@${DOMAIN}`
const BARE = new RegExp(`^${ADDRESS}$`)
/** The name has been through `headerName`, so only the address is in doubt. */
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
  // the value itself, because "MAIL_FROM is wrong" and the settings page
  // showing something that looks right is the whole of this bug: an operator
  // compares two strings in a second and guesses for an afternoon
  return (
    `MAIL_FROM is not a valid From address (Lattice reads it as: ${from}). ` +
    'It has to be name@example.com or Name <name@example.com>, ' +
    'on a domain verified with Resend.'
  )
}

/** The provider's sentence, out of whatever shape the body arrived in. */
function providerMessage(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      const message = (parsed as { message: unknown }).message
      if (typeof message === 'string' && message.trim()) return message.trim()
    }
  } catch {
    // not JSON: the raw body is still the most informative thing there is
  }
  return body.trim()
}

/** A refusal whose message already names the fix, and names it better. */
const SELF_EXPLAINING = /verify a domain|resend\.com\/domains|not verified|testing emails/i

/**
 * A refusal the provider makes about this DEPLOYMENT, not about this message.
 *
 * An unverified domain, the sandbox that only delivers to the account's own
 * address, a key that is not a key, a `From` the parser will not take: none of
 * them touched a mailbox, all of them will fail identically on the next
 * attempt, and none of them is fixable by the person who pressed the button.
 *
 * The distinction is not cosmetic — see `deliver` in `api/invitations.ts`,
 * where it decides whether the hour's mail allowance is spent.
 */
export function isConfigurationRejection(status: number, said: string): boolean {
  if (status === 401 || status === 403) return true
  // a 422 can be about `from` (ours) or `to` (the address just typed)
  return status === 422 && /\bfrom\b/i.test(said)
}

/** Thrown when the provider answered, and said no. */
export class MailRejected extends Error {
  override readonly name = 'MailRejected'
  constructor(
    readonly status: number,
    /** True when this deployment is misconfigured — not this message. */
    readonly configuration: boolean,
    message: string,
  ) {
    super(message)
  }
}

/** Whether a thrown value is a refusal about configuration. */
export function isConfigurationFailure(err: unknown): boolean {
  return err instanceof MailRejected && err.configuration
}

/**
 * A refusal, as something the one person who can fix it can act on.
 *
 * Two failure modes, and the fix is opposite in each. When the provider only
 * names a field — 422 ``Invalid `from` field`` — it never quotes the value
 * back, so the sender reads a complaint about a string they have never seen
 * next to a settings page showing an address that looks correct: the value
 * Lattice actually sent goes in, and the mismatch becomes visible instead of
 * deduced. When the provider names the fix itself ("verify a domain at
 * resend.com/domains"), nothing added here is worth as much as its own
 * sentence — and padding it is what pushes the useful half past the length
 * the toast can hold, which is how "please verify a do" reached a user.
 */
export function explainRejection(status: number, body: string, from: string): string {
  const said = providerMessage(body)
  const head = `[mail] send failed (${status})`
  if (SELF_EXPLAINING.test(said)) return `${head}: ${said.slice(0, 260)}`
  if (isConfigurationRejection(status, said)) {
    return `${head}: the provider refused the From address — Lattice sent MAIL_FROM as: ${from} — ${said.slice(0, 140)}`
  }
  return `${head}: ${said.slice(0, 200)}`
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
      const detail = await res.text().catch(() => '')
      const said = providerMessage(detail.slice(0, 400))
      throw new MailRejected(
        res.status,
        isConfigurationRejection(res.status, said),
        explainRejection(res.status, detail.slice(0, 400), this.from),
      )
    }
  }
}
