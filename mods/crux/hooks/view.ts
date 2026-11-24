// The crux tab's view: plain data that hscott-ui draws.
import type { HscottUiNode, HscottUiView } from 'hscott-ui'

import type { CruxFile, CruxResult } from '../types'

const STATUS: Record<CruxFile['status'], string> = {
  modified: '',
  added: 'new',
  untracked: 'new',
  deleted: 'deleted',
  renamed: 'renamed',
  binary: 'binary',
}

const HIDDEN_REASON: Record<NonNullable<CruxFile['hidden']>, string> = {
  test: 'test',
  docs: 'docs',
  generated: 'generated',
  ignored: 'ignored',
}

const counts = (file: CruxFile) =>
  [STATUS[file.status], `+${file.added} −${file.removed}`].filter(part => part.length > 0).join(' ')

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** The press key of a change row: crux hears it as `crux:open:<path>:<line>`. */
export const openKey = (path: string, line: number) => `open:${path}:${line}`

export function buildView(result: CruxResult): HscottUiView {
  if (result.state === 'not-a-repo') return [{ type: 'empty', text: 'Not a git repository.' }]
  if (result.state === 'error') {
    return [{ type: 'text', text: `git failed: ${result.message ?? 'unknown error'}`, color: 'red' }]
  }

  const hidden = result.files.filter(file => file.hidden !== undefined)
  const mechanical = result.files.filter(file => file.hidden === undefined && file.mechanical === true)
  const core = result.files.filter(file => file.hidden === undefined && file.mechanical !== true)
  if (result.files.length === 0) return [{ type: 'empty', text: 'No uncommitted changes.' }]

  const view: HscottUiNode[] = [
    {
      type: 'text',
      dim: true,
      text: [
        plural(core.length, 'core file'),
        mechanical.length > 0 ? `${mechanical.length} mechanical` : '',
        hidden.length > 0 ? `${hidden.length} hidden` : '',
      ]
        .filter(part => part.length > 0)
        .join(' · '),
    },
  ]

  if (core.length === 0) {
    view.push({ type: 'empty', text: 'Only tests, docs and mechanical changes.' })
  }

  for (const file of core) {
    const changes = result.changes[file.path] ?? []
    const coreChanges = changes.filter(change => change.kind === 'core')
    const minor = changes.filter(change => change.kind === 'mechanical')
    const children: HscottUiNode[] = coreChanges.map(change => ({
      type: 'row',
      key: openKey(file.path, change.line),
      badge: `L${change.line}`,
      title: change.title,
      ...(change.description === undefined ? {} : { detail: change.description }),
    }))
    if (minor.length > 0) {
      children.push({ type: 'row', dim: true, title: `+ ${plural(minor.length, 'minor change')}` })
    }
    if (result.pending.includes(file.path)) {
      children.push({ type: 'row', dim: true, title: 'Summarising…' })
    }
    view.push({ type: 'section', key: `file:${file.path}`, title: file.path, detail: counts(file), children })
  }

  if (mechanical.length > 0) {
    view.push({
      type: 'section',
      key: 'mechanical',
      title: `Mechanical (${mechanical.length})`,
      collapsed: true,
      children: mechanical.map(file => ({
        type: 'row',
        dim: true,
        title: file.path,
        detail: file.status === 'renamed' ? `renamed from ${file.oldPath ?? '?'}` : counts(file),
      })),
    })
  }

  if (hidden.length > 0) {
    view.push({
      type: 'section',
      key: 'hidden',
      title: `Hidden (${hidden.length})`,
      collapsed: true,
      children: hidden.map(file => ({
        type: 'row',
        dim: true,
        badge: HIDDEN_REASON[file.hidden!],
        title: file.path,
      })),
    })
  }

  return view
}
