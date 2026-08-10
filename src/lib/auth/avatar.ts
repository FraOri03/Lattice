/**
 * Avatar upload (Phase 14.2).
 *
 * The picture is downscaled to a small square and stored as a data URL on the
 * account record — no upload endpoint, no blob store, and nothing that has to
 * exist on a server before a local-first app can show your face. The cap is
 * what keeps a 12 MP photo out of localStorage.
 */

/** Stored edge length. Two device pixels of a 40px avatar, and no more. */
export const AVATAR_SIZE = 128
/** Refuse the source file above this — before decoding it, not after. */
export const MAX_AVATAR_BYTES = 8 * 1024 * 1024

/**
 * The square, centred region of a `w × h` image that fills the frame — the
 * arithmetic behind `object-fit: cover`, pulled out so it can be asserted.
 */
export function coverCrop(w: number, h: number): { x: number; y: number; size: number } {
  const size = Math.min(w, h)
  return { x: Math.round((w - size) / 2), y: Math.round((h - size) / 2), size }
}

export class AvatarError extends Error {}

/** Decode, centre-crop, downscale and encode. Throws AvatarError with a reason. */
export async function avatarDataUrlFrom(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new AvatarError('not-an-image')
  if (file.size > MAX_AVATAR_BYTES) throw new AvatarError('too-large')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new AvatarError('undecodable')
  }

  try {
    const { x, y, size } = coverCrop(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new AvatarError('undecodable')
    ctx.drawImage(bitmap, x, y, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
    // webp where it encodes, png where it does not: a silent fallback to a
    // 4× larger picture beats a broken avatar
    const webp = canvas.toDataURL('image/webp', 0.85)
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png')
  } finally {
    bitmap.close()
  }
}
