import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Two registered tabs, standing in for what $.hscottUi.register stores, and
// a record of the panes /panel opens and closes.
const world = (on: On) => {
  const opened: string[] = []
  const closed: string[] = []
  on('state.get', (_, e, next) => {
    if (e.plugin === 'hscott-ui' && e.key === 'tabs') {
      return {
        value: {
          value: [
            { id: 'crux', title: 'Crux' },
            { id: 'other', title: 'Other' },
          ],
          version: 1,
        },
      }
    }
    return next(e)
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  return { opened, closed }
}

const panel = async ($: Parameters<Parameters<typeof test>[1]>[0], args: string) => {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return $.command.run({ command: 'panel', args })
}

test('/panel opens every tab', async ($, on) => {
  const seen = world(on)
  const done = await panel($, '')
  expect(seen.opened).toEqual(['hscott-crux', 'hscott-other'])
  expect(done.text).toBe('Opened: Crux, Other')
})

test('/panel close closes every tab', async ($, on) => {
  const seen = world(on)
  await panel($, 'close')
  expect(seen.closed).toEqual(['hscott-crux', 'hscott-other'])
  expect(seen.opened).toEqual([])
})

test('/panel close <tab> and /panel <tab> act on that tab alone', async ($, on) => {
  const seen = world(on)
  await panel($, 'close crux')
  await $.command.run({ command: 'panel', args: 'other' })
  expect(seen.closed).toEqual(['hscott-crux'])
  expect(seen.opened).toEqual(['hscott-other'])
})

test('/panel <unknown> names the tabs there are', async ($, on) => {
  world(on)
  const done = await panel($, 'nope')
  expect(done.text).toBe('No tab "nope". Tabs: crux, other')
})
