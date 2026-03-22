#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SOURCE="$ROOT/skill"
CLAUDE_COMMAND_SOURCE="$ROOT/claude/session-bridge.md"

CODEX_TARGET="$HOME/.agents/skills/session-bridge"
CLAUDE_SKILL_TARGET="$HOME/.claude/skills/session-bridge"
CLAUDE_COMMAND_TARGET="$HOME/.claude/commands/session-bridge.md"

mkdir -p "$CODEX_TARGET/scripts"
mkdir -p "$CLAUDE_SKILL_TARGET/scripts"
mkdir -p "$(dirname "$CLAUDE_COMMAND_TARGET")"

cp "$SKILL_SOURCE/SKILL.md" "$CODEX_TARGET/SKILL.md"
cp "$SKILL_SOURCE/scripts/session_bridge.py" "$CODEX_TARGET/scripts/session_bridge.py"

cp "$SKILL_SOURCE/SKILL.md" "$CLAUDE_SKILL_TARGET/SKILL.md"
cp "$SKILL_SOURCE/scripts/session_bridge.py" "$CLAUDE_SKILL_TARGET/scripts/session_bridge.py"

cp "$CLAUDE_COMMAND_SOURCE" "$CLAUDE_COMMAND_TARGET"

echo "Installed session-bridge for Codex: $CODEX_TARGET"
echo "Installed session-bridge for Claude: $CLAUDE_SKILL_TARGET"
echo "Installed Claude command: $CLAUDE_COMMAND_TARGET"
