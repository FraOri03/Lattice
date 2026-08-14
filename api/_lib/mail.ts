import { OTP_TTL_MS } from '../../src/types/otp.js'

/**
 * Sending mail (Phase 17.3, #86).
 *
 * Lattice had no way to send an e-mail, and a one-time code nobody
 * receives is not a sign-in method. This is the smallest transport that
 * makes the flow real, and it is deliberately a SEAM rather than a
 * provider: Phase 18 owns invitation mail and will want templates, a
 * from-name per workspace and delivery tracking — all of which belong
 * behind this interface rather than in place of it.
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
 * returns null and the endpoint answers 501 saying exactly what is
 * missing — it never pretends to have sent something.
 */

export interface MailMessage {
  to: string
  subject: string
  text: string
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
        text: message.text,
      }),
    })
    if (!res.ok) {
      // the endpoint turns this into a neutral answer; the detail is for logs
      const detail = await res.text().catch(() => '')
      throw new Error(`[mail] send failed (${res.status}): ${detail.slice(0, 200)}`)
    }
  }
}

/**
 * The sign-in code message.
 *
 * Plain text on purpose. An HTML mail asking for a code is the shape of
 * every phishing message ever sent; a short plain one is both harder to
 * spoof convincingly and impossible to get wrong in a client that strips
 * markup.
 *
 * It names no account and confirms nothing. Someone who receives this
 * without asking for it learns only that somebody typed their address —
 * not whether that address has a Lattice account.
 */
export function signInCodeMessage(to: string, code: string): MailMessage {
  const minutes = Math.round(OTP_TTL_MS / 60000)
  return {
    to,
    subject: `${code} is your Lattice sign-in code`,
    text: [
      `Your Lattice sign-in code is ${code}.`,
      '',
      `It expires in ${minutes} minutes and can be used once.`,
      '',
      'If you did not ask to sign in, you can ignore this message —',
      'the code is useless without access to this mailbox, and nobody',
      'has been told whether this address has an account.',
    ].join('\n'),
  }
}
