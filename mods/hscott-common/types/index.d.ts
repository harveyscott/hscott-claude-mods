// The contract for the `hscott` noun this plugin adds to `$`.
// Mods that list "hscott-common" under "dependencies" get these types laid
// into their own .claude-plugin/types/ by the engine; never copy this file.
// Every member is a method taking one input object (the engine passes one
// value across): other mods call it as $.hscott.<method>({ ... }).

export type HscottFormatInput = { mod: string; message: string }

export type Hscott = {
  /** Formats a message with the mod's name as a prefix, e.g. "[hello] hi". */
  format(input: HscottFormatInput): Promise<string>
  /** The version of hscott-common that is loaded. */
  version(input: Record<string, never>): Promise<string>
}

declare module 'claude-code' {
  interface EngineInterface {
    hscott: Hscott
  }
}
