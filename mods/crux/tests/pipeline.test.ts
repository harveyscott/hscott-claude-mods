import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const DIFF = [
  'diff --git a/src/cache.ts b/src/cache.ts',
  '--- a/src/cache.ts',
  '+++ b/src/cache.ts',
  '@@ -10,4 +10,6 @@ export function get(key: string) {',
  '-  return store.get(key)',
  '+  const hit = store.get(hash(key))',
  '+  if (hit === undefined) return load(key)',
  '+  return hit',
  ' }',
  'diff --git a/src/cache.test.ts b/src/cache.test.ts',
  '--- a/src/cache.test.ts',
  '+++ b/src/cache.test.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  '',
].join('\n')

const REPLY =
  '[{"hunks":[0],"kind":"core","title":"Look up by hashed key","description":"Misses now fall back to load()."}]'

/** Stands in for git, the model and hscott-ui; returns what crux sent each. */
const world = (on: On) => {
  const clock = mock.clock(on)
  const views: unknown[][] = []
  let modelCalls = 0

  on('engine.create', async (_, e, next) => ({
    ...(await next(e)),
    hscottUi: {
      register: async () => undefined,
      setView: async ({ view }: { id: string; view: unknown[] }) => {
        views.push(view)
      },
      open: async () => ({ isPlaced: true }),
      close: async () => undefined,
    },
  }))
  on('command.register', () => ({ value: { command: 'crux' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')
    const out = (stdout: string, exitCode = 0) => ({
      value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })
    if (argv.includes('--show-toplevel')) return out('/repo\n')
    if (argv.includes('--verify')) return out('abc\n')
    if (argv.includes(' diff ')) return out(DIFF)
    if (argv.includes('ls-files')) return out('')
    return out('', 1)
  })
  on('model.complete', () => {
    modelCalls++
    return { value: { isAnswered: true, text: REPLY, usage: {} } }
  })

  return { clock, views, modelCalls: () => modelCalls }
}

test('a refresh shows the core file named by the model, and caches it', async ($, on) => {
  const seen = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const first = await $.command.run({ command: 'crux', args: 'refresh' })
  expect(first.text).toBe('crux: 1 core file.')
  expect(seen.modelCalls()).toBe(1)

  const last = JSON.stringify(seen.views.at(-1))
  expect(last).toContain('Look up by hashed key')
  expect(last).toContain('Hidden (1)')
  expect(last).not.toContain('Summarising')

  await $.command.run({ command: 'crux', args: 'refresh' })
  expect(seen.modelCalls()).toBe(1)
})

test('with autoSummarise off no model call is made', { options: { autoSummarise: false } }, async ($, on) => {
  const seen = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'crux', args: 'refresh' })

  expect(seen.modelCalls()).toBe(0)
  expect(JSON.stringify(seen.views.at(-1))).toContain('export function get(key: string) {')
})

test('session start refreshes on its own once the debounce passes', async ($, on) => {
  const seen = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(seen.views.length).toBe(0)

  await seen.clock.advance(200)
  expect(JSON.stringify(seen.views.at(-1))).toContain('Look up by hashed key')
})
