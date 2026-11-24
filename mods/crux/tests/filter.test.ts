import { describe, expect, test } from 'claude-code/testing'

import type { CruxFile, CruxHunk } from '../types'
import { parseDiff, untrackedFile } from '../hooks/collect'
import { classify, globToRegExp, hiddenBy, mechanicalKind, parseIgnore, SWEEP_FILES } from '../hooks/filter'
import { parseReply, ruleChanges } from '../hooks/summarise'
import { buildView } from '../hooks/view'

const DIFF = [
  'diff --git a/src/cache.ts b/src/cache.ts',
  'index 1111111..2222222 100644',
  '--- a/src/cache.ts',
  '+++ b/src/cache.ts',
  '@@ -1,3 +1,4 @@',
  "+import { hash } from './hash'",
  " import { store } from './store'",
  ' ',
  ' export const x = 1',
  '@@ -10,4 +11,6 @@ export function get(key: string) {',
  '-  return store.get(key)',
  '+  const hit = store.get(hash(key))',
  '+  if (hit === undefined) return load(key)',
  '+  return hit',
  ' }',
  'diff --git a/src/old.ts b/src/new.ts',
  'similarity index 100%',
  'rename from src/old.ts',
  'rename to src/new.ts',
  'diff --git a/README.md b/README.md',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1 +1 @@',
  '-# Old',
  '+# New',
  '',
].join('\n')

const hunk = (lines: string[]): CruxHunk => ({
  newStart: 1,
  context: '',
  lines,
  added: lines.filter(l => l.startsWith('+')).length,
  removed: lines.filter(l => l.startsWith('-')).length,
})

describe('parseDiff', () => {
  test('reads files, hunks, renames and counts', () => {
    const files = parseDiff(DIFF)
    expect(files.map(f => f.path)).toEqual(['src/cache.ts', 'src/new.ts', 'README.md'])

    const cache = files[0]!
    expect(cache.hunks.length).toBe(2)
    expect(cache.added).toBe(4)
    expect(cache.removed).toBe(1)
    expect(cache.hunks[1]!.newStart).toBe(11)
    expect(cache.hunks[1]!.context).toBe('export function get(key: string) {')

    expect(files[1]!.status).toBe('renamed')
    expect(files[1]!.oldPath).toBe('src/old.ts')
  })

  test('handles CRLF output', () => {
    expect(parseDiff(DIFF.replace(/\n/g, '\r\n'))[0]!.hunks.length).toBe(2)
  })

  test('an untracked file is one hunk of added lines', () => {
    const file = untrackedFile('src/a.ts', 'one\r\ntwo\n')
    expect(file.added).toBe(2)
    expect(file.hunks[0]!.lines).toEqual(['+one', '+two'])
    expect(untrackedFile('x.bin', 'a\u0000b').status).toBe('binary')
  })
})

describe('hiding by path', () => {
  test('tests, docs and generated files are hidden; source is not', () => {
    expect(hiddenBy('src/cache.test.ts', [])).toBe('test')
    expect(hiddenBy('tests/test_cache.py', [])).toBe('test')
    expect(hiddenBy('pkg/cache_test.go', [])).toBe('test')
    expect(hiddenBy('src/__tests__/a.ts', [])).toBe('test')
    expect(hiddenBy('README.md', [])).toBe('docs')
    expect(hiddenBy('docs/guide.html', [])).toBe('docs')
    expect(hiddenBy('package-lock.json', [])).toBe('generated')
    expect(hiddenBy('dist/index.js', [])).toBe('generated')
    expect(hiddenBy('src/cache.ts', [])).toBeUndefined()
    expect(hiddenBy('src/contest.ts', [])).toBeUndefined()
  })

  test('the person’s globs hide too', () => {
    const ignore = parseIgnore(' src/generated/**, *.sql ,')
    expect(hiddenBy('src/generated/api.ts', ignore)).toBe('ignored')
    expect(hiddenBy('db/migrate/001.sql', ignore)).toBe('ignored')
    expect(hiddenBy('src/api.ts', ignore)).toBeUndefined()
    expect(globToRegExp('**/*.proto').test('a/b/c.proto')).toBe(true)
    expect(globToRegExp('**/*.proto').test('c.proto')).toBe(true)
  })
})

describe('mechanical hunks', () => {
  test('whitespace-only and import-only hunks are mechanical; logic is not', () => {
    expect(mechanicalKind(hunk(['-  return a+b', '+  return a + b']))).toBe('whitespace')
    expect(mechanicalKind(hunk(["-import { a } from 'x'", "+import { a, b } from 'x'"]))).toBe('imports')
    expect(mechanicalKind(hunk(['-from os import path', '+from os import path, sep']))).toBe('imports')
    expect(mechanicalKind(hunk(['-  return a', '+  return b']))).toBeUndefined()
  })

  test('the same edit in many files is a sweep', () => {
    const edit = hunk(['-  oldName()', '+  newName()'])
    const files: CruxFile[] = Array.from({ length: SWEEP_FILES + 1 }, (_, i) => ({
      path: `src/f${i}.ts`,
      status: 'modified',
      added: 1,
      removed: 1,
      hunks: [edit],
    }))
    const classified = classify(files, [])
    expect(classified.every(f => f.mechanical === true)).toBe(true)
    expect(classified[0]!.hunks[0]!.mechanical).toBe('sweep')
  })

  test('a file mixing an import and logic stays core with the import marked', () => {
    const [cache] = classify(parseDiff(DIFF), [])
    expect(cache!.mechanical).toBe(false)
    expect(cache!.hunks[1]!.mechanical).toBeUndefined()
  })
})

describe('summaries', () => {
  const [cache] = classify(parseDiff(DIFF), [])

  test('rules name a change by its enclosing function', () => {
    const changes = ruleChanges(cache!)
    expect(changes.map(c => c.title)).toContain('export function get(key: string) {')
  })

  test('a model reply is read even with prose around it, and junk is refused', () => {
    const reply =
      'Here you go:\n[{"hunks":[1],"kind":"core","title":"Cache lookups by hashed key","description":"Falls back to load on a miss."}]'
    const changes = parseReply(reply, cache!)
    expect(changes?.[0]?.title).toBe('Cache lookups by hashed key')
    expect(changes?.[0]?.line).toBe(11)
    expect(parseReply('no json here', cache!)).toBeUndefined()
    expect(parseReply('[{"nope":1}]', cache!)).toBeUndefined()
  })
})

describe('the view', () => {
  test('core files lead; hidden and mechanical are counted and collapsed', () => {
    const files = classify(parseDiff(DIFF), [])
    const view = buildView({
      state: 'ready',
      files,
      changes: { 'src/cache.ts': [{ title: 'Hash keys', line: 11, kind: 'core' }] },
      pending: [],
      at: 0,
    })
    const sections = view.filter(n => n.type === 'section')
    expect(sections.map(s => (s.type === 'section' ? s.title : ''))).toEqual([
      'src/cache.ts',
      'Mechanical (1)',
      'Hidden (1)',
    ])
    const file = sections[0]!
    expect(file.type === 'section' && file.children[0]).toMatchObject({
      type: 'row',
      key: 'open:src/cache.ts:11',
      title: 'Hash keys',
    })
  })

  test('empty and not-a-repo states say so', () => {
    expect(buildView({ state: 'ready', files: [], changes: {}, pending: [], at: 0 })).toEqual([
      { type: 'empty', text: 'No uncommitted changes.' },
    ])
    expect(buildView({ state: 'not-a-repo', files: [], changes: {}, pending: [], at: 0 })[0]).toMatchObject({
      type: 'empty',
    })
  })
})
