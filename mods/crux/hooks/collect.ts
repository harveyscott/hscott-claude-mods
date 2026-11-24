// What git says changed since HEAD, tracked and untracked.
import type { CruxFile, CruxHunk } from '../types'

export type Run = (argv: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
export type ReadFile = (path: string) => Promise<string>

/** Plain git output whatever the person's config says. */
const GIT = ['git', '-c', 'core.quotepath=off', '-c', 'color.ui=never', '--no-pager']

/** Git's empty tree: the base for a repository with no commit yet. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** Untracked files bigger than this are listed without their lines. */
const MAX_UNTRACKED_CHARS = 200_000

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/

/** Parses `git diff` output into files and hunks. */
export function parseDiff(text: string): CruxFile[] {
  const files: CruxFile[] = []
  let file: CruxFile | undefined
  let hunk: CruxHunk | undefined

  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.*) b\/(.*)$/.exec(line)
      file = { path: match?.[2] ?? line.slice(11), status: 'modified', added: 0, removed: 0, hunks: [] }
      hunk = undefined
      files.push(file)
      continue
    }
    if (file === undefined) continue

    const head = HUNK.exec(line)
    if (head !== null) {
      hunk = {
        newStart: Number(head[3]),
        context: (head[5] ?? '').trim(),
        lines: [],
        added: 0,
        removed: 0,
      }
      file.hunks.push(hunk)
      continue
    }

    if (hunk === undefined) {
      if (line.startsWith('new file mode')) file.status = 'added'
      else if (line.startsWith('deleted file mode')) file.status = 'deleted'
      else if (line.startsWith('rename from ')) {
        file.status = 'renamed'
        file.oldPath = line.slice('rename from '.length)
      } else if (line.startsWith('rename to ')) file.path = line.slice('rename to '.length)
      else if (line.startsWith('Binary files ')) file.status = 'binary'
      continue
    }

    if (line.startsWith('+')) {
      hunk.lines.push(line)
      hunk.added++
      file.added++
    } else if (line.startsWith('-')) {
      hunk.lines.push(line)
      hunk.removed++
      file.removed++
    } else if (line.startsWith(' ')) hunk.lines.push(line)
  }
  return files
}

/** An untracked file as one hunk of added lines; no text means too big or unreadable. */
export function untrackedFile(path: string, text: string | undefined): CruxFile {
  if (text === undefined) return { path, status: 'untracked', added: 0, removed: 0, hunks: [] }
  if (text.includes('\u0000')) return { path, status: 'binary', added: 0, removed: 0, hunks: [] }
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map(line => `+${line}`)
  return {
    path,
    status: 'untracked',
    added: lines.length,
    removed: 0,
    hunks: [{ newStart: 1, context: '', lines, added: lines.length, removed: 0 }],
  }
}

export type Collected =
  | { state: 'ready'; root: string; files: CruxFile[] }
  | { state: 'not-a-repo' }
  | { state: 'error'; message: string }

export async function collect(run: Run, read: ReadFile): Promise<Collected> {
  const top = await run([...GIT, 'rev-parse', '--show-toplevel'])
  if (top.exitCode !== 0) return { state: 'not-a-repo' }
  const root = top.stdout.trim()

  const head = await run([...GIT, '-C', root, 'rev-parse', '--verify', '-q', 'HEAD'])
  const base = head.exitCode === 0 ? 'HEAD' : EMPTY_TREE

  const diff = await run([...GIT, '-C', root, 'diff', base, '-M', '-U3', '--no-ext-diff'])
  if (diff.exitCode !== 0) {
    return { state: 'error', message: diff.stderr.trim() || 'git diff failed' }
  }

  const others = await run([...GIT, '-C', root, 'ls-files', '--others', '--exclude-standard', '-z'])
  const untracked = others.stdout.split('\u0000').filter(path => path.length > 0)

  const files = parseDiff(diff.stdout)
  for (const path of untracked) {
    let text: string | undefined
    try {
      const body = await read(`${root}/${path}`)
      text = body.length > MAX_UNTRACKED_CHARS ? undefined : body
    } catch {
      text = undefined
    }
    files.push(untrackedFile(path, text))
  }
  return { state: 'ready', root, files }
}
