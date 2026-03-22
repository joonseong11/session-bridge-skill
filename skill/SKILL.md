---
name: session-bridge
version: 0.1.0
description: Browse saved Codex and Claude conversations, preview a selected session, and import a snapshot of that context into the current session without using live resume. Use when the user wants to continue from another Codex or Claude conversation, inspect old session context, or ask a new question on top of a saved conversation.
argument-hint: "[list|preview|pack] [selector|query]"
---

# Session Bridge

Use this skill when the user wants to work from another Codex or Claude conversation without attaching to the original live session.

This skill reads saved logs only:
- Codex: `~/.codex/sessions/**/*.jsonl`
- Claude: `~/.claude/projects/**/*.jsonl`

It does **not** perform `/resume`, and it does **not** recover live process state, hidden reasoning, or tool state.

## Workflow

1. Run the session list command:

```bash
python3 scripts/session_bridge.py list --source all
```

- If the user named a provider, set `--source codex` or `--source claude`.
- If the user gave a project, date, or keyword, pass `--query "<text>"`.

2. If the user did not already identify a session, show the numbered results and ask for one selector:
- list index, or
- session id prefix

3. When the user wants to inspect before loading, run:

```bash
python3 scripts/session_bridge.py preview <selector> --source all
```

4. When the user wants to continue from that context, build a snapshot packet:

```bash
python3 scripts/session_bridge.py pack <selector> --source all
```

This writes a markdown artifact under:

```text
.omx/artifacts/session-bridge-<source>-<session>.md
```

5. Read the generated artifact and use it as imported context for the user's new request in the current session.

6. State clearly that the imported context is a saved snapshot, not a live resumed session.

## Selection Rules

- Numeric selector: current sorted list index
- Non-numeric selector: session id prefix match
- If multiple sessions match, show the candidates and ask the user to choose one exact session

## Guardrails

- Prefer top-level Claude project sessions; ignore `/subagents/` unless the user explicitly asks for them.
- Re-check the current repo state before making code claims, because saved session context can be stale.
- Keep imported context lean. Prefer the generated packet and recent textual turns over dumping full logs.
- Do not claim that background jobs, tmux state, or hidden chain-of-thought were restored.

## Common Commands

List all recent sessions:

```bash
python3 scripts/session_bridge.py list --source all --limit 40
```

Search only Codex sessions for a project name:

```bash
python3 scripts/session_bridge.py list --source codex --query handybus
```

Preview one session:

```bash
python3 scripts/session_bridge.py preview 12 --source all
```

Build a context packet and continue from it:

```bash
python3 scripts/session_bridge.py pack 12 --source all
```

If the user already specifies both the target session and the follow-up task, skip straight to `pack`, read the artifact, and do the task.
