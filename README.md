# Session Bridge

[![npm version](https://img.shields.io/npm/v/session-bridge-skill)](https://www.npmjs.com/package/session-bridge-skill)
[![GitHub Repository](https://img.shields.io/badge/github-joonseong11%2Fsession--bridge--skill-181717?logo=github)](https://github.com/joonseong11/session-bridge-skill)

`session-bridge` is a portable skill bundle for browsing saved Codex and Claude sessions, previewing a selected conversation, and importing a snapshot context packet without using live resume.

It installs:
- a Codex global skill at `~/.agents/skills/session-bridge`
- a Claude global skill at `~/.claude/skills/session-bridge`
- an optional Claude slash command at `~/.claude/commands/session-bridge.md`

## What It Does

- Lists saved Codex sessions from `~/.codex/sessions/**/*.jsonl`
- Lists saved Claude sessions from `~/.claude/projects/**/*.jsonl`
- Previews a selected session by index or id prefix
- Builds a markdown context packet under `.omx/artifacts/`
- Lets the current assistant continue from that snapshot context

It does not perform live `/resume`, and it does not restore hidden reasoning, process state, or background tasks.

## Install

Run:

```bash
bash install.sh
```

This installs the skill globally for both tools:
- Codex: `~/.agents/skills/session-bridge`
- Claude: `~/.claude/skills/session-bridge`
- Claude command: `~/.claude/commands/session-bridge.md`

## npm / npx Install

If you publish this package, the intended entrypoint is a CLI, not a library import.

Recommended:

```bash
npx session-bridge-skill install
```

Or global install:

```bash
npm install -g session-bridge-skill
session-bridge install
```

After installation:
- Codex can use the global `session-bridge` skill
- Claude can use the global `session-bridge` skill or `/session-bridge` command

## Version Sync

`session-bridge` skill version is defined in:

```text
skill/SKILL.md
```

The npm package version is synced from that value.

Useful commands:

```bash
npm run version:check
npm run version:sync
```

`npm pack` and `npm publish` also run the sync step automatically through `prepack`.

## Typical Use

Codex skill:

```text
session-bridge 써줘
```

Claude skill or command:

```text
/session-bridge
```

Or run the script directly:

```bash
python3 ~/.agents/skills/session-bridge/scripts/session_bridge.py list --source all --limit 12
python3 ~/.agents/skills/session-bridge/scripts/session_bridge.py preview 3 --source all --messages 8
python3 ~/.agents/skills/session-bridge/scripts/session_bridge.py pack 3 --source all --messages 8
```

## Distribution Recommendation

Recommended publishing shape:
- GitHub repository as the source of truth
- npm package as the install channel

That gives you:
- normal code review and issue tracking in GitHub
- easy `npx` and `npm install -g` installation for coworkers

## Suggested GitHub Flow

1. Create a repo like `session-bridge-skill`
2. Push this folder
3. Teammates run:

```bash
git clone https://github.com/joonseong11/session-bridge-skill.git
cd session-bridge-skill
bash install.sh
```

If you want a git-only path, teammates can still clone the repo and run `bash install.sh`.

## Internal Team Distribution

For coworkers inside the company, start with one of these:

- Private GitHub repository
- GitHub Enterprise repository
- Internal monorepo tools directory

Private GitHub is usually enough. It keeps version history simple, code review straightforward, and installation easy.

## npm Distribution

npm is appropriate when you want one-command installation for coworkers:

```bash
npx session-bridge-skill install
```

## Publish Notes

Before publishing to npm, decide:
- public npm package vs private registry
- final package name, for example `session-bridge-skill` or `@company/session-bridge`

For a company rollout, `@company/session-bridge` on a private registry or GitHub Packages is usually the cleanest option.
