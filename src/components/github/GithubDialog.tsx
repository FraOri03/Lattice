import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useActiveProject } from '@/lib/projects/ProjectStore'
import {
  codeGithubLink,
  githubProvider,
  type GithubRepo,
  type GithubTreeEntry,
  type GithubUser,
} from '@/lib/github/GithubCodeProvider'
import { hasGithubOAuth } from '@/lib/env'
import { extOf } from '@/lib/assets/detect'
import { isCodeExt, langForExt } from '@/lib/code/languages'
import { storage } from '@/lib/storage/StorageProvider'
import {
  IcBranch,
  IcCheck,
  IcDownload,
  IcGithub,
  IcShield,
  IcUpload,
  IcX,
} from '@/components/Icons'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
}

/**
 * GitHub panel — code documents only. Browsing/import pulls files into
 * Code mode; export commits ONLY on the explicit "Sync code to GitHub"
 * click, always to a feature branch (the default branch is protected).
 */
export function GithubDialog() {
  const open = useUiStore((s) => s.githubDialogOpen)
  const setOpen = useUiStore((s) => s.setGithubDialogOpen)
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="flex max-h-[85vh] w-[680px] flex-col overflow-hidden rounded-2xl border border-bord bg-panel shadow-2xl">
        <div className="flex flex-none items-center gap-2 border-b border-bord px-4 py-3">
          <IcGithub size={16} />
          <span className="text-[14px] font-bold">GitHub — code sync</span>
          <span className="rounded bg-panel2 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-muted uppercase">
            code documents only
          </span>
          <div className="flex-1" />
          <button className="icon-btn" onClick={() => setOpen(false)}>
            <IcX size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {githubProvider.isConnected() ? <ConnectedPanel /> : <ConnectPanel />}
        </div>
      </div>
    </div>
  )
}

function ConnectPanel() {
  const [pat, setPat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, force] = useState(0)

  const finish = (p: Promise<GithubUser>) => {
    setBusy(true)
    setError(null)
    p.then(() => force((n) => n + 1)).catch((e: Error) => setError(e.message)).finally(() => setBusy(false))
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        Connect your GitHub account to link this project to a repository,
        import code files into Code mode, and sync code documents back to a
        feature branch. Only code documents ever touch GitHub — never
        boards, rich documents or assets.
      </p>
      {hasGithubOAuth && (
        <>
          <button
            className="btn w-full justify-center gap-2 py-2.5"
            disabled={busy}
            onClick={() => finish(githubProvider.connectWithOAuth())}
          >
            <IcGithub size={14} /> Continue with GitHub
          </button>
          <div className="my-3 text-center text-[10px] text-muted uppercase">or</div>
        </>
      )}
      <label className="mb-1 block text-[11px] font-medium text-muted">
        Personal access token{' '}
        <span className="font-normal">(classic or fine-grained, repo scope)</span>
      </label>
      <div className="flex gap-2">
        <input
          className="field flex-1"
          type="password"
          placeholder="ghp_… / github_pat_…"
          value={pat}
          onChange={(e) => setPat(e.target.value)}
        />
        <button
          className="btn"
          disabled={busy || !pat.trim()}
          onClick={() => finish(githubProvider.connectWithToken(pat))}
        >
          Connect
        </button>
      </div>
      {!hasGithubOAuth && (
        <p className="mt-2 text-[11px] text-muted">
          One-click OAuth appears here when VITE_GITHUB_CLIENT_ID is configured
          (see README). Tokens are stored locally in your browser only.
        </p>
      )}
      {error && <p className="mt-2 text-[11px] text-[#f24822]">{error}</p>}
    </div>
  )
}

function ConnectedPanel() {
  const project = useActiveProject()
  const updateProject = useStore((s) => s.updateProject)
  const codeDocs = useStore((s) => s.codeDocs)
  const createCode = useStore((s) => s.createCode)
  const persistCodeContent = useStore((s) => s.persistCodeContent)
  const updateCodeMeta = useStore((s) => s.updateCodeMeta)

  const user = githubProvider.getCachedUser()
  const link = project.settings.github
  const [repos, setRepos] = useState<GithubRepo[] | null>(null)
  const [tree, setTree] = useState<GithubTreeEntry[] | null>(null)
  const [selectedImports, setSelectedImports] = useState<Set<string>>(new Set())
  const [selectedExports, setSelectedExports] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, force] = useState(0)

  const projectCode = useMemo(
    () => Object.values(codeDocs).filter((c) => c.projectId === project.id),
    [codeDocs, project.id],
  )

  useEffect(() => {
    githubProvider.listRepos().then(setRepos).catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    setTree(null)
    setSelectedImports(new Set())
    if (!link) return
    githubProvider
      .getTree(link.repo, link.defaultBranch)
      .then((entries) => setTree(entries.filter((e) => isCodeExt(extOf(e.path)))))
      .catch((e: Error) => setError(e.message))
  }, [link?.repo, link?.defaultBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      setNotice(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed')
    } finally {
      setBusy(null)
    }
  }

  const importSelected = () =>
    run('import', async () => {
      if (!link) throw new Error('Link a repository first')
      let count = 0
      for (const path of selectedImports) {
        const content = await githubProvider.getFileText(link.repo, link.defaultBranch, path)
        const ext = extOf(path)
        const title = path.split('/').pop()!.replace(/\.[^.]+$/, '') || path
        const codeId = createCode({
          title,
          language: langForExt(ext),
          extension: ext,
          metadata: { github: { repo: link.repo, branch: link.defaultBranch, path } },
        })
        persistCodeContent(codeId, content)
        count++
      }
      setSelectedImports(new Set())
      return `Imported ${count} file${count === 1 ? '' : 's'} into Code mode`
    })

  const syncToGithub = () =>
    run('export', async () => {
      if (!link) throw new Error('Link a repository first')
      const docs = projectCode.filter((c) => selectedExports.has(c.id))
      if (!docs.length) throw new Error('Select at least one code document')
      const { yjsManager } = await import('@/lib/crdt/YjsManager')
      const { reconciledCode } = await import('@/lib/crdt/CodeCRDT')
      const files = []
      for (const doc of docs) {
        const source = await storage.getDocument(doc.id)
        // commit the reconciled CRDT state: it may hold merged remote
        // edits that no local save has exported yet
        const room = yjsManager.room(doc.projectId ?? useStore.getState().activeProjectId)
        const merged = reconciledCode(room, doc.id)
        const existing = codeGithubLink(doc.metadata)
        const path = existing?.path ?? `lattice/${slugify(doc.title)}.${doc.extension || 'txt'}`
        files.push({
          path,
          content: merged ?? (typeof source === 'string' ? source : ''),
        })
        if (!existing) {
          updateCodeMeta(doc.id, {
            metadata: { ...doc.metadata, github: { repo: link.repo, branch: link.branch, path } },
          })
        }
      }
      const res = await githubProvider.commitFiles(
        link.repo,
        link.branch,
        link.defaultBranch,
        files,
        message.trim() || `Sync ${files.length} code file(s) from Lattice`,
      )
      setSelectedExports(new Set())
      setMessage('')
      void import('@/lib/collab/ActivityLogService').then(({ activityLog }) =>
        activityLog.log(
          useStore.getState().activeProjectId,
          'github.sync',
          `Pushed ${files.length} code file${files.length === 1 ? '' : 's'} to ${link.repo} (${link.branch})`,
        ),
      )
      return `Committed ${files.length} file(s) to ${link.branch}${res.branchCreated ? ' (branch created)' : ''} — ${res.url}`
    })

  const pullFromGithub = () =>
    run('pull', async () => {
      let count = 0
      for (const doc of projectCode) {
        const l = codeGithubLink(doc.metadata)
        if (!l) continue
        try {
          const content = await githubProvider.getFileText(l.repo, l.branch, l.path)
          persistCodeContent(doc.id, content)
          count++
        } catch {
          // file may not exist on that branch yet — skip silently
        }
      }
      if (!count) throw new Error('No code documents are linked to GitHub files yet')
      void import('@/lib/collab/ActivityLogService').then(({ activityLog }) =>
        activityLog.log(
          useStore.getState().activeProjectId,
          'github.sync',
          `Pulled ${count} linked code file${count === 1 ? '' : 's'} from GitHub`,
        ),
      )
      return `Pulled ${count} linked file${count === 1 ? '' : 's'} from GitHub`
    })

  return (
    <div className="space-y-5">
      {/* connection */}
      <div className="flex items-center gap-2 rounded-lg bg-panel2 px-3 py-2">
        {user?.avatarUrl && (
          <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
        )}
        <span className="text-[12px]">
          Connected as <b>@{user?.login}</b>
        </span>
        <div className="flex-1" />
        <button
          className="cursor-pointer text-[11px] text-muted hover:text-[#f24822]"
          onClick={() => {
            githubProvider.disconnect()
            force((n) => n + 1)
          }}
        >
          Disconnect
        </button>
      </div>

      {/* repo link */}
      <section>
        <div className="insp-h !mt-0">Linked repository — {project.name}</div>
        <div className="flex items-center gap-2">
          <select
            className="field flex-1"
            value={link?.repo ?? ''}
            onChange={(e) => {
              const repo = repos?.find((r) => r.fullName === e.target.value)
              updateProject(project.id, {
                settings: {
                  ...project.settings,
                  github: repo
                    ? {
                        repo: repo.fullName,
                        defaultBranch: repo.defaultBranch,
                        branch: `lattice/${slugify(project.name)}`,
                      }
                    : undefined,
                },
              })
            }}
          >
            <option value="">{repos ? 'Choose a repository…' : 'Loading repositories…'}</option>
            {repos?.map((r) => (
              <option key={r.fullName} value={r.fullName}>
                {r.fullName}
                {r.private ? ' (private)' : ''}
              </option>
            ))}
          </select>
        </div>
        {link && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
            <IcShield size={12} className="text-[#14ae5c]" />
            <span>
              <b>{link.defaultBranch}</b> is protected — commits go to
            </span>
            <span className="flex items-center gap-1 rounded bg-panel2 px-1.5 py-0.5">
              <IcBranch size={11} />
              <input
                className="w-44 bg-transparent font-mono text-[11px] outline-none"
                value={link.branch}
                onChange={(e) =>
                  updateProject(project.id, {
                    settings: {
                      ...project.settings,
                      github: { ...link, branch: e.target.value },
                    },
                  })
                }
              />
            </span>
          </div>
        )}
      </section>

      {link && (
        <>
          {/* import */}
          <section>
            <div className="insp-h !mt-0">
              Import code from {link.repo} ({link.defaultBranch})
            </div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-bord">
              {!tree && (
                <div className="px-3 py-3 text-[12px] text-muted">Loading file tree…</div>
              )}
              {tree?.length === 0 && (
                <div className="px-3 py-3 text-[12px] text-muted">
                  No importable code files found on {link.defaultBranch}.
                </div>
              )}
              {tree?.map((entry) => (
                <label
                  key={entry.path}
                  className="flex cursor-pointer items-center gap-2 border-b border-bord px-3 py-1.5 text-[12px] last:border-b-0 hover:bg-panel2"
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--accent)]"
                    checked={selectedImports.has(entry.path)}
                    onChange={(e) => {
                      const next = new Set(selectedImports)
                      if (e.target.checked) next.add(entry.path)
                      else next.delete(entry.path)
                      setSelectedImports(next)
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
                    {entry.path}
                  </span>
                  {entry.size !== undefined && (
                    <span className="text-[10px] text-muted">
                      {(entry.size / 1024).toFixed(1)} KB
                    </span>
                  )}
                </label>
              ))}
            </div>
            <button
              className="btn mt-2"
              disabled={!selectedImports.size || busy !== null}
              onClick={() => void importSelected()}
            >
              <IcDownload size={13} />
              {busy === 'import'
                ? 'Importing…'
                : `Import ${selectedImports.size || ''} selected`}
            </button>
          </section>

          {/* export */}
          <section>
            <div className="insp-h !mt-0">Sync code documents to GitHub</div>
            {projectCode.length === 0 ? (
              <div className="rounded-lg border border-bord px-3 py-3 text-[12px] text-muted">
                This project has no code documents yet — create one in Code
                mode or import from the repo above.
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-bord">
                {projectCode.map((doc) => {
                  const l = codeGithubLink(doc.metadata)
                  return (
                    <label
                      key={doc.id}
                      className="flex cursor-pointer items-center gap-2 border-b border-bord px-3 py-1.5 text-[12px] last:border-b-0 hover:bg-panel2"
                    >
                      <input
                        type="checkbox"
                        className="accent-[var(--accent)]"
                        checked={selectedExports.has(doc.id)}
                        onChange={(e) => {
                          const next = new Set(selectedExports)
                          if (e.target.checked) next.add(doc.id)
                          else next.delete(doc.id)
                          setSelectedExports(next)
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {doc.title}.{doc.extension}
                      </span>
                      <span className="truncate font-mono text-[10px] text-muted">
                        {l ? l.path : `lattice/${slugify(doc.title)}.${doc.extension}`}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <input
                className="field flex-1"
                placeholder="Commit message (optional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button
                className="btn"
                disabled={!selectedExports.size || busy !== null}
                onClick={() => void syncToGithub()}
                title="Creates one commit on the feature branch — nothing happens without this click"
              >
                <IcUpload size={13} />
                {busy === 'export' ? 'Committing…' : 'Sync code to GitHub'}
              </button>
            </div>
            <button
              className="btn mt-2"
              disabled={busy !== null}
              onClick={() => void pullFromGithub()}
            >
              <IcDownload size={13} />
              {busy === 'pull' ? 'Pulling…' : 'Pull code from GitHub'}
            </button>
          </section>
        </>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-[#14ae5c]/40 bg-[#14ae5c]/10 px-3 py-2 text-[12px]">
          <IcCheck size={13} className="mt-0.5 flex-none text-[#14ae5c]" />
          <span className="break-all">{notice}</span>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-[#f24822]/40 bg-[#f24822]/10 px-3 py-2 text-[12px] text-[#f24822]">
          {error}
        </div>
      )}
    </div>
  )
}
