# Catalog

The list of kits Hangar.AI's gallery shows. There is no server: Hangar reads
[`index.json`](index.json) from this repository, at
`https://raw.githubusercontent.com/hangar-ai/catalog/main/index.json`.

A kit is pinned to a tag, not to a branch. A new version reaches the gallery only once a change
here has been reviewed and merged.

| File                    | What                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `index.json`            | What Hangar reads. Generated: never edit it by hand.                       |
| `sources.json`          | What people edit: a repository, its tag, and the commit that tag was reviewed at. |
| `scripts/catalog.mjs`   | Rebuilds `index.json` from the kits, and checks everything is in step.     |

## An entry

```json
{
  "id": "guard",
  "name": "Guardrails",
  "description": "What the kit does.",
  "repo": "hangar-ai/kit-guard",
  "tag": "v0.1.0",
  "version": "0.1.0",
  "permissionsSummary": "One sentence, for the card. The activation view shows the truth.",
  "tags": ["safety", "hooks", "tab"],
  "verified": true
}
```

`id`, `name`, `description` and `version` are the manifest's at that tag, and `permissionsSummary`
and `tags` are its `gallery` block. `verified` is true only for what the org maintains.

## Propose a kit, or a new version

```sh
node scripts/catalog.mjs add <owner/repo> <tag>
```

Commit the two files it changes and open a pull request: the template says what a reviewer looks at.
A community kit stays unverified.

## What `check` holds

`node scripts/catalog.mjs check` runs on every pull request and every week. It fails when:

- an `id`, `name`, `version` or anything else in `index.json` differs from the manifest at the tag;
- a tag is not `v` and the manifest's version, or is a branch;
- a tag no longer points at the commit that was reviewed: an owner can move a tag, and Hangar would
  install what it points at. This only tells us afterwards: the check cannot stop it.
