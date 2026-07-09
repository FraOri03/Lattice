/**
 * Vercel serverless function: GitHub OAuth code → token exchange.
 *
 * GitHub's token endpoint rejects browser CORS requests, and the exchange
 * needs the client secret — so this tiny function is the only server-side
 * piece of Lattice. It receives the OAuth redirect, exchanges the code
 * using GITHUB_CLIENT_SECRET (server-side env var, never bundled), and
 * hands the token back to the opener window via postMessage.
 *
 * Required env vars (Vercel project settings):
 *   VITE_GITHUB_CLIENT_ID  — OAuth app client id (shared with the client)
 *   GITHUB_CLIENT_SECRET   — OAuth app client secret (server-only)
 */

interface Req {
  query: Record<string, string | string[] | undefined>
}
interface Res {
  status(code: number): Res
  setHeader(name: string, value: string): Res
  send(body: string): void
}

function page(script: string): string {
  return `<!doctype html><html><body><script>${script}</script>
<p style="font-family:sans-serif;color:#555">You can close this window.</p></body></html>`
}

function postBack(payload: Record<string, string>): string {
  return page(
    `if (window.opener) { window.opener.postMessage(${JSON.stringify({
      type: 'lattice-github-oauth',
      ...payload,
    })}, window.location.origin); } window.close();`,
  )
}

export default async function handler(req: Req, res: Res): Promise<void> {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const code = first(req.query.code)
  const state = first(req.query.state) ?? ''
  const clientId = process.env.VITE_GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')

  if (!clientId || !clientSecret) {
    res.status(500).send(
      postBack({ error: 'GitHub OAuth is not configured on the server', state }),
    )
    return
  }
  if (!code) {
    res.status(400).send(postBack({ error: 'Missing OAuth code', state }))
    return
  }

  try {
    const ghRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })
    const data = (await ghRes.json()) as {
      access_token?: string
      error_description?: string
    }
    if (!data.access_token) {
      res.status(400).send(
        postBack({ error: data.error_description ?? 'Token exchange failed', state }),
      )
      return
    }
    res.status(200).send(postBack({ token: data.access_token, state }))
  } catch {
    res.status(502).send(postBack({ error: 'Could not reach GitHub', state }))
  }
}
