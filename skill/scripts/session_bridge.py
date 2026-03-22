#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable


HOME = Path.home()
CODEX_ROOT = HOME / ".codex" / "sessions"
CLAUDE_ROOT = HOME / ".claude" / "projects"
DEFAULT_PREVIEW_MESSAGES = 8
MAX_TEXT_CHARS = 600


@dataclass
class Message:
    role: str
    text: str
    timestamp: str | None = None


@dataclass
class SessionSummary:
    source: str
    session_id: str
    path: Path
    cwd: str | None
    started_at: str | None
    updated_at: str | None
    title: str
    preview: str


@dataclass
class SessionRecord(SessionSummary):
    messages: list[Message]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Browse and import saved Codex/Claude session context."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="List saved sessions")
    add_source_option(list_parser)
    list_parser.add_argument("--query", default="", help="Filter by keyword")
    list_parser.add_argument(
        "--limit",
        type=int,
        default=40,
        help="Maximum rows to print after filtering; use 0 for no limit",
    )
    list_parser.add_argument("--json", action="store_true", help="Emit JSON")

    preview_parser = subparsers.add_parser("preview", help="Preview one session")
    add_source_option(preview_parser)
    preview_parser.add_argument("selector", help="List index or session id prefix")
    preview_parser.add_argument("--query", default="", help="Filter by keyword")
    preview_parser.add_argument(
        "--messages",
        type=int,
        default=DEFAULT_PREVIEW_MESSAGES,
        help="Number of textual messages to include",
    )
    preview_parser.add_argument("--json", action="store_true", help="Emit JSON")

    pack_parser = subparsers.add_parser(
        "pack", help="Build a markdown context packet for one session"
    )
    add_source_option(pack_parser)
    pack_parser.add_argument("selector", help="List index or session id prefix")
    pack_parser.add_argument("--query", default="", help="Filter by keyword")
    pack_parser.add_argument(
        "--messages",
        type=int,
        default=12,
        help="Number of recent textual messages to include in the packet",
    )
    pack_parser.add_argument(
        "--output",
        help="Optional output markdown path; defaults to .omx/artifacts/",
    )

    return parser.parse_args()


def add_source_option(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--source",
        choices=["all", "codex", "claude"],
        default="all",
        help="Session provider to inspect",
    )


def main() -> int:
    args = parse_args()

    if args.command == "list":
        sessions = load_summaries(args.source, args.query)
        print_list(sessions, limit=args.limit, as_json=args.json)
        return 0

    if args.command == "preview":
        summary_list = load_summaries(args.source, args.query)
        summary = resolve_selector(summary_list, args.selector)
        record = load_record(summary)
        print_preview(record, args.messages, as_json=args.json)
        return 0

    if args.command == "pack":
        summary_list = load_summaries(args.source, args.query)
        summary = resolve_selector(summary_list, args.selector)
        record = load_record(summary)
        output_path = write_context_packet(
            record, message_limit=args.messages, output_path=args.output
        )
        print(output_path)
        return 0

    raise AssertionError(f"Unhandled command: {args.command}")


def load_summaries(source: str, query: str) -> list[SessionSummary]:
    summaries: list[SessionSummary] = []

    if source in {"all", "codex"}:
        for path in CODEX_ROOT.rglob("*.jsonl"):
            summary = scan_codex_summary(path)
            if summary is not None:
                summaries.append(summary)

    if source in {"all", "claude"}:
        for path in CLAUDE_ROOT.rglob("*.jsonl"):
            if "/subagents/" in path.as_posix():
                continue
            summary = scan_claude_summary(path)
            if summary is not None:
                summaries.append(summary)

    query_lower = query.lower().strip()
    if query_lower:
        summaries = [
            summary
            for summary in summaries
            if query_lower in searchable_text(summary).lower()
        ]

    summaries.sort(key=sort_key, reverse=True)
    return summaries


def scan_codex_summary(path: Path) -> SessionSummary | None:
    session_id = path.stem.replace("rollout-", "")
    cwd = None
    started_at = None
    title = None

    try:
        with path.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                item = json.loads(line)
                entry_type = item.get("type")
                payload = item.get("payload") or {}
                if entry_type == "session_meta":
                    session_id = payload.get("id", session_id)
                    cwd = payload.get("cwd", cwd)
                    started_at = payload.get("timestamp", started_at)
                elif entry_type == "response_item":
                    if payload.get("type") == "message" and payload.get("role") == "user":
                        text = prepare_title_text(extract_codex_text(payload.get("content")))
                        if is_substantive(text):
                            title = snippet(text, 120)
                            break
    except (OSError, json.JSONDecodeError):
        return None

    updated_at = file_timestamp(path)
    title = title or "(no textual user prompt found)"
    return SessionSummary(
        source="codex",
        session_id=session_id,
        path=path,
        cwd=cwd,
        started_at=started_at,
        updated_at=updated_at,
        title=title,
        preview=title,
    )


def scan_claude_summary(path: Path) -> SessionSummary | None:
    session_id = path.stem
    cwd = None
    started_at = None
    title = None

    if "/observer-sessions" in path.as_posix():
        return None

    try:
        with path.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                item = json.loads(line)
                cwd = item.get("cwd", cwd)
                started_at = item.get("timestamp", started_at)
                session_id = item.get("sessionId", session_id)
                if item.get("type") == "user":
                    text = prepare_title_text(extract_claude_text(item.get("message")))
                    if is_substantive(text):
                        title = snippet(text, 120)
                        break
    except (OSError, json.JSONDecodeError):
        return None

    updated_at = file_timestamp(path)
    title = title or "(no textual user prompt found)"
    if cwd and "/observer-sessions" in cwd:
        return None
    return SessionSummary(
        source="claude",
        session_id=session_id,
        path=path,
        cwd=cwd,
        started_at=started_at,
        updated_at=updated_at,
        title=title,
        preview=title,
    )


def load_record(summary: SessionSummary) -> SessionRecord:
    if summary.source == "codex":
        messages = load_codex_messages(summary.path)
    elif summary.source == "claude":
        messages = load_claude_messages(summary.path)
    else:
        raise ValueError(f"Unsupported source: {summary.source}")

    preview = summary.preview
    for message in reversed(messages):
        if message.role == "user" and is_substantive(message.text):
            preview = snippet(message.text, 160)
            break

    return SessionRecord(
        source=summary.source,
        session_id=summary.session_id,
        path=summary.path,
        cwd=summary.cwd,
        started_at=summary.started_at,
        updated_at=summary.updated_at,
        title=summary.title,
        preview=preview,
        messages=messages,
    )


def load_codex_messages(path: Path) -> list[Message]:
    messages: list[Message] = []
    with path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line:
                continue
            item = json.loads(line)
            if item.get("type") != "response_item":
                continue
            payload = item.get("payload") or {}
            if payload.get("type") != "message":
                continue
            role = payload.get("role")
            if role not in {"user", "assistant"}:
                continue
            text = prepare_message_text(extract_codex_text(payload.get("content")))
            if not is_substantive(text):
                continue
            messages.append(
                Message(role=role, text=snippet(text, MAX_TEXT_CHARS), timestamp=item.get("timestamp"))
            )
    return dedupe_adjacent(messages)


def load_claude_messages(path: Path) -> list[Message]:
    messages: list[Message] = []
    with path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line:
                continue
            item = json.loads(line)
            role = item.get("type")
            if role not in {"user", "assistant"}:
                continue
            text = prepare_message_text(extract_claude_text(item.get("message")))
            if not is_substantive(text):
                continue
            messages.append(
                Message(
                    role=role,
                    text=snippet(text, MAX_TEXT_CHARS),
                    timestamp=item.get("timestamp"),
                )
            )
    return dedupe_adjacent(messages)


def extract_codex_text(content: object) -> str:
    parts: list[str] = []
    if isinstance(content, list):
        for chunk in content:
            if not isinstance(chunk, dict):
                continue
            text = chunk.get("text")
            if isinstance(text, str):
                parts.append(text)
    elif isinstance(content, str):
        parts.append(content)
    return normalize_text("\n".join(parts))


def extract_claude_text(message: object) -> str:
    if isinstance(message, str):
        return normalize_text(message)
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    parts: list[str] = []
    if isinstance(content, list):
        for chunk in content:
            if not isinstance(chunk, dict):
                continue
            if chunk.get("type") != "text":
                continue
            text = chunk.get("text")
            if isinstance(text, str):
                parts.append(text)
    elif isinstance(content, str):
        parts.append(content)
    return normalize_text("\n".join(parts))


def print_list(summaries: list[SessionSummary], limit: int, as_json: bool) -> None:
    if as_json:
        rows = [
            {
                "index": index,
                "source": summary.source,
                "session_id": summary.session_id,
                "started_at": summary.started_at,
                "updated_at": summary.updated_at,
                "cwd": summary.cwd,
                "path": str(summary.path),
                "title": summary.title,
            }
            for index, summary in enumerate(limit_rows(summaries, limit), start=1)
        ]
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return

    rows = list(limit_rows(summaries, limit))
    if not rows:
        print("No sessions matched.")
        return

    for index, summary in enumerate(rows, start=1):
        cwd = summary.cwd or "-"
        updated = format_time(summary.updated_at)
        print(f"[{index:>3}] {summary.source:<6} {updated} {summary.session_id}")
        print(f"      cwd: {cwd}")
        print(f"      {summary.title}")


def print_preview(record: SessionRecord, message_limit: int, as_json: bool) -> None:
    recent_messages = record.messages[-message_limit:]
    if as_json:
        print(
            json.dumps(
                {
                    "source": record.source,
                    "session_id": record.session_id,
                    "cwd": record.cwd,
                    "started_at": record.started_at,
                    "updated_at": record.updated_at,
                    "path": str(record.path),
                    "title": record.title,
                    "preview": record.preview,
                    "messages": [
                        {
                            "role": message.role,
                            "timestamp": message.timestamp,
                            "text": message.text,
                        }
                        for message in recent_messages
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    print(f"source: {record.source}")
    print(f"session: {record.session_id}")
    print(f"cwd: {record.cwd or '-'}")
    print(f"started: {record.started_at or '-'}")
    print(f"updated: {record.updated_at or '-'}")
    print(f"path: {record.path}")
    print(f"title: {record.title}")
    print("")
    for message in recent_messages:
        label = message.role.upper()
        print(f"{label} {format_time(message.timestamp)}")
        print(message.text)
        print("")


def write_context_packet(
    record: SessionRecord, message_limit: int, output_path: str | None
) -> Path:
    destination = (
        Path(output_path).expanduser()
        if output_path
        else default_output_path(record)
    )
    destination.parent.mkdir(parents=True, exist_ok=True)

    user_messages = [message for message in record.messages if message.role == "user"]
    assistant_messages = [
        message for message in record.messages if message.role == "assistant"
    ]
    first_user = user_messages[0].text if user_messages else "-"
    latest_user = user_messages[-1].text if user_messages else "-"
    latest_assistant = assistant_messages[-1].text if assistant_messages else "-"
    recent_messages = record.messages[-message_limit:]

    lines = [
        "# Session Context Packet",
        "",
        "> This packet is a snapshot imported from saved conversation logs.",
        "> It is not a live `/resume`, and no hidden reasoning or tool state was restored.",
        "",
        "## Session Metadata",
        "",
        f"- Source: `{record.source}`",
        f"- Session ID: `{record.session_id}`",
        f"- Session file: `{record.path}`",
        f"- Original cwd: `{record.cwd or '-'}`",
        f"- Started at: `{record.started_at or '-'}`",
        f"- Last updated: `{record.updated_at or '-'}`",
        "",
        "## Candidate Topic",
        "",
        record.title,
        "",
        "## Imported Summary",
        "",
        f"- First user request: {first_user}",
        f"- Latest user request: {latest_user}",
        f"- Latest assistant reply: {latest_assistant}",
        "",
        "## Recent Textual Turns",
        "",
    ]

    for message in recent_messages:
        lines.append(
            f"### {message.role.title()} {format_time(message.timestamp)}"
        )
        lines.append("")
        lines.append(message.text)
        lines.append("")

    lines.extend(
        [
            "## Usage Note",
            "",
            "Use this packet as imported context for the current session.",
            "Re-check the live codebase or environment before making claims if the session may be stale.",
            "",
        ]
    )

    destination.write_text("\n".join(lines), encoding="utf-8")
    return destination


def default_output_path(record: SessionRecord) -> Path:
    root = Path.cwd() / ".omx" / "artifacts"
    short_id = sanitize(record.session_id)[:24]
    filename = f"session-bridge-{record.source}-{short_id}.md"
    return root / filename


def resolve_selector(
    summaries: list[SessionSummary], selector: str
) -> SessionSummary:
    if not summaries:
        raise SystemExit("No sessions matched.")

    if selector.isdigit():
        index = int(selector)
        if index < 1 or index > len(summaries):
            raise SystemExit(
                f"Index {index} is out of range. Available rows: 1-{len(summaries)}."
            )
        return summaries[index - 1]

    matches = [
        summary
        for summary in summaries
        if summary.session_id.startswith(selector)
        or selector in str(summary.path)
    ]
    if not matches:
        raise SystemExit(f"No session matched selector: {selector}")
    if len(matches) > 1:
        lines = ["Multiple sessions matched. Use an exact id prefix or list index:"]
        for summary in matches[:10]:
            lines.append(
                f"- {summary.source} {summary.session_id} {format_time(summary.updated_at)} {summary.cwd or '-'}"
            )
        raise SystemExit("\n".join(lines))
    return matches[0]


def dedupe_adjacent(messages: list[Message]) -> list[Message]:
    deduped: list[Message] = []
    for message in messages:
        if deduped and deduped[-1].role == message.role and deduped[-1].text == message.text:
            continue
        deduped.append(message)
    return deduped


def searchable_text(summary: SessionSummary) -> str:
    return " ".join(
        part
        for part in [
            summary.source,
            summary.session_id,
            summary.cwd or "",
            str(summary.path),
            summary.title,
            summary.preview,
        ]
        if part
    )


def sort_key(summary: SessionSummary) -> tuple[str, str]:
    return (summary.updated_at or "", summary.session_id)


def limit_rows(rows: list[SessionSummary], limit: int) -> Iterable[SessionSummary]:
    if limit == 0:
        return rows
    return rows[:limit]


def normalize_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text


def prepare_title_text(text: str) -> str:
    text = extract_explicit_request(text)
    if is_noise_text(text):
        return ""
    return text


def prepare_message_text(text: str) -> str:
    text = extract_explicit_request(text)
    if is_noise_text(text):
        return ""
    return text


def extract_explicit_request(text: str) -> str:
    markers = [
        "My request for Codex:",
        "My request for Claude:",
        "내 요청:",
    ]
    for marker in markers:
        if marker in text:
            return normalize_text(text.split(marker, 1)[1])
    return text


def is_noise_text(text: str) -> bool:
    noise_prefixes = (
        "# AGENTS.md instructions",
        "<environment_context>",
        "Files called AGENTS.md commonly appear",
    )
    if text == "[Request interrupted by user]":
        return True
    return text.startswith(noise_prefixes)


def is_substantive(text: str) -> bool:
    if not text:
        return False
    if is_noise_text(text):
        return False
    return any(character.isalnum() for character in text)


def snippet(text: str, limit: int) -> str:
    text = normalize_text(text)
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def sanitize(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value)


def file_timestamp(path: Path) -> str:
    stat = path.stat()
    return datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat()


def format_time(timestamp: str | None) -> str:
    if not timestamp:
        return "-"
    try:
        return (
            datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            .astimezone()
            .strftime("%Y-%m-%d %H:%M")
        )
    except ValueError:
        return timestamp


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BrokenPipeError:
        sys.exit(0)
