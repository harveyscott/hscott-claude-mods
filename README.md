# hscott-claude-mods

Claude Code mods (function-hook plugins) by Harvey Scott. This repository is a
plugin marketplace: each mod in `mods/` installs on its own.

## Install

Add the marketplace and install the mods you want, at a Claude Code prompt:

```
/plugin install hscott-common --marketplace harveyscott/hscott-claude-mods
/plugin install hello --marketplace harveyscott/hscott-claude-mods
```

Install `hscott-common` first: the other mods depend on it.

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add
marketplace** with `harveyscott/hscott-claude-mods`, then **Add plugin**.

## Mods

| Mod | What it does |
| --- | --- |
| `hscott-common` | Shared library. Adds `$.hscott` to the engine interface for the other mods. |
| `hello` | Example mod. `/hello` replies with a greeting built from `hscott-common`. |

## Layout

```
.claude-plugin/marketplace.json   lists every mod below
mods/
  hscott-common/                  the shared library
    .claude-plugin/plugin.json
    hooks/hooks.json, register.ts adds $.hscott in engine.create
    types/index.d.ts              the contract other mods are typed against
  hello/                          example mod that depends on hscott-common
```

## Adding a mod

1. Copy `mods/hello` to `mods/<new-mod>` and change `name` in its `plugin.json`.
2. Keep `"dependencies": ["hscott-common"]` if it uses `$.hscott`.
3. Add an entry to `.claude-plugin/marketplace.json`.
4. Run `claude plugin validate .` from the repository root.

A mod may only import files inside its own folder, since each one is installed
as a copy of that folder. Shared code goes in `hscott-common` as a method on
`$.hscott`, declared in its `types/index.d.ts`.

## Developing

Load the mods from this checkout, hot-reloading on save:

```
claude --plugin-dir mods/hscott-common --plugin-dir mods/hello
```

## License

MIT. See [LICENSE](LICENSE).
