import { describe, expect, it } from 'vitest'
import {
  escapeHtml,
  formatDeadline,
  invitationMessage,
  normaliseLocale,
  signInCodeMessage,
  workspaceName,
} from './mailTemplates.js'

/**
 * The messages 18.2 sends, and the promises the HTML made to get here: both
 * parts always, no link in the code mail, and every interpolated value
 * escaped — because a project name is written by somebody in the project and
 * read by somebody who is not.
 */

const ORIGIN = 'https://lattice.example.com'
const DEADLINE = Date.UTC(2026, 7, 28, 9, 30)

const invite = (over: Partial<Parameters<typeof invitationMessage>[0]> = {}) =>
  invitationMessage({
    to: 'grace@example.com',
    projectName: 'Acme redesign',
    role: 'editor',
    inviterName: 'Ada Lovelace',
    inviterEmail: 'ada@example.com',
    expiresAt: DEADLINE,
    link: `${ORIGIN}/#invite=tok_123`,
    origin: ORIGIN,
    ...over,
  })

describe('both parts, always', () => {
  it('gives the sign-in code a text body that stands on its own', () => {
    const message = signInCodeMessage('ada@example.com', '123456', { origin: ORIGIN })
    expect(message.text).toContain('123456')
    expect(message.text).toContain('10 minutes')
    expect(message.html).toContain('<!doctype html>')
  })

  it('gives the invitation a text body carrying every fact and the link', () => {
    const message = invite()
    for (const fact of [
      'Acme redesign',
      'Editor',
      'Ada Lovelace',
      'lattice.example.com',
      `${ORIGIN}/#invite=tok_123`,
    ]) {
      expect(message.text).toContain(fact)
    }
  })
})

describe('the code mail has nothing to click', () => {
  it('contains no anchor at all', () => {
    const message = signInCodeMessage('ada@example.com', '123456', { origin: ORIGIN })
    // the single most reliable phishing tell is a mail that wants you to
    // follow it somewhere; this one never does
    expect(message.html).not.toMatch(/<a\s/i)
    expect(message.text).not.toContain('http')
  })

  it('shows the code as six separate boxes', () => {
    const html = signInCodeMessage('ada@example.com', '135790', { origin: ORIGIN }).html ?? ''
    const boxes = html.match(/class="lt-soft lt-ink"/g) ?? []
    expect(boxes).toHaveLength(6)
    for (const digit of '135790') expect(html).toContain(`>${digit}</td>`)
  })

  it('loads nothing but the mark, from the deployment that sent it', () => {
    const html = signInCodeMessage('ada@example.com', '123456', { origin: ORIGIN }).html ?? ''
    const remote = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1])
    expect(remote).toEqual([`${ORIGIN}/brand/lattice-mark.png`])
  })
})

describe('escaping', () => {
  it('escapes the five characters that matter', () => {
    expect(escapeHtml(`<&">'`)).toBe('&lt;&amp;&quot;&gt;&#39;')
  })

  it('never lets a project name become markup', () => {
    const message = invite({ projectName: '<script>alert(1)</script>' })
    expect(message.html).not.toContain('<script>')
    expect(message.html).toContain('&lt;script&gt;')
  })

  it('escapes the inviter as well, in the heading and in the facts', () => {
    const message = invite({ inviterName: 'Ada "<b>" Lovelace' })
    expect(message.html).not.toContain('<b>')
    expect(message.html).toContain('&lt;b&gt;')
  })

  it('escapes the link it puts in the button', () => {
    const message = invite({ link: `${ORIGIN}/#invite=a"onmouseover="x` })
    expect(message.html).not.toContain('onmouseover="x"')
    expect(message.html).toContain('&quot;onmouseover=&quot;x')
  })
})

describe('the invitation says what #89 asks it to say', () => {
  it('names sender, project, role, workspace and expiry', () => {
    const html = invite().html ?? ''
    expect(html).toContain('Acme redesign')
    expect(html).toContain('Editor')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('lattice.example.com')
    expect(html).toContain('28 August 2026')
  })

  it('tells a recipient who does not recognise the sender what to do', () => {
    expect(invite().text).toContain('do not recognise Ada Lovelace')
    expect(invite({ locale: 'it' }).text).toContain('non riconosci Ada Lovelace')
  })

  it('falls back to the address when the sender has no display name', () => {
    const message = invite({ inviterName: '' })
    expect(message.subject).toContain('ada@example.com')
  })
})

describe('localisation', () => {
  it('writes the subject in the chosen language', () => {
    expect(invite({ locale: 'en' }).subject).toBe(
      'Ada Lovelace invited you to Acme redesign on Lattice',
    )
    expect(invite({ locale: 'it' }).subject).toBe(
      'Ada Lovelace ti ha invitato a Acme redesign su Lattice',
    )
  })

  it('translates the role and the labels', () => {
    const html = invite({ locale: 'it', role: 'viewer' }).html ?? ''
    expect(html).toContain('Visualizzatore')
    expect(html).toContain('Spazio di lavoro')
  })

  it('marks the document language, so a screen reader reads it correctly', () => {
    expect(invite({ locale: 'it' }).html).toContain('<html lang="it">')
  })

  it('treats anything that is not Italian as English rather than as nothing', () => {
    expect(normaliseLocale('de')).toBe('en')
    expect(normaliseLocale(undefined)).toBe('en')
    expect(normaliseLocale('it')).toBe('it')
  })
})

describe('the deadline', () => {
  it('always names its timezone, because a bare time is read as local', () => {
    expect(formatDeadline(DEADLINE, 'en')).toBe('28 August 2026 at 09:30 UTC')
    expect(formatDeadline(DEADLINE, 'it')).toContain('UTC')
  })
})

describe('workspaceName', () => {
  it('is the host, which is what a recipient recognises', () => {
    expect(workspaceName('https://lattice.example.com/x')).toBe('lattice.example.com')
  })

  it('survives something that is not a URL', () => {
    expect(workspaceName('nonsense')).toBe('nonsense')
  })
})
