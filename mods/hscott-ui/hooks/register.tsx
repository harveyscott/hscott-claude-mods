import type { Register } from 'claude-code'

import type { HscottUiSetViewInput, HscottUiTab, HscottUiTabRef } from '../types'
import { drawView } from './render'

const TABS = { plugin: 'hscott-ui', key: 'tabs' } as const
const VIEWS = { plugin: 'hscott-ui', key: 'views' } as const

/** Every tab is a pane of its own, so the engine draws the tab strip. */
const PANE_PREFIX = 'hscott-'
const VALID_ID = /^[A-Za-z0-9_-]{1,56}$/

export const register: Register = on => {
  on('engine.create', async ($, e, next) => {
    const beneath = await next(e)
    return {
      ...beneath,
      hscottUi: {
        register: async (tab: HscottUiTab) => {
          if (!VALID_ID.test(tab.id)) throw new Error(`hscott-ui: bad tab id "${tab.id}"`)
          for (let attempt = 0; attempt < 5; attempt++) {
            const { value = [], version } = await beneath.state.get(TABS)
            const tabs = [...value.filter(one => one.id !== tab.id), tab]
            const set = await beneath.state.set(TABS, tabs, { ifVersion: version })
            if (set.isSet) break
          }
          if (tab.open === true) {
            await beneath.ui.open({ id: `hscott-${tab.id}`, title: tab.title })
          }
        },
        setView: async ({ id, view }: HscottUiSetViewInput) => {
          await beneath.state.set({ ...VIEWS, id }, view)
        },
        open: async ({ id }: HscottUiTabRef) => {
          const { value = [] } = await beneath.state.get(TABS)
          const tab = value.find(one => one.id === id)
          if (tab === undefined) return { isPlaced: false, reason: `no tab "${id}"` }
          return beneath.ui.open({ id: `hscott-${tab.id}`, title: tab.title })
        },
        close: async ({ id }: HscottUiTabRef) => {
          await beneath.ui.close({ id: `hscott-${id}` })
        },
        toggle: async ({ id }: HscottUiTabRef) => {
          const panes = await beneath.ui.panes()
          if (panes.some(pane => pane.id === `hscott-${id}`)) {
            await beneath.ui.close({ id: `hscott-${id}` })
            return { isOpen: false }
          }
          const { value = [] } = await beneath.state.get(TABS)
          const tab = value.find(one => one.id === id)
          if (tab === undefined) return { isOpen: false, reason: `no tab "${id}"` }
          const opened = await beneath.ui.open({ id: `hscott-${tab.id}`, title: tab.title })
          return opened.isPlaced
            ? { isOpen: true, isPlaced: true }
            : { isOpen: true, isPlaced: false, reason: opened.reason }
        },
      },
    }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'panel',
      description: 'Open the hscott mods panes: /panel [close] [tab]',
      argumentHint: '[close] [tab]',
    })
    return next(e)
  })

  // /panel opens every tab's pane, /panel close closes them; a tab id narrows either to one.
  on('command.run', { command: 'panel' }, async ($, e) => {
    const words = e.args.trim().split(/\s+/).filter(word => word.length > 0)
    const isClose = words[0] === 'close'
    const only = isClose ? words[1] : words[0]

    const { value: registered = [] } = await $.state.get(TABS)
    if (registered.length === 0) return { text: 'No hscott mod has registered a tab.' }
    const tabs = only === undefined ? registered : registered.filter(tab => tab.id === only)
    if (tabs.length === 0) {
      return { text: `No tab "${only}". Tabs: ${registered.map(tab => tab.id).join(', ')}` }
    }

    for (const tab of tabs) {
      if (isClose) await $.ui.close({ id: `${PANE_PREFIX}${tab.id}` })
      else await $.ui.open({ id: `${PANE_PREFIX}${tab.id}`, title: tab.title })
    }
    return { text: `${isClose ? 'Closed' : 'Opened'}: ${tabs.map(tab => tab.title).join(', ')}` }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (!e.requestId.startsWith(PANE_PREFIX)) return next(e)
    const id = e.requestId.slice(PANE_PREFIX.length)
    const { value: view = [{ type: 'empty', text: 'Nothing to show yet.' }] } = await $.state.get({
      ...VIEWS,
      id,
    })
    return drawView($, e, id, view)
  })
}
