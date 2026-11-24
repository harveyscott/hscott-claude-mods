// Which files and hunks are not the crux: by path, then by what changed.
import type { CruxFile, CruxHunk } from '../types'

const TEST = [
  /(^|\/)(test|tests|__tests__|spec|specs|testdata|fixtures|__mocks__|__snapshots__)\//i,
  /\.(test|spec)\.[^/]+$/i,
  /(^|\/)test_[^/]+\.py$/i,
  /_test\.[^/]+$/i,
  /Tests?\.(cs|java|kt|swift)$/,
]
const DOCS = [
  /\.(md|mdx|markdown|rst|adoc|txt)$/i,
  /(^|\/)(docs?|documentation)\//i,
  /(^|\/)(LICENSE|CHANGELOG|AUTHORS)[^/]*$/i,
]
const GENERATED = [
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum|uv\.lock)$/,
  /\.lock$/i,
  /\.(min\.js|min\.css|map|snap)$/i,
  /(^|\/)(dist|build|out|target|coverage|node_modules|vendor|\.next|bin|obj)\//,
  /\.(g|generated|pb)\.[^/]+$/i,
  /(^|\/)\.claude-plugin\/types\//,
]

/** A glob as people write them: `**` any folders, `*` within one, `?` one character. */
export function globToRegExp(glob: string): RegExp {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/'
      out += slash ? '(?:.*/)?' : '.*'
      i += slash ? 2 : 1
    } else if (c === '*') out += '[^/]*'
    else if (c === '?') out += '[^/]'
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(glob.includes('/') ? `^${out}$` : `(^|/)${out}$`)
}

export function parseIgnore(ignore: string): RegExp[] {
  return ignore
    .split(',')
    .map(one => one.trim())
    .filter(one => one.length > 0)
    .map(globToRegExp)
}

export function hiddenBy(path: string, ignore: RegExp[]): CruxFile['hidden'] {
  if (ignore.some(re => re.test(path))) return 'ignored'
  if (TEST.some(re => re.test(path))) return 'test'
  if (DOCS.some(re => re.test(path))) return 'docs'
  if (GENERATED.some(re => re.test(path))) return 'generated'
  return undefined
}

const IMPORT =
  /^\s*(import\b|from\s+\S+\s+import\b|export\s+(\*|\{[^}]*\})\s+from\b|using\s+[\w.]+\s*;|#include\b|use\s+[\w:]+|require\s*\(|(const|let|var)\s+[\w{}\s,]+=\s*require\s*\(|\}\s*from\s+['"])/

const changed = (hunk: CruxHunk, sign: '+' | '-') =>
  hunk.lines.filter(line => line.startsWith(sign)).map(line => line.slice(1))

const squash = (lines: string[]) => lines.join('').replace(/\s+/g, '')

/** The hunk's changed lines in one string, for spotting the same edit in many files. */
export const signature = (hunk: CruxHunk): string =>
  `${changed(hunk, '-')
    .map(s => s.trim())
    .join('\n')}\u0000${changed(hunk, '+')
    .map(s => s.trim())
    .join('\n')}`

export function mechanicalKind(hunk: CruxHunk): CruxHunk['mechanical'] {
  const removed = changed(hunk, '-')
  const added = changed(hunk, '+')
  if (squash(removed) === squash(added)) return 'whitespace'
  const all = [...removed, ...added].filter(line => line.trim().length > 0)
  if (all.length > 0 && all.every(line => IMPORT.test(line))) return 'imports'
  return undefined
}

/** How many files the same edit must appear in to count as a sweep. */
export const SWEEP_FILES = 5

/** Marks hidden files, mechanical hunks, and files that are mechanical through and through. */
export function classify(files: CruxFile[], ignore: RegExp[]): CruxFile[] {
  const marked = files.map(file => {
    const hidden = hiddenBy(file.path, ignore)
    const hunks = file.hunks.map(hunk => {
      const kind = mechanicalKind(hunk)
      return kind === undefined ? hunk : { ...hunk, mechanical: kind }
    })
    return hidden === undefined ? { ...file, hunks } : { ...file, hunks, hidden }
  })

  const seenIn = new Map<string, Set<string>>()
  for (const file of marked) {
    if (file.hidden !== undefined) continue
    for (const hunk of file.hunks) {
      if (hunk.mechanical !== undefined) continue
      const sig = signature(hunk)
      seenIn.set(sig, (seenIn.get(sig) ?? new Set<string>()).add(file.path))
    }
  }

  return marked.map(file => {
    const hunks = file.hunks.map(hunk =>
      hunk.mechanical === undefined && (seenIn.get(signature(hunk))?.size ?? 0) > SWEEP_FILES
        ? { ...hunk, mechanical: 'sweep' as const }
        : hunk,
    )
    const isPureRename = file.status === 'renamed' && hunks.length === 0
    const mechanical =
      isPureRename || (hunks.length > 0 && hunks.every(hunk => hunk.mechanical !== undefined))
    return { ...file, hunks, mechanical }
  })
}

/** The hunks the summary model sees. */
export const coreHunks = (file: CruxFile): CruxHunk[] =>
  file.hunks.filter(hunk => hunk.mechanical === undefined)
