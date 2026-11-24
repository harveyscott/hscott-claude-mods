import type { Register } from 'claude-code'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hello', description: 'Say hello from the hello mod' })
    return next(e)
  })

  on('command.run', { command: 'hello' }, async $ => {
    const version = await $.hscott.version()
    const text = await $.hscott.format($.plugin.name, `Hello! hscott-common ${version} is loaded.`)
    return { text }
  })
}
