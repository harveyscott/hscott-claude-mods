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

/**
 * Stands in for git, the model and hscott-ui; returns what crux sent each.
 * `startable` is the one git program name that starts (a bare `git` by default).
 */
const world = (on: On, startable = 'git') => {
  const clock = mock.clock(on)
  const views: unknown[][] = []
  const programs: string[] = []
  let modelCalls = 0
  // Crux registers with open: true, so its pane starts open.
  const pane = { isOpen: true }

  on('engine.create', async (_, e, next) => ({
    ...(await next(e)),
    hscottUi: {
      register: async () => undefined,
      setView: async ({ view }: { id: string; view: unknown[] }) => {
        views.push(view)
      },
      open: async () => {
        pane.isOpen = true
        return { isPlaced: true }
      },
      close: async () => {
        pane.isOpen = false
      },
      toggle: async () => {
        pane.isOpen = !pane.isOpen
        return pane.isOpen ? { isOpen: true, isPlaced: true } : { isOpen: false }
      },
    },
  }))
  on('command.register', () => ({ value: { command: 'crux' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => {
    if (e.argv[0] !== startable) throw new Error(`ENOENT: Command '${e.argv[0]}' not found`)
    programs.push(e.argv[0])
    const argv = e.argv.join(' ')
    if (argv.endsWith('--version')) {
      return {
        value: { exitCode: 0, stdout: 'git version 2.47.0\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
      }
    }
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

  return { clock, views, programs, pane, modelCalls: () => modelCalls }
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

test('when a bare git cannot start, git is found at its install path', async ($, on) => {
  const seen = world(on, 'C:/Program Files/Git/cmd/git.exe')
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const done = await $.command.run({ command: 'crux', args: 'refresh' })
  expect(done.text).toBe('crux: 1 core file.')
  expect(new Set(seen.programs)).toEqual(new Set(['C:/Program Files/Git/cmd/git.exe']))
})

test('the Git path option is tried first', { options: { gitPath: 'D:/tools/git/bin/git.exe' } }, async ($, on) => {
  const seen = world(on, 'D:/tools/git/bin/git.exe')
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'crux', args: 'refresh' })
  expect(seen.programs[0]).toBe('D:/tools/git/bin/git.exe')
})

test('with no git anywhere the pane says how to fix it', async ($, on) => {
  const seen = world(on, 'nowhere')
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'crux', args: 'refresh' })
  expect(JSON.stringify(seen.views.at(-1))).toContain('Git path')
})

test('/crux toggles the pane; /crux close and /crux open are explicit', async ($, on) => {
  const seen = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect((await $.command.run({ command: 'crux', args: '' })).text).toBe('Crux pane closed. /crux opens it again.')
  expect(seen.pane.isOpen).toBe(false)

  expect((await $.command.run({ command: 'crux', args: '' })).text).toBe('Crux pane opened.')
  expect(seen.pane.isOpen).toBe(true)

  await $.command.run({ command: 'crux', args: 'close' })
  expect(seen.pane.isOpen).toBe(false)
  await $.command.run({ command: 'crux', args: 'close' })
  expect(seen.pane.isOpen).toBe(false)

  await $.command.run({ command: 'crux', args: 'open' })
  expect(seen.pane.isOpen).toBe(true)
})

test('/crux with an unknown word says what it takes', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const done = await $.command.run({ command: 'crux', args: 'shut' })
  expect(done.text).toContain('/crux open, close, refresh or options')
})
