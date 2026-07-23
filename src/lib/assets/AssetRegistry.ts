import { useEffect, useState } from 'react'
import type { AssetDoc } from '@/types/model'
import { storage } from '@/lib/storage/StorageProvider'

/**
 * Runtime side of asset management: resolves asset ids to object URLs,
 * caching them for the session. Metadata CRUD lives in the store; binaries
 * live in the StorageProvider. This module must not import the store.
 */

const urlCache = new Map<string, string>()

/** Seed the cache at import time so freshly imported assets render instantly. */
export function primeAssetUrl(id: string, blob: Blob): void {
  if (!urlCache.has(id)) urlCache.set(id, URL.createObjectURL(blob))
}

export async function getAssetUrl(id: string): Promise<string | undefined> {
  const cached = urlCache.get(id)
  if (cached) return cached
  const blob = await storage.getBlob(id)
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  urlCache.set(id, url)
  return url
}

export function releaseAssetUrl(id: string): void {
  const url = urlCache.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    urlCache.delete(id)
  }
}

export function releaseAllAssetUrls(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url)
  urlCache.clear()
}

/**
 * Whether an asset's BINARY is available on this device.
 *
 *  - `loading` — still being read out of local storage
 *  - `ready`   — an object URL is available
 *  - `absent`  — the metadata exists but the bytes do not. This is a normal
 *    state, not a corruption: binaries live in local storage and are mirrored
 *    to the owner's own Drive, so a card created by someone else arrives
 *    without its bytes. Surfaces should say so rather than render a blank box.
 */
export type AssetBinaryState = 'loading' | 'ready' | 'absent'

/** React hook: object URL for an asset's binary, or undefined while loading. */
export function useAssetUrl(id?: string): string | undefined {
  return useAssetBinary(id).url
}

/** Like `useAssetUrl`, but also reports WHY there is no url. */
export function useAssetBinary(id?: string): {
  url: string | undefined
  state: AssetBinaryState
} {
  const [url, setUrl] = useState<string | undefined>(() =>
    id ? urlCache.get(id) : undefined,
  )
  const [state, setState] = useState<AssetBinaryState>(() =>
    id ? (urlCache.has(id) ? 'ready' : 'loading') : 'absent',
  )

  useEffect(() => {
    if (!id) {
      setUrl(undefined)
      setState('absent')
      return
    }
    const cached = urlCache.get(id)
    if (cached) {
      setUrl(cached)
      setState('ready')
      return
    }
    let alive = true
    setState('loading')
    void getAssetUrl(id).then((u) => {
      if (!alive) return
      setUrl(u)
      setState(u ? 'ready' : 'absent')
    })
    return () => {
      alive = false
    }
  }, [id])

  return { url, state }
}

export async function downloadAsset(asset: AssetDoc): Promise<void> {
  const url = await getAssetUrl(asset.id)
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = asset.originalName
  a.click()
}
