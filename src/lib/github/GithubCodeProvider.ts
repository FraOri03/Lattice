import { env, hasGithubOAuth } from '@/lib/env'

/**
 * GithubCodeProvider — GitHub integration for CODE DOCUMENTS ONLY.
 *
 * Scope contract (enforced here, documented in the README):
 *  - only Lattice code documents sync to GitHub — never rich documents,
 *    boards, assets, notes or spreadsheets
 *  - commits happen ONLY on explicit user action ("Sync code to GitHub")
 *  - the repo's default branch is protected by default: Lattice always
 *    commits to a feature branch and refuses to write to the default one
 *
 * Connection methods:
 *  - OAuth popup via the /api/github/oauth Vercel function (needs
 *    VITE_GITHUB_CLIENT_ID + server-side GITHUB_CLIENT_SECRET)
 *  - personal access token paste — works everywhere, including local dev
 *    with no OAuth app configured
 */

const API = 'https://api.github.com'
const TOKEN_KEY = 'lattice-github-token'
const USER_KEY = 'lattice-github-user'

export interface GithubUser {
  login: string
  name: string
  avatarUrl: string
}

export interface GithubRepo {
  fullName: string
  defaultBranch: string
  private: boolean
  description: string
}

export interface GithubTreeEntry {
  path: string
  type: 'blob' | 'tree'
  sha: string
  size?: number
}

export interface CommitFileSpec {
  path: string
  content: string
}

export class GithubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

class GithubCodeProvider {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  }

  isConnected(): boolean {
    return !!this.getToken()
  }

  getCachedUser(): GithubUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? (JSON.parse(raw) as GithubUser) : null
    } catch {
      return null
    }
  }

  disconnect(): void {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.getToken()
    if (!token) throw new GithubApiError(401, 'Not connected to GitHub')
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.headers ?? {}),
      },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      throw new GithubApiError(res.status, body.message ?? `GitHub API ${res.status}`)
    }
    return (await res.json()) as T
  }

  /** Validate + store a personal access token; returns the user. */
  async connectWithToken(token: string): Promise<GithubUser> {
    const res = await fetch(`${API}/user`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token.trim()}`,
      },
    })
    if (!res.ok) {
      throw new GithubApiError(
        res.status,
        res.status === 401 ? 'Invalid token' : `GitHub rejected the token (${res.status})`,
      )
    }
    const data = (await res.json()) as {
      login: string
      name: string | null
      avatar_url: string
    }
    const user: GithubUser = {
      login: data.login,
      name: data.name ?? data.login,
      avatarUrl: data.avatar_url,
    }
    localStorage.setItem(TOKEN_KEY, token.trim())
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    return user
  }

  /**
   * OAuth popup flow through the /api/github/oauth serverless function.
   * Only available when VITE_GITHUB_CLIENT_ID is configured.
   */
  connectWithOAuth(): Promise<GithubUser> {
    if (!hasGithubOAuth) {
      return Promise.reject(
        new Error('GitHub OAuth is not configured — connect with a personal access token instead'),
      )
    }
    const state = Math.random().toString(36).slice(2)
    const redirect = `${window.location.origin}/api/github/oauth`
    const url =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(env.githubClientId)}` +
      `&scope=repo&state=${state}&redirect_uri=${encodeURIComponent(redirect)}`
    const popup = window.open(url, 'lattice-github-oauth', 'width=600,height=760')
    if (!popup) return Promise.reject(new Error('Popup blocked — allow popups and retry'))

    return new Promise<GithubUser>((resolve, reject) => {
      const cleanup = () => {
        window.removeEventListener('message', onMessage)
        clearInterval(watchdog)
      }
      const onMessage = (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return
        const data = e.data as { type?: string; token?: string; state?: string; error?: string }
        if (data?.type !== 'lattice-github-oauth') return
        cleanup()
        if (data.error || !data.token || data.state !== state) {
          reject(new Error(data.error || 'GitHub sign-in failed'))
          return
        }
        this.connectWithToken(data.token).then(resolve, reject)
      }
      const watchdog = setInterval(() => {
        if (popup.closed) {
          cleanup()
          reject(new Error('GitHub sign-in was cancelled'))
        }
      }, 800)
      window.addEventListener('message', onMessage)
    })
  }

  /* ---------------- repo browsing ---------------- */

  async listRepos(): Promise<GithubRepo[]> {
    const repos = await this.request<
      { full_name: string; default_branch: string; private: boolean; description: string | null }[]
    >('/user/repos?sort=pushed&per_page=100')
    return repos.map((r) => ({
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      private: r.private,
      description: r.description ?? '',
    }))
  }

  async listBranches(repo: string): Promise<string[]> {
    const branches = await this.request<{ name: string }[]>(
      `/repos/${repo}/branches?per_page=100`,
    )
    return branches.map((b) => b.name)
  }

  /** Full recursive file tree of a branch (blobs only). */
  async getTree(repo: string, branch: string): Promise<GithubTreeEntry[]> {
    const ref = await this.request<{ object: { sha: string } }>(
      `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${branch}`)}`,
    )
    const commit = await this.request<{ tree: { sha: string } }>(
      `/repos/${repo}/git/commits/${ref.object.sha}`,
    )
    const tree = await this.request<{ tree: GithubTreeEntry[]; truncated: boolean }>(
      `/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`,
    )
    return tree.tree.filter((e) => e.type === 'blob')
  }

  /** Text content of one file at a branch head. */
  async getFileText(repo: string, branch: string, path: string): Promise<string> {
    const data = await this.request<{ content: string; encoding: string }>(
      `/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
    )
    if (data.encoding !== 'base64') throw new Error(`Unexpected encoding for ${path}`)
    const bin = atob(data.content.replace(/\n/g, ''))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  /* ---------------- committing (explicit user action only) ---------------- */

  /**
   * Commit files to a feature branch via the Git Data API, creating the
   * branch from the default branch when it doesn't exist yet. Refuses to
   * write to the default branch — that path stays protected for a future
   * pull-request flow.
   */
  async commitFiles(
    repo: string,
    branch: string,
    defaultBranch: string,
    files: CommitFileSpec[],
    message: string,
  ): Promise<{ commitSha: string; branchCreated: boolean; url: string }> {
    if (branch === defaultBranch) {
      throw new Error(
        `"${defaultBranch}" is protected — Lattice only commits to feature branches`,
      )
    }
    if (!files.length) throw new Error('Nothing selected to commit')

    // head of the target branch, creating it from the default branch if new
    let branchCreated = false
    let headSha: string
    try {
      const ref = await this.request<{ object: { sha: string } }>(
        `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${branch}`)}`,
      )
      headSha = ref.object.sha
    } catch (err) {
      if (!(err instanceof GithubApiError && err.status === 404)) throw err
      const base = await this.request<{ object: { sha: string } }>(
        `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${defaultBranch}`)}`,
      )
      await this.request(`/repos/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
      })
      headSha = base.object.sha
      branchCreated = true
    }

    const headCommit = await this.request<{ tree: { sha: string } }>(
      `/repos/${repo}/git/commits/${headSha}`,
    )
    const newTree = await this.request<{ sha: string }>(`/repos/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: headCommit.tree.sha,
        tree: files.map((f) => ({
          path: f.path,
          mode: '100644',
          type: 'blob',
          content: f.content,
        })),
      }),
    })
    const newCommit = await this.request<{ sha: string }>(`/repos/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: newTree.sha,
        parents: [headSha],
      }),
    })
    await this.request(`/repos/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommit.sha }),
    })
    return {
      commitSha: newCommit.sha,
      branchCreated,
      url: `https://github.com/${repo}/commits/${branch}`,
    }
  }
}

/** Link info stored on a code document (metadata.github). */
export interface CodeGithubLink {
  repo: string
  branch: string
  path: string
}

export function codeGithubLink(metadata: Record<string, unknown>): CodeGithubLink | null {
  const g = metadata.github as CodeGithubLink | undefined
  return g && typeof g.repo === 'string' && typeof g.path === 'string' ? g : null
}

export const githubProvider = new GithubCodeProvider()
