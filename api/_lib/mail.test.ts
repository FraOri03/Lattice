import { describe, expect, it, vi } from 'vitest'
import {
  explainRejection,
  fromProblem,
  isConfigurationFailure,
  isConfigurationRejection,
  mailSender,
  normaliseFrom,
} from './mail.js'

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

  /**
   * The second half of the same bug. Stripping the outer quotes left the
   * DISPLAY NAME untouched, and a display name is syntax too: a comma in it
   * ends the first address of a list, and Resend answers the identical bare
   * 422 for a value that reads perfectly to a human.
   */
  it('quotes a name whose punctuation would otherwise be syntax', () => {
    expect(normaliseFrom('Lattice, Ori <no-reply@example.com>')).toBe(
      '"Lattice, Ori" <no-reply@example.com>',
    )
    expect(normaliseFrom('Lattice: invito <no-reply@example.com>')).toBe(
      '"Lattice: invito" <no-reply@example.com>',
    )
    expect(normaliseFrom('Ori (Lattice) <no-reply@example.com>')).toBe(
      '"Ori (Lattice)" <no-reply@example.com>',
    )
  })

  it('encodes a name that cannot travel in a header literally', () => {
    // RFC 2047: the em dash and the accent are the ones a real name brings
    const dash = String.fromCodePoint(0x2014)
    expect(normaliseFrom(`Lattice ${dash} Ori <no-reply@example.com>`)).toBe(
      '=?UTF-8?B?TGF0dGljZSDigJQgT3Jp?= <no-reply@example.com>',
    )
    expect(normaliseFrom('Cognomé <no-reply@example.com>')).toBe(
      '=?UTF-8?B?Q29nbm9tw6k=?= <no-reply@example.com>',
    )
  })

  it('splits a long encoded name into words a header line can hold', () => {
    const dash = String.fromCodePoint(0x2014)
    const out = normaliseFrom(`${dash} ${'nome cognome '.repeat(6)}<no-reply@example.com>`)
    for (const word of out.slice(0, out.indexOf(' <')).split(' ')) {
      expect(word.length).toBeLessThanOrEqual(75)
    }
    expect(out.endsWith(' <no-reply@example.com>')).toBe(true)
  })

  it('drops a quote that has no partner rather than sending it', () => {
    // half a paste: the value looks quoted, but only one side survived
    expect(normaliseFrom('"Lattice <no-reply@example.com>')).toBe(
      'Lattice <no-reply@example.com>',
    )
  })

  it('keeps the address itself exactly as written', () => {
    // the one part no rewriting here can guess at
    expect(normaliseFrom('Lattice <No-Reply+invites@Example.com>')).toBe(
      'Lattice <No-Reply+invites@Example.com>',
    )
  })

  it('reduces a value that is only a name-less address to the bare form', () => {
    expect(normaliseFrom('<no-reply@example.com>')).toBe('no-reply@example.com')
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

  it('quotes the value back, which is the thing the settings page hides', () => {
    expect(fromProblem('Lattice <no-reply@lattice>')).toContain('no-reply@lattice')
  })

  /**
   * Loose was the old failure: everything the provider refuses was accepted
   * here, so a typo cost a round trip, a rate-limit slot and a row in
   * `mail_sends` before producing a 422 that named no variable.
   */
  it('stops the addresses the provider would have stopped', () => {
    expect(fromProblem('.no-reply@example.com')).toContain('MAIL_FROM')
    expect(fromProblem('no-reply.@example.com')).toContain('MAIL_FROM')
    expect(fromProblem('no..reply@example.com')).toContain('MAIL_FROM')
    expect(fromProblem('no-reply@-example.com')).toContain('MAIL_FROM')
    expect(fromProblem('no-reply@example.c')).toContain('MAIL_FROM')
    expect(fromProblem('no-reply@example.com.')).toContain('MAIL_FROM')
  })
})

describe('explainRejection', () => {
  const from = 'Lattice <no-reply@example.com>'

  it('says which value Lattice sent when the provider refuses the From', () => {
    const said = explainRejection(
      422,
      '{"statusCode":422,"name":"validation_error","message":"Invalid `from` field."}',
      from,
    )
    expect(said).toContain('422')
    expect(said).toContain(from)
    expect(said).toContain('Invalid `from` field.')
    // the JSON envelope is not a sentence anybody reads
    expect(said).not.toContain('statusCode')
  })

  it('points a domain refusal at the DNS work it actually needs', () => {
    const said = explainRejection(403, '{"message":"The example.com domain is not verified."}', from)
    expect(said).toMatch(/403.*not verified/s)
  })

  /**
   * The sandbox refusal, which is the one a deployment meets first and the
   * one that was arriving cut in half: "…please verify a do".
   *
   * Its own sentence names the fix, so nothing is added to it — padding is
   * exactly what pushed the useful half past the length a toast can hold.
   */
  it('keeps the whole of a refusal that names its own fix', () => {
    const sandbox =
      '{"statusCode":403,"name":"validation_error","message":"You can only send testing ' +
      'emails to your own email address (grace@example.com). To send emails to other ' +
      'recipients, please verify a domain at resend.com/domains, and change the `from` ' +
      'address to an email using this domain."}'
    const said = explainRejection(403, sandbox, from)
    expect(said).toContain('verify a domain at resend.com/domains')
    // and it still fits what the invitation endpoint will hand to a toast
    expect(said.replace(/^\[mail\]\s*/, '').length).toBeLessThanOrEqual(300)
  })

  it('hands up a body that is not JSON rather than losing it', () => {
    expect(explainRejection(500, '<html>upstream</html>', from)).toContain('upstream')
  })
})

describe('isConfigurationRejection', () => {
  it('knows a refusal about the deployment from one about the message', () => {
    expect(isConfigurationRejection(403, 'The domain is not verified.')).toBe(true)
    expect(isConfigurationRejection(401, 'API key is invalid')).toBe(true)
    expect(isConfigurationRejection(422, 'Invalid `from` field.')).toBe(true)
    // the recipient is not this deployment's configuration, and a 429 or a
    // 500 may well have touched a mailbox
    expect(isConfigurationRejection(422, 'Invalid `to` field.')).toBe(false)
    expect(isConfigurationRejection(429, 'Too many requests')).toBe(false)
    expect(isConfigurationRejection(500, 'Internal error')).toBe(false)
  })

  it('carries the answer on the thrown error, for the caller that pays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        text: async () => '{"message":"You can only send testing emails to your own address."}',
      })),
    )
    const sender = mailSender({
      RESEND_API_KEY: 're_test',
      MAIL_FROM: OK,
    } as NodeJS.ProcessEnv)
    const err = await sender!
      .send({ to: 'grace@example.com', subject: 'Hi', text: 'Hi' })
      .catch((e: unknown) => e)
    expect(isConfigurationFailure(err)).toBe(true)
  })

  it('does not excuse a transient failure from the ceiling', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, text: async () => 'Too many requests' })),
    )
    const sender = mailSender({
      RESEND_API_KEY: 're_test',
      MAIL_FROM: OK,
    } as NodeJS.ProcessEnv)
    const err = await sender!
      .send({ to: 'grace@example.com', subject: 'Hi', text: 'Hi' })
      .catch((e: unknown) => e)
    expect(isConfigurationFailure(err)).toBe(false)
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
