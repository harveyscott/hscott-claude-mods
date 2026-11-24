import type { EngineInterface, Register, Timer } from 'claude-code'

import type { CruxChange, CruxFile, CruxResult } from '../types'
import { collect, findGit, GIT_CANDIDATES } from './collect'
import { classify, parseIgnore } from './filter'
import { buildPrompt, cacheKey, parseReply, ruleChanges, SYSTEM } from './summarise'
import { buildView } from './view'

const RESULT = { plugin: 'crux', key: 'result' } as const
const SUMMARIES = { plugin: 'crux', key: 'summaries' } as const

const TAB = 'crux'
const OPEN_PREFIX = `${TAB}:open:`

/** Waits this long after a turn so a burst of turns (subagents) refreshes once. */
const DEBOUNCE_MS = 1500

/** Files summarised at the same time. */
const PARALLEL = 3

type Config = { ignore: RegExp[]; model: string; autoSummarise: boolean; gitPath: string }

// Set by register from the person's options; a reload sets it again.
let config: Config = { ignore: [], model: 'claude-haiku-5-5', autoSummarise: true, gitPath: '' }

// The git program that worked, found once per load.
let git: string | undefined

async function resolveGit($: EngineInterface): Promise<string | undefined> {
  if (git !== undefined) return git
  const candidates = config.gitPath.length > 0 ? [config.gitPath, ...GIT_CANDIDATES] : GIT_CANDIDATES
  git = await findGit(argv => $.process.run(argv, { timeoutMs: 10_000 }), candidates)
  return git
}

// Only for not running two refreshes at once: losing them at a reload is harmless.
let timer: Timer | undefined
let running = false
let again = false

async function show($: EngineInterface, result: CruxResult): Promise<void> {
  await $.state.set(RESULT, result)
  await $.hscottUi.setView({ id: TAB, view: buildView(result) })
}

async function failed($: EngineInterface, state: 'not-a-repo' | 'error', message?: string): Promise<void> {
  await show($, {
    state,
    ...(message === undefined ? {} : { message }),
    files: [],
    changes: {},
    pending: [],
    at: await $.clock.now(),
  })
}

async function summarise($: EngineInterface, file: CruxFile): Promise<CruxChange[]> {
  const reply = await $.model.complete({
    model: config.model,
    system: SYSTEM,
    prompt: buildPrompt(file),
    maxTokens: 800,
  })
  if (!reply.isAnswered) return ruleChanges(file)
  const changes = parseReply(reply.text, file)
  if (changes === undefined) return ruleChanges(file)
  await $.state.set({ ...SUMMARIES, id: await cacheKey(file, config.model) }, { changes, isFromModel: true })
  return changes
}

async function refreshOnce($: EngineInterface): Promise<void> {
  const program = await resolveGit($)
  if (program === undefined) {
    return failed(
      $,
      'error',
      'Claude Code could not start git. Set crux’s “Git path” option to your git executable.',
    )
  }
  const collected = await collect(
    argv => $.process.run(argv, { timeoutMs: 20_000 }),
    path => $.fs.read(path),
    program,
  )
  if (collected.state === 'not-a-repo') return failed($, 'not-a-repo')
  if (collected.state === 'error') return failed($, 'error', collected.message)

  const files = classify(collected.files, config.ignore)
  const core = files.filter(file => file.hidden === undefined && file.mechanical !== true)
  const changes: Record<string, CruxChange[]> = {}
  const toSummarise: CruxFile[] = []

  for (const file of core) {
    const { value: cached } = await $.state.get({ ...SUMMARIES, id: await cacheKey(file, config.model) })
    if (cached !== undefined) changes[file.path] = cached.changes
    else {
      changes[file.path] = ruleChanges(file)
      if (config.autoSummarise && file.status !== 'binary' && file.hunks.length > 0) toSummarise.push(file)
    }
  }

  let result: CruxResult = {
    state: 'ready',
    root: collected.root,
    files,
    changes,
    pending: toSummarise.map(file => file.path),
    at: await $.clock.now(),
  }
  await show($, result)

  // Each summary lands in the pane as soon as it is back.
  const queue = [...toSummarise]
  const worker = async () => {
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
      const path = file.path
      const named = await summarise($, file)
      result = {
        ...result,
        changes: { ...result.changes, [path]: named },
        pending: result.pending.filter(one => one !== path),
      }
      await show($, result)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker))
}

async function refresh($: EngineInterface): Promise<void> {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      await refreshOnce($)
    } while (again)
  } catch (error) {
    await failed($, 'error', error instanceof Error ? error.message : String(error))
  } finally {
    running = false
  }
}

function schedule($: EngineInterface, ms: number = DEBOUNCE_MS): void {
  timer?.cancel()
  timer = $.clock.after(ms, () => {
    void refresh($)
  })
}

export const register: Register = (on, options) => {
  config = {
    ignore: parseIgnore(typeof options.ignore === 'string' ? options.ignore : ''),
    model: typeof options.model === 'string' && options.model.length > 0 ? options.model : 'claude-haiku-5-5',
    autoSummarise: options.autoSummarise !== false,
    gitPath: typeof options.gitPath === 'string' ? options.gitPath.trim() : '',
  }
  git = undefined

  on('session.start', async ($, e, next) => {
    await $.hscottUi.register({ id: TAB, title: 'Crux', open: true })
    await $.command.register({
      name: 'crux',
      description: 'Show the crux pane (/crux refresh to re-read the changes)',
    })
    schedule($, 100)
    return next(e)
  })

  on('command.run', { command: 'crux' }, async ($, e) => {
    if (e.args.trim() === 'refresh') {
      await refresh($)
      const { value } = await $.state.get(RESULT)
      const shown = value?.files.filter(file => file.hidden === undefined && file.mechanical !== true) ?? []
      return { text: `crux: ${shown.length} core file${shown.length === 1 ? '' : 's'}.` }
    }
    const opened = await $.hscottUi.open({ id: TAB })
    schedule($, 100)
    return {
      text: opened.isPlaced ? 'Crux pane opened.' : `Crux pane is open but not shown: ${opened.reason ?? ''}`,
    }
  })

  // Every turn may have changed files, the main agent's or a subagent's.
  on('turn.complete', async ($, e, next) => {
    schedule($)
    return next(e)
  })

  // A commit empties the list: refresh soon after one.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\bgit\b[^|;&]*\bcommit\b/.test(String(e.command))) schedule($, 300)
    return ran
  }).catch(($, e, next) => next(e)) // crux never stands in a tool call's way

  // A change row was pressed in the pane hscott-ui draws for us.
  on('ui.press', { plugin: 'hscott-ui' }, async ($, e, next) => {
    const pressed = await next(e)
    if (e.element.startsWith(OPEN_PREFIX)) {
      await $.prompt.fill({ text: `${e.element.slice(OPEN_PREFIX.length)} `, mode: 'insert' })
    }
    return pressed
  })
}
