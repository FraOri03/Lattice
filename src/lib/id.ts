/** Short unique id, e.g. "card_m4k2x1a9q". */
export function nid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
