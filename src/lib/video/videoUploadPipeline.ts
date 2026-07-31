import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import { primeAssetUrl, releaseAssetUrl } from '@/lib/assets/AssetRegistry'
import { blobToDataUrl } from '@/lib/media'
import { videoConversionClient } from './VideoConversionClient'
import { eligibleForAutoConvert } from './videoConversion'

/**
 * Bridges VideoConversionClient (pure worker transport) to what Lattice
 * actually does with the result for a given asset: patch its status,
 * swap the stored blob in place once conversion succeeds, and re-prime
 * the cached object URL so an already-mounted <video> picks up the new
 * source. This is the "one usable video resource" contract: there is
 * never a second, separately-kept AssetDoc for the converted file — the
 * SAME asset id's blob is replaced, and the pre-conversion bytes are gone
 * once that succeeds.
 */

/**
 * Kick off (or skip) background conversion for a freshly imported video
 * asset. Never awaited by the importer — the board card for the original,
 * still-playable upload appears immediately; this keeps working after
 * importFile() has already returned.
 */
export function queueVideoConversion(assetId: string, file: File): void {
  const patch = useStore.getState().patchAsset

  const eligibility = eligibleForAutoConvert(file)
  if (!eligibility.eligible) {
    patch(assetId, { videoConversion: { status: 'skipped', skippedReason: eligibility.reason } })
    return
  }
  if (!videoConversionClient.isAvailable) {
    patch(assetId, {
      videoConversion: {
        status: 'skipped',
        skippedReason: 'Video conversion is unavailable in this browser — kept as uploaded.',
      },
    })
    return
  }

  patch(assetId, { videoConversion: { status: 'queued' } })

  videoConversionClient
    .convert(file, {
      onProgress: (fraction) => {
        // a queued job's first progress event is also its transition to
        // "converting" — no separate "start" message needed
        patch(assetId, { videoConversion: { status: 'converting', progress: fraction } })
      },
    })
    .then(async (result) => {
      // the SAME asset id's blob is replaced — no second AssetDoc, no
      // permanent duplicate of the pre-conversion bytes
      await storage.putBlob(assetId, result.output)
      releaseAssetUrl(assetId)
      primeAssetUrl(assetId, result.output)

      const thumbnailDataUrl = result.thumbnail
        ? await blobToDataUrl(result.thumbnail).catch(() => undefined)
        : undefined

      patch(assetId, {
        mime: 'video/mp4',
        ext: 'mp4',
        size: result.output.size,
        videoConversion: { status: 'done' },
        ...(thumbnailDataUrl ? { thumbnailDataUrl } : {}),
      })
    })
    .catch((err: unknown) => {
      // the original upload is untouched and still what plays — a failed
      // conversion never leaves a video unplayable
      patch(assetId, {
        videoConversion: {
          status: 'error',
          error: err instanceof Error ? err.message : 'Video conversion failed',
        },
      })
    })
}

/**
 * Retry a skipped or failed conversion. Safe to call any time the asset's
 * blob is still the pre-conversion original — true for every status other
 * than 'done', since only a SUCCESSFUL conversion ever swaps the blob.
 */
export async function retryVideoConversion(assetId: string): Promise<void> {
  const asset = useStore.getState().assets[assetId]
  if (!asset || asset.kind !== 'video') return
  const blob = await storage.getBlob(assetId)
  if (!blob) return
  const file = new File([blob], asset.originalName || asset.name, {
    type: asset.mime || blob.type,
  })
  queueVideoConversion(assetId, file)
}
