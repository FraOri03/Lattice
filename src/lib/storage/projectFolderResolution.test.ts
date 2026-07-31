import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FOLDER_MIME, GoogleDriveStorageProvider } from './GoogleDriveStorageProvider'
import { PROJECT_ID_PROPERTY } from './driveProjectFolder'

/**
 * Project folders on Drive are named after the project but addressed by
 * id. The whole point of that split is that a rename must never orphan a
 * folder or grow a second one, and no Drive account is reachable from a
 * unit test — so these run the real provider against a fake Drive that
 * answers the handful of REST calls the folder logic makes.
 *
 * What the fake models: files/folders with parents, names, appProperties;
 * the `q=` filters the provider actually sends; create and metadata PATCH.
 * Nothing else — this is a test of Lattice's resolution order, not of
 * Google's query language.
 */

interface FakeFile {
  id: string
  name: string
  mimeType: string
  parents: string[]
  appProperties?: Record<string, string>
}

class FakeDrive {
  files: FakeFile[] = []
  /** every write the provider performed, in order */
  writes: { kind: 'create' | 'patch'; id: string; body: Record<string, unknown> }[] = []
  private seq = 0

  seed(file: Omit<FakeFile, 'id'> & { id?: string }): FakeFile {
    const created = { ...file, id: file.id ?? `f${++this.seq}` }
    this.files.push(created)
    return created
  }

  folders(parentId: string): FakeFile[] {
    return this.files.filter((f) => f.mimeType === FOLDER_MIME && f.parents.includes(parentId))
  }

  private search(query: string): FakeFile[] {
    const name = /name = '([^']*)'/.exec(query)?.[1]
    const parent = /'([^']*)' in parents/.exec(query)?.[1]
    const mime = / and mimeType = '([^']*)'/.exec(query)?.[1]
    const notMime = / and mimeType != '([^']*)'/.exec(query)?.[1]
    const prop = /appProperties has \{ key='([^']*)' and value='([^']*)' \}/.exec(query)
    return this.files.filter((f) => {
      if (name !== undefined && f.name !== name) return false
      if (parent !== undefined && !f.parents.includes(parent)) return false
      if (mime !== undefined && f.mimeType !== mime) return false
      if (notMime !== undefined && f.mimeType === notMime) return false
      if (prop && f.appProperties?.[prop[1]] !== prop[2]) return false
      return true
    })
  }

  fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input)
    const method = init.method ?? 'GET'
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    if (method === 'GET' && url.pathname.endsWith('/files')) {
      return json({ files: this.search(url.searchParams.get('q') ?? '') })
    }
    if (method === 'POST' && url.pathname.endsWith('/files')) {
      const body = JSON.parse(String(init.body)) as Omit<FakeFile, 'id'>
      const created = this.seed(body)
      this.writes.push({ kind: 'create', id: created.id, body: { ...body } })
      return json({ id: created.id })
    }
    if (method === 'PATCH') {
      const id = url.pathname.split('/').pop()!
      const patch = JSON.parse(String(init.body)) as Partial<FakeFile>
      const target = this.files.find((f) => f.id === id)
      if (!target) return new Response('not found', { status: 404 })
      if (patch.name !== undefined) target.name = patch.name
      if (patch.appProperties) {
        target.appProperties = { ...target.appProperties, ...patch.appProperties }
      }
      this.writes.push({ kind: 'patch', id, body: patch as Record<string, unknown> })
      return json({ id })
    }
    return new Response(`unexpected ${method} ${input}`, { status: 500 })
  }
}

let drive: FakeDrive
let titles: Record<string, string>

/** A provider with no caches — i.e. what a freshly opened tab starts from. */
const newProvider = () =>
  new GoogleDriveStorageProvider(
    async () => 'token',
    (projectId) => titles[projectId],
  )

/** The `/Lattice` root, created lazily on the first path resolution. */
const appRoot = () => drive.files.find((f) => f.parents.includes('root'))!
const projectsFolder = () => drive.folders(appRoot().id).find((f) => f.name === 'projects')!
const projectFolders = () => drive.folders(projectsFolder().id)

beforeEach(() => {
  drive = new FakeDrive()
  titles = { proj_a1: 'Client work' }
  vi.stubGlobal('fetch', drive.fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('project folder naming', () => {
  it('names a new project folder after the project, pinned by its id', async () => {
    await newProvider().ensurePath(['projects', 'proj_a1'])

    expect(projectFolders()).toHaveLength(1)
    expect(projectFolders()[0].name).toBe('Client work')
    expect(projectFolders()[0].appProperties?.[PROJECT_ID_PROPERTY]).toBe('proj_a1')
  })

  it('puts the project subfolders inside the named folder', async () => {
    const provider = newProvider()
    const assets = await provider.ensurePath(['projects', 'proj_a1', 'assets'])

    const named = projectFolders()[0]
    expect(drive.files.find((f) => f.id === assets)?.parents).toEqual([named.id])
    expect(named.name).toBe('Client work')
  })

  it('falls back to the project id when the title has no printable characters', async () => {
    titles.proj_a1 = '   '
    await newProvider().ensurePath(['projects', 'proj_a1'])

    expect(projectFolders()[0].name).toBe('proj_a1')
  })

  it('numbers the folder when another project already took the name', async () => {
    titles = { proj_a1: 'Research', proj_b2: 'Research' }
    const provider = newProvider()
    await provider.ensurePath(['projects', 'proj_a1'])
    await provider.ensurePath(['projects', 'proj_b2'])

    expect(projectFolders().map((f) => f.name).sort()).toEqual(['Research', 'Research (2)'])
  })
})

describe('renaming a project', () => {
  it('renames the same folder in place instead of creating a second one', async () => {
    const provider = newProvider()
    await provider.ensurePath(['projects', 'proj_a1'])
    const before = projectFolders()[0].id

    titles.proj_a1 = 'Client work 2026'
    await provider.syncProjectFolder('proj_a1')

    expect(projectFolders()).toHaveLength(1)
    expect(projectFolders()[0].id).toBe(before)
    expect(projectFolders()[0].name).toBe('Client work 2026')
  })

  it('keeps the project subfolders attached across a rename', async () => {
    const provider = newProvider()
    const assets = await provider.ensurePath(['projects', 'proj_a1', 'assets'])

    titles.proj_a1 = 'Renamed'
    await provider.syncProjectFolder('proj_a1')

    expect(await provider.ensurePath(['projects', 'proj_a1', 'assets'])).toBe(assets)
    expect(drive.files.find((f) => f.id === assets)?.parents).toEqual([projectFolders()[0].id])
  })

  it('writes nothing when the title still matches the folder', async () => {
    const provider = newProvider()
    await provider.ensurePath(['projects', 'proj_a1'])
    const writesSoFar = drive.writes.length

    await provider.syncProjectFolder('proj_a1')

    expect(drive.writes).toHaveLength(writesSoFar)
  })

  it('leaves the folder alone for a project this vault does not know', async () => {
    await newProvider().ensurePath(['projects', 'proj_a1'])

    titles = {} // e.g. a project belonging to another device
    const other = newProvider()
    await other.syncProjectFolder('proj_a1')

    expect(projectFolders()).toHaveLength(1)
    expect(projectFolders()[0].name).toBe('Client work')
  })
})

describe('a device that has never pushed this project', () => {
  it('finds the folder by its project id rather than duplicating it', async () => {
    await newProvider().ensurePath(['projects', 'proj_a1'])
    const existing = projectFolders()[0].id

    const fresh = newProvider() // no in-memory caches at all
    expect(await fresh.ensurePath(['projects', 'proj_a1'])).toBe(existing)
    expect(projectFolders()).toHaveLength(1)
  })

  it('still finds it after another device renamed the project', async () => {
    await newProvider().ensurePath(['projects', 'proj_a1'])
    const existing = projectFolders()[0].id
    titles.proj_a1 = 'Renamed elsewhere'

    const fresh = newProvider()
    expect(await fresh.ensurePath(['projects', 'proj_a1'])).toBe(existing)
    expect(projectFolders()).toHaveLength(1)
    expect(projectFolders()[0].name).toBe('Renamed elsewhere')
  })
})

describe('migration from the id-named layout', () => {
  /** Recreate what earlier Lattice versions wrote: folder name == project id. */
  const seedLegacyLayout = () => {
    const root = drive.seed({ name: 'Lattice', mimeType: FOLDER_MIME, parents: ['root'] })
    const projects = drive.seed({ name: 'projects', mimeType: FOLDER_MIME, parents: [root.id] })
    const legacy = drive.seed({ name: 'proj_a1', mimeType: FOLDER_MIME, parents: [projects.id] })
    const body = drive.seed({
      name: 'project.json',
      mimeType: 'application/json',
      parents: [legacy.id],
    })
    return { legacy, body }
  }

  it('adopts and renames the existing folder, leaving its contents in place', async () => {
    const { legacy, body } = seedLegacyLayout()

    const resolved = await newProvider().ensurePath(['projects', 'proj_a1'])

    expect(resolved).toBe(legacy.id) // same folder — nothing was moved
    expect(projectFolders()).toHaveLength(1)
    expect(projectFolders()[0].name).toBe('Client work')
    expect(projectFolders()[0].appProperties?.[PROJECT_ID_PROPERTY]).toBe('proj_a1')
    expect(drive.files.find((f) => f.id === body.id)?.parents).toEqual([legacy.id])
  })

  it('pins the project id before renaming, so an interrupted run can resume', async () => {
    seedLegacyLayout()

    await newProvider().ensurePath(['projects', 'proj_a1'])

    const patches = drive.writes.filter((w) => w.kind === 'patch')
    expect(patches[0].body).toHaveProperty('appProperties')
    expect(patches[1].body).toEqual({ name: 'Client work' })
  })

  it('never adopts a folder that already belongs to another project', async () => {
    const root = drive.seed({ name: 'Lattice', mimeType: FOLDER_MIME, parents: ['root'] })
    const projects = drive.seed({ name: 'projects', mimeType: FOLDER_MIME, parents: [root.id] })
    // pathological: project b2 is literally titled like project a1's id
    drive.seed({
      name: 'proj_a1',
      mimeType: FOLDER_MIME,
      parents: [projects.id],
      appProperties: { [PROJECT_ID_PROPERTY]: 'proj_b2' },
    })

    await newProvider().ensurePath(['projects', 'proj_a1'])

    const mine = projectFolders().filter(
      (f) => f.appProperties?.[PROJECT_ID_PROPERTY] === 'proj_a1',
    )
    expect(mine).toHaveLength(1)
    expect(mine[0].name).toBe('Client work')
  })
})
