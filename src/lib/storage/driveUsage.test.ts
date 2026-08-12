import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleDriveStorageProvider } from './GoogleDriveStorageProvider'

/**
 * `usage()` is the reading behind the status panel's "Drive mirror" line,
 * and the whole reason that line exists is that it must NOT be the local
 * vault total wearing a Drive label. So what is worth pinning here is the
 * arithmetic between Drive's answer and the number on screen: which files
 * count, which are skipped, and that a listing spread over pages is summed
 * whole rather than truncated at the first page.
 *
 * No Drive account is reachable from a unit test, so this drives the real
 * provider against a stubbed fetch that answers the two endpoints it calls.
 */

interface FakeResponse {
  files?: { size?: string }[]
  nextPageToken?: string
}

function stubDrive(pages: FakeResponse[], quota?: { limit?: string; usage?: string }) {
  const calls: string[] = []
  let page = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      calls.push(url)
      const body = url.includes('/about')
        ? { user: { emailAddress: 'a@b.c' }, storageQuota: quota }
        : pages[page++]
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      } as unknown as Response)
    }),
  )
  return calls
}

function provider() {
  return new GoogleDriveStorageProvider(
    () => Promise.resolve('token'),
    () => undefined,
  )
}

describe('GoogleDriveStorageProvider.usage', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('sums every page, not just the first', async () => {
    stubDrive([
      { files: [{ size: '100' }, { size: '200' }], nextPageToken: 'p2' },
      { files: [{ size: '300' }] },
    ])
    expect(await provider().usage()).toMatchObject({ bytes: 600, files: 3 })
  })

  it('skips entries Drive reports without a size, and does not count them as files', async () => {
    // native Google-editor files come back sizeless; counting them as 0-byte
    // files would inflate the count against a byte total they never join
    stubDrive([{ files: [{ size: '512' }, {}, { size: '512' }] }])
    expect(await provider().usage()).toMatchObject({ bytes: 1024, files: 2 })
  })

  it('excludes folders in the query it sends', async () => {
    const calls = stubDrive([{ files: [] }])
    await provider().usage()
    const list = calls.find((u) => u.includes('/files?'))!
    expect(decodeURIComponent(list)).toContain("mimeType != 'application/vnd.google-apps.folder'")
    expect(decodeURIComponent(list)).toContain('trashed = false')
  })

  it('reports the account quota as numbers, and omits an unlimited one', async () => {
    stubDrive([{ files: [] }], { limit: '16106127360', usage: '178008606' })
    expect(await provider().usage()).toMatchObject({
      quotaLimit: 16106127360,
      quotaUsage: 178008606,
    })

    vi.unstubAllGlobals()
    stubDrive([{ files: [] }], { usage: '178008606' })
    const unlimited = await provider().usage()
    expect(unlimited.quotaLimit).toBeUndefined()
    expect(unlimited.quotaUsage).toBe(178008606)
  })

  it('is zero — not NaN — for a mirror that holds nothing yet', async () => {
    stubDrive([{ files: [] }])
    expect(await provider().usage()).toMatchObject({ bytes: 0, files: 0 })
  })
})
