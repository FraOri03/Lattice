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
}

/** The transport for this deployment, or null when it has none. */
export function mailSender(env: NodeJS.ProcessEnv = process.env): MailSender | null {
  const apiKey = env.RESEND_API_KEY ?? ''
  const from = env.MAIL_FROM ?? ''
  if (!apiKey || !from) return null
  return new ResendSender(apiKey, from)
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
