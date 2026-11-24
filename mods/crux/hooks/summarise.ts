// Names each file's major changes: from the rules alone, or from a small model.
import type { CruxChange, CruxFile, CruxHunk } from '../types'
import { coreHunks } from './filter'

/** Changed lines past this are sent as hunk headings only. */
const MAX_CHANGED_LINES = 400

/** The most major changes one file is shown with. */
const MAX_CHANGES = 6

/** A change per core hunk, named by its enclosing function: no model needed. */
export function ruleChanges(file: CruxFile): CruxChange[] {
  if (file.status === 'binary') return [{ title: 'Binary file changed', line: 1, kind: 'core' }]
  const hunks = coreHunks(file)
  if (file.status === 'untracked' && hunks.length === 0) {
    return [{ title: 'New file (too big to read)', line: 1, kind: 'core' }]
  }
  return hunks.map(hunk => ({
    title:
      hunk.context.length > 0
        ? hunk.context
        : file.status === 'untracked' || file.status === 'added'
          ? 'New file'
          : `Change at line ${hunk.newStart}`,
    description: `+${hunk.added} −${hunk.removed}`,
    line: hunk.newStart,
    kind: 'core' as const,
  }))
}

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')

/** Same path and same core hunks, same key: a file is only summarised again when it changes. */
export async function cacheKey(file: CruxFile, model: string): Promise<string> {
  const text = [model, file.path, ...coreHunks(file).flatMap(hunk => hunk.lines)].join('\n')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return hex(digest).slice(0, 40)
}

export const SYSTEM = [
  'You review code diffs and name the crux of each change for a developer who is about to commit.',
  'Answer with a JSON array and nothing else.',
].join(' ')

/** The hunks sent in full, and those cut to their headings to stay in budget. */
function budget(hunks: CruxHunk[]): { full: number[]; cut: number[] } {
  const full: number[] = []
  const cut: number[] = []
  let used = 0
  hunks.forEach((hunk, i) => {
    const size = hunk.added + hunk.removed
    if (used + size <= MAX_CHANGED_LINES || full.length === 0) {
      full.push(i)
      used += size
    } else cut.push(i)
  })
  return { full, cut }
}

export function buildPrompt(file: CruxFile): string {
  const hunks = coreHunks(file)
  const { full, cut } = budget(hunks)
  const parts = [
    `File: ${file.path}${file.oldPath === undefined ? '' : ` (renamed from ${file.oldPath})`}`,
    `Status: ${file.status}, +${file.added} −${file.removed}`,
    '',
    'Hunks:',
  ]
  for (const i of full) {
    const hunk = hunks[i]!
    parts.push(`[${i}] @@ +${hunk.newStart} @@ ${hunk.context}`, ...hunk.lines, '')
  }
  for (const i of cut) {
    const hunk = hunks[i]!
    parts.push(`[${i}] @@ +${hunk.newStart} @@ ${hunk.context} (+${hunk.added} −${hunk.removed}, lines not shown)`)
  }
  parts.push(
    '',
    'Group the hunks into the major changes a reviewer must understand, most important first,',
    `at most ${MAX_CHANGES}. For each, give:`,
    '{"hunks": [hunk numbers], "kind": "core" or "mechanical", "title": "8 words or fewer",',
    '"description": "20 words or fewer: what changed and its effect"}',
    'kind is "mechanical" for renames, formatting, moved code, logging, or refactors that keep behaviour.',
    'Every hunk number belongs to exactly one change.',
  )
  return parts.join('\n')
}

type Reply = { hunks?: unknown; kind?: unknown; title?: unknown; description?: unknown }

/** The model's JSON, checked; undefined when it is not usable. */
export function parseReply(text: string, file: CruxFile): CruxChange[] | undefined {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return undefined
  let items: unknown
  try {
    items = JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (!Array.isArray(items)) return undefined

  const hunks = coreHunks(file)
  const changes: CruxChange[] = []
  for (const item of items as Reply[]) {
    if (typeof item?.title !== 'string' || item.title.trim().length === 0) continue
    const indices = Array.isArray(item.hunks)
      ? item.hunks.filter((i): i is number => typeof i === 'number' && hunks[i] !== undefined)
      : []
    const line = indices.length > 0 ? Math.min(...indices.map(i => hunks[i]!.newStart)) : (hunks[0]?.newStart ?? 1)
    changes.push({
      title: item.title.trim(),
      ...(typeof item.description === 'string' && item.description.trim().length > 0
        ? { description: item.description.trim() }
        : {}),
      line,
      kind: item.kind === 'mechanical' ? 'mechanical' : 'core',
    })
  }
  return changes.length > 0 ? changes.slice(0, MAX_CHANGES) : undefined
}
