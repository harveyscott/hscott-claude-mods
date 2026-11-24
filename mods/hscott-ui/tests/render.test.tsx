import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const VIEW = [
  {
    type: 'section' as const,
    key: 'files',
    title: 'Files',
    detail: '+3 −1',
    children: [
      { type: 'row' as const, key: 'open:src/a.ts', title: 'src/a.ts', detail: 'Adds a cache' },
    ],
  },
  { type: 'empty' as const, text: 'Nothing else.' },
]

const PANE = {
  plugin: 'hscott-ui',
  component: 'Pane',
  requestId: 'hscott-demo',
  props: {
    title: 'Demo',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

// The test's $ carries no plugin nouns, so it stands in for what
// $.hscottUi.register and setView store: the demo tab and its view. Every
// other key (the collapsed flags) goes to the kit's own state.
const seed = (on: On) => {
  on('state.get', (_, e, next) => {
    if (e.plugin !== 'hscott-ui') return next(e)
    if (e.key === 'tabs') return { value: { value: [{ id: 'demo', title: 'Demo' }], version: 1 } }
    if (e.key === 'views' && e.id === 'demo') return { value: { value: VIEW, version: 1 } }
    return next(e)
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: draws a tab's view and collapses a section`, async ($, on) => {
    seed(on)
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ key: 'demo:open:src/a.ts' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /Adds a cache/ }))?.text).toContain('Adds a cache')

    await ui.press({ key: 'demo:section:files' })
    expect(await ui.find({ key: 'demo:open:src/a.ts' })).toBeUndefined()

    await ui.press({ key: 'demo:section:files' })
    expect(await ui.find({ key: 'demo:open:src/a.ts' })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: another hook hears a row's press with its tab prefix`, async ($, on) => {
    seed(on)
    const heard: string[] = []
    on('ui.press', { plugin: 'hscott-ui' }, async (_, e, next) => {
      heard.push(e.element)
      return next(e)
    })

    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'demo:open:src/a.ts' })

    expect(heard).toContain('demo:open:src/a.ts')
    await ui.unmount()
  })
}

test('a pane hscott-ui did not open goes to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...PANE, requestId: 'other', surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
