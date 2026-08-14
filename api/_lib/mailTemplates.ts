import type { Locale } from '../../src/types/model.js'
import type { CollabRole } from '../../src/types/collab.js'
import { OTP_TTL_MS } from '../../src/types/otp.js'
import type { MailMessage } from './mail.js'

/**
 * What a Lattice message looks like (Phase 18.2, #89).
 *
 * ## Why these are HTML now
 *
 * 17.3 sent plain text on purpose, and the reason it gave was sound: an
 * HTML mail asking for a code is the shape of every phishing message ever
 * sent. 18.2 reverses that, so the concern is answered rather than dropped.
 *
 *  - **Both parts, always.** The plain text 17.3 wrote is still the `text`
 *    part and still stands on its own. A client that strips markup shows
 *    exactly what it showed before.
 *  - **The code mail has no links and no buttons.** Digits and a deadline,
 *    nothing to click. The single most reliable phishing tell is a mail
 *    that wants you to follow it somewhere; this one never does.
 *  - **Images are decoration.** The mark is an `<img>` and every fact is
 *    text, so a client with images blocked loses nothing but the logo.
 *  - **Nothing is loaded from anywhere but this deployment.** No tracking
 *    pixel, no web font, no CDN — the only remote asset is the mark, served
 *    by the same origin that sent the invitation.
 *
 * ## Layout
 *
 * Tables and inline styles, because Outlook still parses mail with Word.
 * The `<style>` block carries the dark-mode palette only: clients that drop
 * it fall back to the light one, which is the base and is always complete.
 */

export type MailLocale = Locale

/* ---------------- escaping ---------------- */

/**
 * Everything interpolated goes through here.
 *
 * A project name and a display name are written by a member of the project,
 * which is exactly the level of trust that requires escaping: the mail is
 * read by someone who is not in the project yet and cannot judge it.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* ---------------- palette ---------------- */

const C = {
  page: '#f6f7f9',
  card: '#ffffff',
  ink: '#14161a',
  muted: '#6b7280',
  border: '#e6e8eb',
  brand: '#0d99ff',
  brandInk: '#ffffff',
  soft: '#f2f4f7',
} as const

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace"

/* ---------------- copy ---------------- */

const ROLE_NAME: Record<MailLocale, Record<CollabRole, string>> = {
  en: {
    owner: 'Owner',
    admin: 'Admin',
    editor: 'Editor',
    commenter: 'Commenter',
    viewer: 'Viewer',
  },
  it: {
    owner: 'Proprietario',
    admin: 'Amministratore',
    editor: 'Editor',
    commenter: 'Commentatore',
    viewer: 'Visualizzatore',
  },
}

const COPY = {
  en: {
    codeSubject: (code: string) => `${code} is your Lattice sign-in code`,
    codeHeading: 'Your sign-in code',
    codeLead: 'Type these six digits into Lattice to sign in.',
    codeExpiry: (minutes: number) =>
      `It expires in ${minutes} minutes and can be used once.`,
    codeSafety:
      'If you did not ask to sign in, you can ignore this message — the code is useless without access to this mailbox, and nobody has been told whether this address has an account.',
    codeNoLink: 'Lattice will never ask you for this code by e-mail, chat or phone.',

    inviteSubject: (who: string, project: string) =>
      `${who} invited you to ${project} on Lattice`,
    inviteHeading: 'You have been invited',
    inviteLead: (who: string, project: string, role: string) =>
      `${who} invited you to collaborate on ${project} as ${role}.`,
    inviteCta: 'Open the invitation',
    inviteLinkFallback: 'If the button does not work, copy this address into your browser:',
    labelProject: 'Project',
    labelRole: 'Role',
    labelInvitedBy: 'Invited by',
    labelWorkspace: 'Workspace',
    labelExpires: 'Expires',
    inviteSafety: (who: string) =>
      `If you do not recognise ${who}, ignore this message and do not open the link. Nothing happens until you open it and sign in, and the invitation stops working on the date above.`,
    footer: 'Sent by Lattice because someone invited this address to a project.',
    footerCode: 'Sent by Lattice because someone asked to sign in with this address.',
  },
  it: {
    codeSubject: (code: string) => `${code} è il tuo codice di accesso a Lattice`,
    codeHeading: 'Il tuo codice di accesso',
    codeLead: 'Digita queste sei cifre in Lattice per accedere.',
    codeExpiry: (minutes: number) =>
      `Scade tra ${minutes} minuti e può essere usato una volta sola.`,
    codeSafety:
      'Se non hai chiesto tu di accedere, ignora questo messaggio: il codice non serve a nulla senza accesso a questa casella, e a nessuno è stato detto se questo indirizzo ha un account.',
    codeNoLink:
      'Lattice non ti chiederà mai questo codice per e-mail, chat o telefono.',

    inviteSubject: (who: string, project: string) =>
      `${who} ti ha invitato a ${project} su Lattice`,
    inviteHeading: 'Hai ricevuto un invito',
    inviteLead: (who: string, project: string, role: string) =>
      `${who} ti ha invitato a collaborare a ${project} come ${role}.`,
    inviteCta: 'Apri l’invito',
    inviteLinkFallback:
      'Se il pulsante non funziona, copia questo indirizzo nel browser:',
    labelProject: 'Progetto',
    labelRole: 'Ruolo',
    labelInvitedBy: 'Invitato da',
    labelWorkspace: 'Spazio di lavoro',
    labelExpires: 'Scade il',
    inviteSafety: (who: string) =>
      `Se non riconosci ${who}, ignora questo messaggio e non aprire il link. Non succede nulla finché non lo apri e accedi, e l’invito smette di funzionare alla data indicata sopra.`,
    footer: 'Inviato da Lattice perché qualcuno ha invitato questo indirizzo a un progetto.',
    footerCode:
      'Inviato da Lattice perché qualcuno ha chiesto di accedere con questo indirizzo.',
  },
}

/** Unknown or absent locales fall back to English rather than to nothing. */
function copyFor(locale: string | undefined): (typeof COPY)['en'] {
  return locale === 'it' ? COPY.it : COPY.en
}

export function normaliseLocale(value: unknown): MailLocale {
  return value === 'it' ? 'it' : 'en'
}

/* ---------------- layout pieces ---------------- */

interface ShellOptions {
  locale: MailLocale
  /** The deployment that is sending, e.g. `https://lattice.example.com`. */
  origin: string
  title: string
  /** The line inboxes show next to the subject. */
  preheader: string
  body: string
  footer: string
}

/**
 * The frame every message shares: mark, wordmark, card, footer.
 *
 * One shell rather than two templates that happen to look similar — the
 * point of a house style is that it cannot drift between messages.
 */
function shell(o: ShellOptions): string {
  const logo = `${o.origin}/brand/lattice-mark.png`
  return `<!doctype html>
<html lang="${o.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(o.title)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .lt-page { background: #0d0e11 !important; }
    .lt-card { background: #16181d !important; border-color: #262a31 !important; }
    .lt-ink { color: #f2f3f5 !important; }
    .lt-muted { color: #9aa1ac !important; }
    .lt-soft { background: #1d2027 !important; border-color: #2c313a !important; }
    .lt-rule { border-color: #262a31 !important; }
  }
</style>
</head>
<body class="lt-page" style="margin:0;padding:0;background:${C.page};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lt-page" style="background:${C.page};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="lt-card" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:14px;">
        <tr>
          <td style="padding:28px 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:10px;" valign="middle">
                  <img src="${logo}" width="27" height="32" alt="" style="display:block;border:0;">
                </td>
                <td valign="middle" class="lt-ink" style="font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.2px;color:${C.ink};">Lattice</td>
              </tr>
            </table>
          </td>
        </tr>
        ${o.body}
        <tr>
          <td class="lt-rule" style="padding:8px 32px 28px 32px;border-top:1px solid ${C.border};">
            <p class="lt-muted" style="margin:20px 0 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">${escapeHtml(o.footer)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/** A heading and its lead paragraph. */
function heading(title: string, lead: string): string {
  return `<tr>
  <td style="padding:12px 32px 0 32px;">
    <h1 class="lt-ink" style="margin:0 0 10px 0;font-family:${FONT};font-size:22px;line-height:28px;font-weight:700;letter-spacing:-0.3px;color:${C.ink};">${escapeHtml(title)}</h1>
    <p class="lt-muted" style="margin:0;font-family:${FONT};font-size:14px;line-height:21px;color:${C.muted};">${lead}</p>
  </td>
</tr>`
}

/**
 * The six digit boxes — the same shape the code field has on screen, so the
 * mail and the app visibly belong to each other.
 *
 * A table of cells rather than letter-spacing on a string: spacing collapses
 * differently in every client, and a code that reads as five digits in one
 * of them is worse than no styling at all.
 */
function digitBoxes(code: string): string {
  const cells = [...code]
    .map(
      (digit) =>
        `<td class="lt-soft lt-ink" align="center" width="46" style="width:46px;height:56px;background:${C.soft};border:1px solid ${C.border};border-radius:10px;font-family:${MONO};font-size:26px;font-weight:700;color:${C.ink};">${escapeHtml(digit)}</td>`,
    )
    .join(`<td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`)
  return `<tr>
  <td style="padding:22px 32px 4px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>
  </td>
</tr>`
}

/** Label/value rows — the facts, laid out rather than buried in a sentence. */
function facts(rows: { label: string; value: string }[]): string {
  const body = rows
    .map(
      (row) => `<tr>
        <td class="lt-muted" style="padding:7px 12px 7px 0;font-family:${FONT};font-size:13px;line-height:19px;color:${C.muted};white-space:nowrap;" valign="top">${escapeHtml(row.label)}</td>
        <td class="lt-ink" style="padding:7px 0;font-family:${FONT};font-size:13px;line-height:19px;font-weight:600;color:${C.ink};" valign="top">${escapeHtml(row.value)}</td>
      </tr>`,
    )
    .join('')
  return `<tr>
  <td style="padding:18px 32px 0 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lt-soft" style="background:${C.soft};border:1px solid ${C.border};border-radius:12px;">
      <tr><td style="padding:6px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
      </td></tr>
    </table>
  </td>
</tr>`
}

/** The one call to action an invitation gets. The code mail gets none. */
function button(href: string, label: string): string {
  const safe = escapeHtml(href)
  return `<tr>
  <td style="padding:22px 32px 0 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" bgcolor="${C.brand}" style="border-radius:10px;">
        <a href="${safe}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;color:${C.brandInk};text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
      </td></tr>
    </table>
  </td>
</tr>`
}

/** A paragraph of small print. */
function note(text: string, extra = ''): string {
  return `<tr>
  <td style="padding:20px 32px 0 32px;">
    <p class="lt-muted" style="margin:0;font-family:${FONT};font-size:12.5px;line-height:19px;color:${C.muted};">${escapeHtml(text)}</p>
    ${extra}
  </td>
</tr>`
}

/* ---------------- dates ---------------- */

/**
 * A deadline a human can act on, in UTC and saying so.
 *
 * The recipient's timezone is not knowable from an address, and a time
 * printed without a zone is a time somebody will read as their own.
 */
export function formatDeadline(at: number, locale: MailLocale): string {
  const formatted = new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(at))
  return `${formatted} UTC`
}

/* ---------------- the sign-in code ---------------- */

export interface CodeMailOptions {
  locale?: MailLocale
  /** Where the mark is served from; the mail has no other remote asset. */
  origin?: string
}

/**
 * The sign-in code message.
 *
 * It names no account and confirms nothing. Someone who receives this
 * without asking for it learns only that somebody typed their address —
 * not whether that address has a Lattice account.
 */
export function signInCodeMessage(
  to: string,
  code: string,
  options: CodeMailOptions = {},
): MailMessage {
  const locale = normaliseLocale(options.locale)
  const t = copyFor(locale)
  const minutes = Math.round(OTP_TTL_MS / 60000)

  const text = [
    `${t.codeHeading}: ${code}`,
    '',
    t.codeExpiry(minutes),
    '',
    t.codeSafety,
    '',
    t.codeNoLink,
  ].join('\n')

  const html = shell({
    locale,
    origin: options.origin ?? '',
    title: t.codeHeading,
    preheader: t.codeExpiry(minutes),
    footer: t.footerCode,
    body: [
      heading(t.codeHeading, escapeHtml(t.codeLead)),
      digitBoxes(code),
      note(t.codeExpiry(minutes)),
      note(t.codeSafety),
      note(t.codeNoLink),
    ].join(''),
  })

  return { to, subject: t.codeSubject(code), text, html }
}

/* ---------------- the invitation ---------------- */

export interface InvitationMailOptions {
  to: string
  projectName: string
  role: CollabRole
  inviterName: string
  inviterEmail: string
  expiresAt: number
  /** The absolute invite URL, including its token. */
  link: string
  /** The deployment sending it — also the workspace the mail names. */
  origin: string
  locale?: MailLocale
}

/**
 * The invitation message.
 *
 * It states every fact #89 asks for — who, which project, which role, which
 * workspace, until when — and then says what to do if the recipient does not
 * recognise the sender, which is the only instruction that matters to
 * somebody who was not expecting this.
 */
export function invitationMessage(options: InvitationMailOptions): MailMessage {
  const locale = normaliseLocale(options.locale)
  const t = copyFor(locale)
  const role = ROLE_NAME[locale][options.role]
  const who = options.inviterName || options.inviterEmail
  const workspace = workspaceName(options.origin)
  const deadline = formatDeadline(options.expiresAt, locale)

  const text = [
    t.inviteLead(who, options.projectName, role),
    '',
    `${t.labelProject}: ${options.projectName}`,
    `${t.labelRole}: ${role}`,
    `${t.labelInvitedBy}: ${who} <${options.inviterEmail}>`,
    `${t.labelWorkspace}: ${workspace}`,
    `${t.labelExpires}: ${deadline}`,
    '',
    `${t.inviteCta}: ${options.link}`,
    '',
    t.inviteSafety(who),
  ].join('\n')

  const fallback = `<p class="lt-muted" style="margin:10px 0 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};word-break:break-all;">${escapeHtml(options.link)}</p>`

  const html = shell({
    locale,
    origin: options.origin,
    title: t.inviteHeading,
    preheader: t.inviteLead(who, options.projectName, role),
    footer: t.footer,
    body: [
      heading(
        t.inviteHeading,
        escapeHtml(t.inviteLead(who, options.projectName, role)),
      ),
      facts([
        { label: t.labelProject, value: options.projectName },
        { label: t.labelRole, value: role },
        { label: t.labelInvitedBy, value: `${who} <${options.inviterEmail}>` },
        { label: t.labelWorkspace, value: workspace },
        { label: t.labelExpires, value: deadline },
      ]),
      button(options.link, t.inviteCta),
      note(t.inviteLinkFallback, fallback),
      note(t.inviteSafety(who)),
    ].join(''),
  })

  return {
    to: options.to,
    subject: t.inviteSubject(who, options.projectName),
    text,
    html,
  }
}

/** The host, which is what a recipient recognises as "where this is". */
export function workspaceName(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}
