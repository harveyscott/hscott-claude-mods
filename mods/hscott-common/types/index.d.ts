// The contract for the `hscott` noun this plugin adds to `$`.
// Mods that list "hscott-common" under "dependencies" get these types laid
// into their own .claude-plugin/types/ by the engine; never copy this file.
// Every member is a method: other mods call it as $.hscott.<method>(...).

export type Hscott = {
  /** Formats a message with the mod's name as a prefix, e.g. "[hello] hi". */
  format(mod: string, message: string): Promise<string>
  /** The version of hscott-common that is loaded. */
  version(): Promise<string>
}

declare module 'claude-code' {
  interface EngineInterface {
    hscott: Hscott
  }
}
