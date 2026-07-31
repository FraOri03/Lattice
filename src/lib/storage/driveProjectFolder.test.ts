import { describe, expect, it } from 'vitest'
import {
  folderNameCandidate,
  isLegacyProjectFolder,
  MAX_FOLDER_NAME_LENGTH,
  PROJECT_ID_PROPERTY,
  projectFolderName,
} from './driveProjectFolder'

describe('projectFolderName', () => {
  it('uses the project title as the folder name', () => {
    expect(projectFolderName('Client work', 'proj_a1')).toBe('Client work')
  })

  it('keeps accents, emoji and punctuation the user typed', () => {
    expect(projectFolderName('Tesi — Fisica ✨ (2026)', 'proj_a1')).toBe(
      'Tesi — Fisica ✨ (2026)',
    )
  })

  it('strips slashes, which would read as folder nesting', () => {
    expect(projectFolderName('Q3 / Q4', 'proj_a1')).toBe('Q3 Q4')
    expect(projectFolderName('a\\b', 'proj_a1')).toBe('a b')
  })

  it('strips control characters and collapses the resulting gaps', () => {
    const title = `Notes${String.fromCodePoint(9)}${String.fromCodePoint(10)}  draft`
    expect(projectFolderName(title, 'proj_a1')).toBe('Notes draft')
  })

  it('falls back to the project id when nothing printable is left', () => {
    expect(projectFolderName('   ', 'proj_a1')).toBe('proj_a1')
    expect(projectFolderName('///', 'proj_a1')).toBe('proj_a1')
    expect(projectFolderName(undefined, 'proj_a1')).toBe('proj_a1')
  })

  it('caps the length without leaving a trailing space', () => {
    const name = projectFolderName(`${'x'.repeat(MAX_FOLDER_NAME_LENGTH)} tail`, 'proj_a1')
    expect(name).toHaveLength(MAX_FOLDER_NAME_LENGTH)
    expect(name).toBe(name.trim())
  })
})

describe('folderNameCandidate', () => {
  it('prefers the bare name, then numbers the collisions', () => {
    expect(folderNameCandidate('Research', 0)).toBe('Research')
    expect(folderNameCandidate('Research', 1)).toBe('Research (2)')
    expect(folderNameCandidate('Research', 2)).toBe('Research (3)')
  })
})

describe('isLegacyProjectFolder', () => {
  it('recognises a folder still named after the project id', () => {
    expect(isLegacyProjectFolder({ name: 'proj_a1' }, 'proj_a1')).toBe(true)
  })

  it('ignores a folder named after some other project id', () => {
    expect(isLegacyProjectFolder({ name: 'proj_b2' }, 'proj_a1')).toBe(false)
  })

  it('never adopts a folder that already belongs to a project', () => {
    // pathological: a project literally titled like another project's id
    expect(
      isLegacyProjectFolder(
        { name: 'proj_a1', appProperties: { [PROJECT_ID_PROPERTY]: 'proj_b2' } },
        'proj_a1',
      ),
    ).toBe(false)
  })
})
