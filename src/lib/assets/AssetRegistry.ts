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

/** React hook: object URL for an asset's binary, or undefined while loading. */
export function useAssetUrl(id?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() =>
    id ? urlCache.get(id) : undefined,
  )
  useEffect(() => {
    if (!id) {
      setUrl(undefined)
      return
    }
    const cached = urlCache.get(id)
    if (cached) {
      setUrl(cached)
      return
    }
    let alive = true
    void getAssetUrl(id).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [id])
  return url
}

export async function downloadAsset(asset: AssetDoc): Promise<void> {
  const url = await getAssetUrl(asset.id)
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = asset.originalName
  a.click()
}
