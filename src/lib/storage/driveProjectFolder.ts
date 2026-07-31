/**
 * Naming rules for a project's folder on Google Drive.
 *
 * The folder is addressed internally by the project's id, but is NAMED
 * after the project title so the user recognises it in their own Drive.
 * Those two facts only coexist because identity never depends on the name:
 * every project folder carries its project id in `appProperties`, so a
 * rename is a cosmetic PATCH rather than a new folder.
 *
 * Pure string logic only — the Drive calls that apply these rules live
 * next door in GoogleDriveStorageProvider.
 */

/**
 * Drive app property pinning a folder to its Lattice project. Same trick
 * the readable HTML companions use (`latticeDocId`): identity by a stable
 * id, presentation by a human name.
 */
export const PROJECT_ID_PROPERTY = 'latticeProjectId'

/** Drive tolerates far longer, but a folder name is read, not parsed. */
export const MAX_FOLDER_NAME_LENGTH = 120

/**
 * Turn a project title into a Drive folder name.
 *
 * Strips control characters and both slashes: Drive accepts them, but a
 * folder called `Q3 / Q4` reads as two levels of nesting to anyone
 * scanning the file list. Falls back to the project id when the title is
 * empty or made entirely of stripped characters — an id is a worse name
 * than a title, but a better one than nothing.
 */
export function projectFolderName(title: string | undefined, projectId: string): string {
  const safe = Array.from(title ?? '')
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code < 32 || ch === '/' || ch === '\\' ? ' ' : ch
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FOLDER_NAME_LENGTH)
    .trim()
  return safe || projectId
}

/**
 * Name to try on the nth collision (0-based): `Name`, `Name (2)`, …
 *
 * Two projects really can share a title, and Drive really does allow two
 * sibling folders with the same name — legal, but indistinguishable in the
 * file list, which defeats the point of naming them after the project.
 */
export function folderNameCandidate(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base} (${attempt + 1})`
}

/**
 * Whether an untagged folder found under `projects/` is the pre-naming
 * folder of this project — i.e. one Lattice itself created back when the
 * folder name WAS the project id.
 *
 * Requires the absence of a project-id property: a folder that carries one
 * belongs to whichever project it names, even in the pathological case of
 * a user titling their project `proj_…` to match another project's id.
 */
export function isLegacyProjectFolder(
  folder: { name: string; appProperties?: Record<string, string> },
  projectId: string,
): boolean {
  if (folder.appProperties?.[PROJECT_ID_PROPERTY]) return false
  return folder.name === projectId
}
