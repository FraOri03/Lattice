import { describe, expect, it, vi } from 'vitest'
import { fromProblem, mailSender, normaliseFrom } from './mail.js'

/**
 * The transport, and mostly one bug in it: `MAIL_FROM` set correctly and
 * rejected anyway.
 *
 * A deployment whose settings read `"Lattice <no-reply@example.com>"` — the
 * exact string this repo documents, because in a `.env` file the quotes are
 * the file format — sent the quotes to Resend, which answered 422 `Invalid
 * \`from\` field`. Every invitation was created, none was delivered, and the
 * settings page showed a value that looked right.
 */

const OK = 'Lattice <no-reply@example.com>'

describe('normaliseFrom', () => {
  it('leaves an address that is already right alone', () => {
    expect(normaliseFrom(OK)).toBe(OK)
    expect(normaliseFrom('no-reply@example.com')).toBe('no-reply@example.com')
  })

  it('strips the quotes a pasted .env line brings with it', () => {
    expect(normaliseFrom(`"${OK}"`)).toBe(OK)
    expect(normaliseFrom(`'${OK}'`)).toBe(OK)
    expect(normaliseFrom('`no-reply@example.com`')).toBe('no-reply@example.com')
  })

  it('strips typographic quotes, which a document editor substitutes', () => {
    const open = String.fromCodePoint(0x201c)
    const close = String.fromCodePoint(0x201d)
    expect(normaliseFrom(`${open}${OK}${close}`)).toBe(OK)
  })

  it('strips a pair wrapped twice', () => {
    expect(normaliseFrom(`""${OK}""`)).toBe(OK)
  })

  it('keeps a quoted display name, which is valid and ends in a bracket', () => {
    // only a matching pair around the WHOLE value is quoting; this is a name
    const named = '"Ori, Francesco" <no-reply@example.com>'
    expect(normaliseFrom(named)).toBe(named)
  })

  it('collapses the newlines and doubled spaces a paste carries in', () => {
    expect(normaliseFrom('  Lattice   <no-reply@example.com>\n')).toBe(OK)
  })

  it('does not invent an address out of an empty value', () => {
    expect(normaliseFrom('')).toBe('')
    expect(normaliseFrom('  ""  ')).toBe('')
  })
})

describe('fromProblem', () => {
  it('accepts both shapes the provider accepts', () => {
    expect(fromProblem(OK)).toBeNull()
    expect(fromProblem('no-reply@example.com')).toBeNull()
    expect(fromProblem('"Ori, Francesco" <no-reply@mail.example.co.uk>')).toBeNull()
  })

  it('names the variable when the value is not an address at all', () => {
    expect(fromProblem('Lattice')).toContain('MAIL_FROM')
    expect(fromProblem('no-reply@localhost')).toContain('MAIL_FROM')
    expect(fromProblem('Lattice no-reply@example.com')).toContain('MAIL_FROM')
  })
})

describe('mailSender', () => {
  const env = (over: Record<string, string>) =>
    ({ RESEND_API_KEY: 're_test', MAIL_FROM: OK, ...over }) as NodeJS.ProcessEnv

  it('is null when nothing is configured, which is a valid state', () => {
    expect(mailSender({} as NodeJS.ProcessEnv)).toBeNull()
    expect(mailSender(env({ RESEND_API_KEY: '' }))).toBeNull()
    expect(mailSender(env({ MAIL_FROM: '   ' }))).toBeNull()
  })

  it('sends the normalised address, not the one the settings hold', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      text: async () => '',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const sender = mailSender(env({ MAIL_FROM: `"${OK}"\n`, RESEND_API_KEY: ' re_test ' }))
    await sender!.send({ to: 'grace@example.com', subject: 'Hi', text: 'Hi' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(JSON.parse(String(init.body)).from).toBe(OK)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
  })

  it('reports a broken MAIL_FROM as broken mail, not as absent mail', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    // not null: "this deployment has no mail backend" is what the share
    // dialog says for null, and it would send the one person who can fix
    // this looking for a key that is already there
    const sender = mailSender(env({ MAIL_FROM: 'Lattice' }))
    expect(sender).not.toBeNull()

    await expect(
      sender!.send({ to: 'grace@example.com', subject: 'Hi', text: 'Hi' }),
    ).rejects.toThrow(/MAIL_FROM/)
    // and it costs no request, no rate-limit slot and no row in mail_sends
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hands the provider’s own words up when the provider refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        text: async () => '{"message":"The example.com domain is not verified."}',
      })),
    )
    const sender = mailSender(env({}))
    await expect(
      sender!.send({ to: 'grace@example.com', subject: 'Hi', text: 'Hi' }),
    ).rejects.toThrow(/403.*not verified/s)
  })
})
