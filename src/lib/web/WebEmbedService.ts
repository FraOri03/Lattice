import { nid } from '@/lib/id'
import { hostnameOf } from '@/lib/media'
import type { WebEmbed } from '@/types/model'

/**
 * WebEmbedService — creates and sanitizes website embeds for boards.
 *
 * Security contract:
 *  - only http: and https: URLs are ever embedded; javascript:, data:,
 *    vbscript:, file:, blob: and everything else is rejected outright
 *  - rejected URLs never reach an iframe — the card shows a warning
 *  - iframes always carry a sandbox attribute (see WebEmbedCardNode)
 */

const SAFE_PROTOCOLS = new Set(['http:', 'https:'])

export interface SanitizeResult {
  ok: boolean
  url: string
  reason?: string
}

/** Normalize + validate a user-supplied URL. Never trust the raw string. */
export function sanitizeEmbedUrl(raw: string): SanitizeResult {
  const input = raw.trim()
  if (!input) return { ok: false, url: '', reason: 'Empty URL' }
  // pasted without protocol → assume https
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input) ? input : `https://${input}`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return { ok: false, url: input, reason: 'Not a valid URL' }
  }
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      url: input,
      reason: `Blocked unsafe scheme "${parsed.protocol.replace(':', '')}" — only http/https can be embedded`,
    }
  }
  if (!parsed.hostname) return { ok: false, url: input, reason: 'URL has no host' }
  return { ok: true, url: parsed.href }
}

/**
 * Favicon for a host. Uses the site's own /favicon.ico first; the card
 * falls back to a generic globe glyph if it fails to load.
 */
export function faviconUrlFor(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}/favicon.ico`
  } catch {
    return ''
  }
}

/**
 * Build a WebEmbed payload from a raw URL. Returns null when the URL is
 * unsafe — callers surface the reason to the user instead of embedding.
 */
export function createWebEmbed(
  raw: string,
): { embed: WebEmbed } | { embed: null; reason: string } {
  const res = sanitizeEmbedUrl(raw)
  if (!res.ok) return { embed: null, reason: res.reason ?? 'Invalid URL' }
  const now = Date.now()
  return {
    embed: {
      id: nid('embed'),
      url: res.url,
      title: hostnameOf(res.url),
      faviconUrl: faviconUrlFor(res.url),
      embedAllowed: true,
      fallbackMode: 'iframe',
      createdAt: now,
      updatedAt: now,
    },
  }
}

/** Quick check used by paste/drop handlers. */
export function looksLikeUrl(text: string): boolean {
  const t = text.trim()
  if (!t || /\s/.test(t)) return false
  return /^https?:\/\/\S+$/i.test(t) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)
}
