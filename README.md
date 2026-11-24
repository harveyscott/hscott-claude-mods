# hscott-claude-mods

Claude Code mods (function-hook plugins) by Harvey Scott. This repository is a
plugin marketplace: each mod in `mods/` installs on its own.

## Install

Add the marketplace and install the mods you want, at a Claude Code prompt:

```
/plugin install hscott-ui --marketplace harveyscott/hscott-claude-mods
/plugin install crux --marketplace harveyscott/hscott-claude-mods
```

Install a mod's library first: `crux` needs `hscott-ui`, and `hello` needs
`hscott-common`.

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add
marketplace** with `harveyscott/hscott-claude-mods`, then **Add plugin**.

## Mods

| Mod | What it does |
| --- | --- |
| `crux` | A sidebar showing the crux of your uncommitted changes. See below. |
| `hscott-ui` | UI library. Adds `$.hscottUi`: mods hand it plain-data views and it draws each as a sidebar pane. |
| `hscott-common` | Shared helpers. Adds `$.hscott` for the other mods. |
| `hello` | Example mod. `/hello` replies with a greeting built from `hscott-common`. |

### crux

Shows what matters in the work you have not committed yet. After every turn it
reads `git diff HEAD` and your untracked files, then:

- **hides** tests, docs (`*.md` and the like), lockfiles and build output, plus any
  globs you add in the mod's **Also hide** option;
- **folds away mechanical edits**: whitespace-only hunks, import-only hunks,
  pure renames, and the same edit repeated across more than five files;
- **names each major change** in the remaining files with a short title and
  description, written by a small model (Haiku by default). A summary is cached
  until that file's changes change, so unchanged files cost nothing.

The pane opens by itself where the terminal has room for a sidebar (the
fullscreen layout). Otherwise run `/crux`. `/crux refresh` re-reads the changes
now. Pressing a change puts `path:line` into the prompt so you can ask about it.

Options (in `/config` under crux): **Summarise automatically** (off = rules only,
no model calls), **Summary model**, **Also hide**.

## Layout

```
.claude-plugin/marketplace.json   lists every mod below
mods/
  hscott-common/                  shared helpers: $.hscott
  hscott-ui/                      UI library: $.hscottUi, draws plain-data views as panes
    hooks/render.tsx              the only file that turns views into elements
    types/index.d.ts              HscottUiView: the elements a mod can describe
  crux/                           the crux sidebar
    hooks/collect.ts              git diff → files and hunks
    hooks/filter.ts               hidden paths, mechanical hunks
    hooks/summarise.ts            model prompt, reply parsing, cache key
    hooks/view.ts                 result → HscottUiView
  hello/                          example mod that depends on hscott-common
```

## Adding a mod

1. Copy `mods/hello` to `mods/<new-mod>` and change `name` in its `plugin.json`.
2. List the libraries it uses under `"dependencies"`: `hscott-common`, `hscott-ui`.
3. Add an entry to `.claude-plugin/marketplace.json`.
4. Run `claude plugin validate .` from the repository root, and
   `claude plugin test mods/<new-mod>`.

A mod may only import files inside its own folder, since each one is installed
as a copy of that folder. Shared code goes in a library mod as a method on its
`$` noun, declared in its `types/index.d.ts`. Only plain data crosses between
mods, and **each method takes exactly one input object**:
`$.hscottUi.setView({ id, view })`, not `setView(id, view)`.

To show something in a pane, register a tab and hand hscott-ui a view:

```ts
await $.hscottUi.register({ id: 'my-mod', title: 'My mod', open: true })
await $.hscottUi.setView({
  id: 'my-mod',
  view: [{ type: 'section', key: 'a', title: 'Things', children: [{ type: 'row', key: 'x', title: 'One' }] }],
})
// A press on the row raises ui.press as 'my-mod:x' under hscott-ui:
on('ui.press', { plugin: 'hscott-ui' }, async ($, e, next) => { /* e.element */ return next(e) })
```

## Developing

Load the mods from this checkout, hot-reloading on save:

```
claude --plugin-dir mods/hscott-ui --plugin-dir mods/crux
```

## License

MIT. See [LICENSE](LICENSE).
