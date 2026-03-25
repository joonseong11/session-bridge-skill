---
name: session-bridge
version: 0.2.0
description: Browse saved Codex and Claude conversations, preview a selected session, import a snapshot packet, or fork the current live Codex or Claude session into a chosen terminal target.
argument-hint: "[list|preview|pack|fork-current] [selector|query|prompt]"
---

# Session Bridge

Use this skill when the user wants to:

- inspect old Codex or Claude sessions
- continue from a saved session snapshot without live resume
- branch the current live Codex session
- branch the current live Claude session

## Saved Session Flow

1. List sessions:

```bash
python3 scripts/session_bridge.py list --source all --limit 20
```

2. Preview one session:

```bash
python3 scripts/session_bridge.py preview <selector> --source all --messages 8
```

3. Build a snapshot packet:

```bash
python3 scripts/session_bridge.py pack <selector> --source all --messages 12
```

4. Read the generated markdown packet and treat it as imported snapshot context for the next user request.

## Current Live Session Branching

Use:

```bash
session-bridge fork-current
```

Optional overrides:

```bash
session-bridge fork-current --provider codex --terminal cmux
session-bridge fork-current --provider claude
session-bridge fork-current --terminal command "continue from here"
```

Provider detection order:

1. `--provider`
2. `CODEX_THREAD_ID`
3. `CLAUDE_SESSION_ID`

Terminal preference is stored in:

```text
~/.session-bridge/config.json
```

Supported terminal targets:

- `cmux`
- `ghostty`
- `iterm`
- `terminal`
- `command`

## Guardrails

- Snapshot packets are not live resume.
- Do not claim that hidden reasoning, background jobs, or tool state were restored.
- Re-check the live repo before making code claims from saved sessions.
- Prefer compact imports over dumping large raw logs.
