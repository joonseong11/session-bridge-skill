# Session Bridge

[![npm version](https://img.shields.io/npm/v/session-bridge-skill)](https://www.npmjs.com/package/session-bridge-skill)
[![GitHub Repository](https://img.shields.io/badge/github-joonseong11%2Fsession--bridge--skill-181717?logo=github)](https://github.com/joonseong11/session-bridge-skill)

`session-bridge` is a portable CLI and skill bundle for:

- browsing saved Codex and Claude sessions
- previewing a chosen session
- importing a snapshot packet from a past session
- forking the current live Codex or Claude session into a new terminal target

It does not restore hidden reasoning, background tasks, or live tool state. Snapshot import is not live resume, and live fork only branches the provider's visible session history.

## Install

Install from this repo:

```bash
bash install.sh
```

Or with npm:

```bash
npx session-bridge-skill install
```

This installs:

- Codex skill: `~/.agents/skills/session-bridge`
- Claude skill: `~/.claude/skills/session-bridge`
- Claude slash command: `~/.claude/commands/session-bridge.md`

On first install, the CLI asks which terminal target should be used for `fork-current` and saves it here:

```text
~/.session-bridge/config.json
```

You can skip the prompt and set it directly:

```bash
session-bridge install --terminal cmux --no-prompt
```

Supported terminal targets:

- `cmux`
- `ghostty`
- `iterm`
- `terminal`
- `command` for printing the command only

## Main Commands

### 1. List saved sessions

All recent sessions:

```bash
session-bridge list --source all --limit 20
```

Only Codex:

```bash
session-bridge list --source codex --limit 20
```

Only Claude:

```bash
session-bridge list --source claude --limit 20
```

Filter by keyword:

```bash
session-bridge list --source all --query handybus --limit 20
```

JSON output:

```bash
session-bridge list --source all --limit 20 --json
```

### 2. Preview a saved session

By list index:

```bash
session-bridge preview 3 --source all --messages 8
```

By session id prefix:

```bash
session-bridge preview 019d23c7 --source codex --messages 8
```

### 3. Build a snapshot packet from a saved session

```bash
session-bridge pack 3 --source all --messages 12
```

This writes a markdown packet under:

```text
.omx/artifacts/session-bridge-<source>-<session>.md
```

Use this when you want to continue from an old session without attaching to its live runtime.

## Fork The Current Live Session

`fork-current` supports both Codex and Claude.

Provider detection order:

1. explicit `--provider`
2. `CODEX_THREAD_ID`
3. `CLAUDE_SESSION_ID`

Default usage:

```bash
session-bridge fork-current
```

With a first prompt:

```bash
session-bridge fork-current "continue from here, but focus only on release notes"
```

Force Codex:

```bash
session-bridge fork-current --provider codex
```

Force Claude:

```bash
session-bridge fork-current --provider claude
```

Print the exact command without launching:

```bash
session-bridge fork-current --terminal command
```

### Codex behavior

Codex uses:

```bash
codex fork ...
```

This creates a branched Codex session with a new session ID.

### Claude behavior

Claude uses:

```bash
claude --resume <session-id> --fork-session
```

This creates a branched Claude session from the current Claude conversation when `CLAUDE_SESSION_ID` is available.

## Terminal Behavior

### cmux

`cmux` opens a real new cmux window, creates a new workspace there, and selects that workspace so the forked session is actually visible.

### Ghostty, iTerm, Terminal.app

These targets open a new app window and run the generated fork command inside it.

### command

This target does not open anything. It prints the exact command you can run manually.

## Typical Workflows

### Continue from an old session snapshot

```bash
session-bridge list --source all --limit 10
session-bridge preview 2 --source all --messages 8
session-bridge pack 2 --source all --messages 12
```

### Branch the current live Codex session into cmux

```bash
session-bridge fork-current --provider codex --terminal cmux
```

### Branch the current live Claude session into the configured target

```bash
session-bridge fork-current --provider claude
```

## CLI Help

```bash
session-bridge --help
session-bridge doctor
```

`doctor` shows:

- configured terminal target
- detected current provider
- detected current Codex thread
- detected current Claude session

## Version Sync

The skill version is defined in:

```text
skill/SKILL.md
```

Useful commands:

```bash
npm run version:check
npm run version:sync
npm test
```

`npm pack` and `npm publish` also run the sync step automatically through `prepack`.
