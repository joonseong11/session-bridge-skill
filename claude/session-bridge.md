---
description: 저장된 Codex/Claude 세션을 탐색하거나, 현재 Claude 세션을 새 터미널 대상으로 fork 한다.
---

# Session Bridge

Use the global `session-bridge` skill and CLI to work from saved logs or to branch the current live Claude session.

## Saved Session Flow

1. List sessions:

```bash
python3 ~/.claude/skills/session-bridge/scripts/session_bridge.py list --source all --limit 12
```

2. Preview one session:

```bash
python3 ~/.claude/skills/session-bridge/scripts/session_bridge.py preview <selector> --source all --messages 8
```

3. Build a snapshot packet:

```bash
python3 ~/.claude/skills/session-bridge/scripts/session_bridge.py pack <selector> --source all --messages 12
```

4. Read the generated markdown packet and use it as imported snapshot context.

## Current Claude Session Branching

To branch the current live Claude session:

```bash
session-bridge fork-current --provider claude
```

To override the terminal target for this run:

```bash
session-bridge fork-current --provider claude --terminal cmux
```

If the user only wants the raw command:

```bash
session-bridge fork-current --provider claude --terminal command
```

The CLI uses `CLAUDE_SESSION_ID` when available and launches:

```text
claude --resume <session-id> --fork-session
```
