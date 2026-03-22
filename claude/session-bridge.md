---
description: 저장된 Codex/Claude 세션 목록을 보고 선택한 세션의 맥락을 현재 대화로 가져온다. live resume는 하지 않는다.
---

# Session Bridge

Use the global `session-bridge` skill and script to work from saved session logs.

## Flow

1. List available sessions:

```bash
python3 ~/.claude/skills/session-bridge/scripts/session_bridge.py list --source all --limit 12
```

2. If the user wants to inspect one session first:

```bash
python3 ~/.claude/skills/session-bridge/scripts/session_bridge.py preview <selector> --source all --messages 8
```

3. If the user wants to continue from that context without live resume:

```bash
python3 ~/.claude/skills/session-bridge/scripts/session_bridge.py pack <selector> --source all --messages 8
```

4. Read the generated markdown packet and treat it as imported snapshot context for the next user request.

## Rules

- Do not use live resume.
- Do not claim that process state or hidden reasoning was restored.
- Re-check the live repo before making code claims because imported context can be stale.
