/** Language registry for code documents: extension ↔ Monaco language id. */

export interface LanguageInfo {
  id: string // Monaco language id
  label: string
  ext: string // canonical extension (no dot)
}

export const LANGUAGES: LanguageInfo[] = [
  { id: 'javascript', label: 'JavaScript', ext: 'js' },
  { id: 'typescript', label: 'TypeScript', ext: 'ts' },
  { id: 'html', label: 'HTML', ext: 'html' },
  { id: 'css', label: 'CSS', ext: 'css' },
  { id: 'scss', label: 'SCSS', ext: 'scss' },
  { id: 'json', label: 'JSON', ext: 'json' },
  { id: 'xml', label: 'XML', ext: 'xml' },
  { id: 'yaml', label: 'YAML', ext: 'yaml' },
  { id: 'python', label: 'Python', ext: 'py' },
  { id: 'java', label: 'Java', ext: 'java' },
  { id: 'c', label: 'C', ext: 'c' },
  { id: 'cpp', label: 'C++', ext: 'cpp' },
  { id: 'csharp', label: 'C#', ext: 'cs' },
  { id: 'go', label: 'Go', ext: 'go' },
  { id: 'rust', label: 'Rust', ext: 'rs' },
  { id: 'php', label: 'PHP', ext: 'php' },
  { id: 'ruby', label: 'Ruby', ext: 'rb' },
  { id: 'sql', label: 'SQL', ext: 'sql' },
  { id: 'shell', label: 'Shell', ext: 'sh' },
  { id: 'markdown', label: 'Markdown', ext: 'md' },
  { id: 'plaintext', label: 'Plain text', ext: 'txt' },
]

/** Extensions that import as code documents (md/txt import as notes instead). */
const EXT_TO_LANG: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  py: 'python',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  php: 'php',
  rb: 'ruby',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  bat: 'bat',
  svelte: 'html',
  vue: 'html',
  // ".env", ".env.local" → ext "env"/"local"; both carry secret warnings
  env: 'ini',
  local: 'ini',
}

export const CODE_EXTS = Object.keys(EXT_TO_LANG)

export function isCodeExt(ext: string): boolean {
  return ext in EXT_TO_LANG
}

export function langForExt(ext: string): string {
  return EXT_TO_LANG[ext] ?? 'plaintext'
}

export function extForLang(lang: string): string {
  return LANGUAGES.find((l) => l.id === lang)?.ext ?? 'txt'
}

export function labelForLang(lang: string): string {
  return LANGUAGES.find((l) => l.id === lang)?.label ?? lang
}
