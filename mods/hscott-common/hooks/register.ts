import type { Register } from 'claude-code'
import type { Hscott } from '../types'

const VERSION = '0.1.0'

const hscott: Hscott = {
  format: async ({ mod, message }) => `[${mod}] ${message}`,
  version: async () => VERSION,
}

export const register: Register = on => {
  // Adds `$.hscott` for every mod loaded alongside this one.
  on('engine.create', async ($, e, next) => {
    const beneath = await next(e)
    return { ...beneath, hscott }
  })
}
