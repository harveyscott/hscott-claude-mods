// crux's own types and the session values it keeps in $.state.

/** One `@@` hunk of a file's diff against HEAD. */
export type CruxHunk = {
  /** The new file's first line of the hunk. */
  newStart: number
  /** The text after the second `@@`: usually the enclosing function. */
  context: string
  /** The hunk's changed and context lines, each with its ` `, `+` or `-`. */
  lines: string[]
  added: number
  removed: number
  /** Set when rules find it mechanical: whitespace, imports, a repeated sweep. */
  mechanical?: 'whitespace' | 'imports' | 'sweep'
}

export type CruxFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'binary'

/** One changed file, as git reports it and crux classifies it. */
export type CruxFile = {
  path: string
  oldPath?: string
  status: CruxFileStatus
  added: number
  removed: number
  hunks: CruxHunk[]
  /** Why crux hides the file, by path rule. */
  hidden?: 'test' | 'docs' | 'generated' | 'ignored'
  /** True when every hunk (or a 100% rename) is mechanical. */
  mechanical?: boolean
}

/** One major change in a file, as the summary model (or the rules) named it. */
export type CruxChange = {
  title: string
  description?: string
  /** The new file's line the change starts at. */
  line: number
  kind: 'core' | 'mechanical'
}

/** What one summary call answered for one file's core hunks. */
export type CruxSummary = { changes: CruxChange[]; isFromModel: boolean }

/** The last refresh. */
export type CruxResult = {
  state: 'ready' | 'not-a-repo' | 'error'
  message?: string
  root?: string
  files: CruxFile[]
  /** By file path: its major changes. */
  changes: Record<string, CruxChange[]>
  /** Files still being summarised. */
  pending: string[]
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    crux: {
      result: CruxResult
      /** Summaries by the SHA-256 of a file's path and core hunks. */
      summaries: StateFamily<CruxSummary>
    }
  }
}
