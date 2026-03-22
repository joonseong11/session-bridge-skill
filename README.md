# Session Bridge

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

The simplest distribution path is a GitHub repository containing this bundle.

Recommended:
- Publish this folder as a repo
- Tell teammates to clone it and run `bash install.sh`

Not recommended as the first step:
- npm package

Reason:
- This is a skill bundle plus a Python script, not a Node library
- GitHub + install script is simpler and easier to audit
- npm only becomes useful if you specifically want `npx`-style installation

## Suggested GitHub Flow

1. Create a repo like `session-bridge-skill`
2. Push this folder
3. Teammates run:

```bash
git clone <repo-url>
cd session-bridge-skill
bash install.sh
```

If later you want a one-command installer, add a release asset or a curlable install script. Add npm only if your team already distributes internal tooling that way.

## Internal Team Distribution

For coworkers inside the company, start with one of these:

- Private GitHub repository
- GitHub Enterprise repository
- Internal monorepo tools directory

Private GitHub is usually enough. It keeps version history simple, code review straightforward, and installation easy.

## Why Not npm First

Do not start with npm unless you specifically need `npx` or semver-based package distribution.

This project is:
- a portable skill bundle
- a Python utility script
- a shell installer that copies files into Codex and Claude global directories

That maps better to a git repository than to a Node package.
