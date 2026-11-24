// The contract for the `hscottUi` noun hscott-ui adds to `$`.
// A mod that lists "hscott-ui" under "dependencies" gets these types laid
// into its own .claude-plugin/types/ by the engine; never copy this file.
//
// Everything that crosses between mods is plain data, so a mod describes
// what to show as an HscottUiView and hscott-ui draws it.

/** A tab a mod adds: its own sidebar pane, drawn by hscott-ui. */
export type HscottUiTab = {
  /** 1-56 of letters, digits, `_` and `-`; also the prefix of its press keys. */
  id: string
  /** Shown on the pane's tab while more than one pane is open. */
  title: string
  /** Asks for the pane to open as soon as it is registered. */
  open?: boolean
}

/** One element of a view. Every `key` is the mod's own; hscott-ui prefixes it. */
export type HscottUiNode =
  | {
      type: 'section'
      /** Unique within the view; pressing the heading collapses or expands it. */
      key: string
      title: string
      /** Dim text after the title, such as "+12 −3". */
      detail?: string
      /** Starts collapsed until the person expands it. */
      collapsed?: boolean
      children: HscottUiNode[]
    }
  | {
      type: 'row'
      /** Given a key, the row is pressable and raises ui.press as `<tab>:<key>`. */
      key?: string
      title: string
      /** A dim second line under the title. */
      detail?: string
      /** Short dim text before the title, such as a line number. */
      badge?: string
      dim?: boolean
    }
  | { type: 'text'; text: string; dim?: boolean; bold?: boolean; color?: string }
  | { type: 'button'; key: string; label: string }
  | { type: 'empty'; text: string }

/** What a tab shows: its elements top to bottom. */
export type HscottUiView = HscottUiNode[]

/** What `open` answers: whether a surface draws the pane now. */
export type HscottUiOpenResult = { isPlaced: boolean; reason?: string }

/** What `toggle` answers: whether the pane is open afterwards, and if so whether it is drawn. */
export type HscottUiToggleResult = { isOpen: boolean; isPlaced?: boolean; reason?: string }

/** Names a registered tab. */
export type HscottUiTabRef = { id: string }

/** A tab and what it now shows. */
export type HscottUiSetViewInput = { id: string; view: HscottUiView }

/**
 * Every method takes one input object: the engine passes one value between mods.
 */
export type HscottUi = {
  /** Adds (or retitles) a tab. Call it from `session.start`. */
  register(tab: HscottUiTab): Promise<void>
  /** Replaces what the tab shows; the pane redraws. */
  setView(input: HscottUiSetViewInput): Promise<void>
  /** Opens the tab's pane, or brings it forward. */
  open(input: HscottUiTabRef): Promise<HscottUiOpenResult>
  /** Closes the tab's pane; the tab stays registered. */
  close(input: HscottUiTabRef): Promise<void>
  /** Closes the tab's pane if it is open, opens it if not. */
  toggle(input: HscottUiTabRef): Promise<HscottUiToggleResult>
}

declare module 'claude-code' {
  interface EngineInterface {
    hscottUi: HscottUi
  }
  interface PluginState {
    'hscott-ui': {
      /** Registered tabs, in the order they registered. */
      tabs: HscottUiTab[]
      /** Each tab's view, by tab id. */
      views: StateFamily<HscottUiView>
      /** Each section's collapsed flag, by `<tab>:<section key>`. */
      collapsed: StateFamily<boolean>
    }
  }
}
