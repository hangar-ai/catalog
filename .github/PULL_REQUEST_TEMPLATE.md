## The kit

- Repository and tag:
- What it does, in one sentence:
- New kit, or a new version of a listed one:

A community kit stays unverified. `verified` is only for what the org maintains.

## Proposer

- [ ] I ran `node scripts/catalog.mjs add <owner/repo> <tag>` and committed `sources.json` and `index.json`.
- [ ] The tag is `v` and the manifest's version, and I will not move it.
- [ ] The kit's README says what it does and what it touches.
- [ ] Nothing in the repository or its history is personal or secret.

## Reviewer

Read the kit at the tag, as the person enabling it will. For a new version, read the diff from the
last reviewed commit in `sources.json`. Link the folder in Hangar too: the activation view lists what
follows, verbatim.

**What runs by itself, without asking.** This is where a kit can do harm.

- [ ] `hooks/hooks.json` and `hooks` in `.claude-plugin/plugin.json`: each command, and the script it names.
- [ ] `.mcp.json` and `mcpServers`: what starts with each session, and what it reaches.
- [ ] `monitors/`, `.lsp.json`, `settings.json`, `bin/`, `binaries`, `dependencies`, and `hooks` in the frontmatter of skills and commands.

**What its tabs may do.**

- [ ] `commands` in `hangar-kit.json`: each argv. A shell or `node -e` with a loose rule runs anything. Read any `{kitDir}` script it names: the person accepts its name, not its content.
- [ ] `setup` steps: the command for each OS.
- [ ] `permissions` of each tab, kept as small as the job allows. `files.read` with `files.write` on one tab reads `.env` and other secrets; with `panes.send`, `loopback:` or a command, it can pass them on.

**What it says.**

- [ ] `gallery.permissionsSummary` is true and leaves out nothing that matters.
- [ ] The skills do not tell an agent to go around a person, a hook or a permission.
- [ ] The tag points at the commit recorded in `sources.json`, and `check` passes.

Docs: [the kit contract](https://github.com/simnJS/hangar-ai/blob/main/docs/kits.md), including [what runs by itself](https://github.com/simnJS/hangar-ai/blob/main/docs/kits.md#what-runs-by-itself).
