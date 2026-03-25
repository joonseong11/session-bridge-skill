import json
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "skill" / "scripts"))

import session_bridge as sb  # noqa: E402


class SessionBridgePythonTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.codex_root = self.root / ".codex" / "sessions"
        self.claude_root = self.root / ".claude" / "projects"
        self.codex_root.mkdir(parents=True)
        self.claude_root.mkdir(parents=True)

        self.original_codex_root = sb.CODEX_ROOT
        self.original_claude_root = sb.CLAUDE_ROOT
        sb.CODEX_ROOT = self.codex_root
        sb.CLAUDE_ROOT = self.claude_root

    def tearDown(self):
        sb.CODEX_ROOT = self.original_codex_root
        sb.CLAUDE_ROOT = self.original_claude_root
        self.temp_dir.cleanup()

    def test_load_summaries_skips_old_invalid_files_without_query(self):
        latest = self.codex_root / "2026" / "03" / "25" / (
            "rollout-2026-03-25T15-56-38-019d23c7-f036-72e2-9ed7-502d32f68abc.jsonl"
        )
        older_invalid = self.codex_root / "2026" / "03" / "24" / (
            "rollout-2026-03-24T15-56-38-019d1111-f036-72e2-9ed7-502d32f68abc.jsonl"
        )
        write_codex_session(
            latest,
            session_id="019d23c7-f036-72e2-9ed7-502d32f68abc",
            prompt="latest session prompt",
        )
        write_raw_lines(older_invalid, ["{not-json"])
        set_mtime(latest, 200)
        set_mtime(older_invalid, 100)

        summaries = sb.load_summaries("codex", "", limit=1)

        self.assertEqual(len(summaries), 1)
        self.assertEqual(summaries[0].session_id, "019d23c7-f036-72e2-9ed7-502d32f68abc")
        self.assertEqual(summaries[0].title, "latest session prompt")

    def test_load_summaries_query_scans_candidates_for_matches(self):
        codex_path = self.codex_root / "2026" / "03" / "25" / (
            "rollout-2026-03-25T15-56-38-019d23c7-f036-72e2-9ed7-502d32f68abc.jsonl"
        )
        claude_path = self.claude_root / "demo-project" / "claude-match.jsonl"
        write_codex_session(
            codex_path,
            session_id="019d23c7-f036-72e2-9ed7-502d32f68abc",
            prompt="something unrelated",
        )
        write_claude_session(
            claude_path,
            session_id="claude-match",
            prompt="needle keyword is here",
        )
        set_mtime(codex_path, 300)
        set_mtime(claude_path, 100)

        summaries = sb.load_summaries("all", "needle", limit=1)

        self.assertEqual(len(summaries), 1)
        self.assertEqual(summaries[0].source, "claude")
        self.assertEqual(summaries[0].session_id, "claude-match")

    def test_resolve_summary_supports_numeric_index_and_id_prefix(self):
        session_id = "019d23c7-f036-72e2-9ed7-502d32f68abc"
        codex_path = self.codex_root / "2026" / "03" / "25" / (
            f"rollout-2026-03-25T15-56-38-{session_id}.jsonl"
        )
        write_codex_session(
            codex_path,
            session_id=session_id,
            prompt="fork this conversation",
        )
        set_mtime(codex_path, 250)

        by_index = sb.resolve_summary("codex", "", "1")
        by_prefix = sb.resolve_summary("codex", "", session_id[:12])

        self.assertEqual(by_index.session_id, session_id)
        self.assertEqual(by_prefix.session_id, session_id)


def write_codex_session(path: Path, session_id: str, prompt: str):
    write_raw_lines(
        path,
        [
            json.dumps(
                {
                    "type": "session_meta",
                    "payload": {
                        "id": session_id,
                        "cwd": "/tmp/project",
                        "timestamp": "2026-03-25T06:56:38Z",
                    },
                }
            ),
            json.dumps(
                {
                    "type": "response_item",
                    "timestamp": "2026-03-25T06:56:39Z",
                    "payload": {
                        "type": "message",
                        "role": "user",
                        "content": [{"text": prompt}],
                    },
                }
            ),
        ],
    )


def write_claude_session(path: Path, session_id: str, prompt: str):
    write_raw_lines(
        path,
        [
            json.dumps(
                {
                    "type": "user",
                    "sessionId": session_id,
                    "cwd": "/tmp/project",
                    "timestamp": "2026-03-25T06:56:38Z",
                    "message": {"content": [{"type": "text", "text": prompt}]},
                }
            )
        ],
    )


def write_raw_lines(path: Path, lines: list[str]):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def set_mtime(path: Path, value: int):
    path.touch()
    path.chmod(0o644)
    import os

    os.utime(path, (value, value))


if __name__ == "__main__":
    unittest.main()
