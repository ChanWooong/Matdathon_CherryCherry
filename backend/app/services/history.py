"""분석 이력 저장소 (SQLite).

개인정보 원칙: 회의록 **원문은 저장하지 않는다**.
`persist_transcript=True`로 사용자가 명시적으로 동의한 경우에만 원문을 남긴다.
기본 저장 대상은 요약 · 초안 메타데이터 · 생성된 이슈 링크뿐이다.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.schemas import AnalysisResult, IssueCreationOutcome

logger = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS analyses (
    analysis_id   TEXT PRIMARY KEY,
    created_at    TEXT NOT NULL,
    repo          TEXT,
    meeting_title TEXT,
    summary       TEXT NOT NULL DEFAULT '',
    verdict       TEXT NOT NULL DEFAULT '',
    draft_count   INTEGER NOT NULL DEFAULT 0,
    finding_count INTEGER NOT NULL DEFAULT 0,
    drafts_json   TEXT NOT NULL DEFAULT '[]',
    findings_json TEXT NOT NULL DEFAULT '[]',
    transcript    TEXT
);

CREATE TABLE IF NOT EXISTS created_issues (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_id TEXT,
    repo        TEXT NOT NULL,
    draft_id    TEXT NOT NULL,
    title       TEXT NOT NULL,
    number      INTEGER,
    url         TEXT,
    ok          INTEGER NOT NULL,
    error       TEXT,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_analysis  ON created_issues(analysis_id);
"""


class HistoryStore:
    """스레드 안전한 얇은 SQLite 래퍼.

    해커톤 스코프에서는 파일 SQLite로 충분하다. Container Apps에서는
    영속 볼륨이 없으면 재시작 시 초기화되므로, 필요하면 경로를
    마운트된 볼륨으로 지정한다.
    """

    def __init__(self, db_path: str | Path = "data/history.db") -> None:
        self._path = Path(db_path)
        if self._path.parent and str(self._path.parent) not in ("", "."):
            self._path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    # -- 쓰기 -------------------------------------------------------------

    def save_analysis(
        self,
        result: AnalysisResult,
        *,
        meeting_title: str | None = None,
        transcript: str | None = None,
        persist_transcript: bool = False,
    ) -> None:
        """분석 결과를 저장한다.

        `persist_transcript`가 False면 `transcript`는 무시되고 NULL로 저장된다.
        """
        stored_transcript = transcript if persist_transcript else None
        if transcript and not persist_transcript:
            logger.debug("개인정보 설정에 따라 회의록 원문을 저장하지 않습니다.")

        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO analyses (
                    analysis_id, created_at, repo, meeting_title, summary, verdict,
                    draft_count, finding_count, drafts_json, findings_json, transcript
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    result.analysis_id,
                    result.created_at.isoformat(),
                    result.repo,
                    meeting_title,
                    result.summary,
                    result.verdict,
                    len(result.drafts),
                    len(result.findings),
                    json.dumps(
                        [d.model_dump(mode="json") for d in result.drafts],
                        ensure_ascii=False,
                    ),
                    json.dumps(
                        [f.model_dump(mode="json") for f in result.findings],
                        ensure_ascii=False,
                    ),
                    stored_transcript,
                ),
            )

    def save_issue_results(
        self, repo: str, outcomes: list[IssueCreationOutcome], analysis_id: str | None
    ) -> None:
        now = datetime.now(UTC).isoformat()
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO created_issues (
                    analysis_id, repo, draft_id, title, number, url, ok, error, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        analysis_id,
                        repo,
                        o.draft_id,
                        o.title,
                        o.number,
                        o.url,
                        1 if o.ok else 0,
                        o.error,
                        now,
                    )
                    for o in outcomes
                ],
            )

    # -- 읽기 -------------------------------------------------------------

    def list_analyses(self, limit: int = 30) -> list[dict[str, Any]]:
        """이력 목록. 원문·초안 본문은 제외한 가벼운 요약만 돌려준다."""
        with self._connect() as conn, closing(conn.cursor()) as cur:
            cur.execute(
                """
                SELECT a.analysis_id, a.created_at, a.repo, a.meeting_title,
                       a.summary, a.verdict, a.draft_count, a.finding_count,
                       COALESCE(SUM(i.ok), 0) AS issues_created
                FROM analyses a
                LEFT JOIN created_issues i ON i.analysis_id = a.analysis_id
                GROUP BY a.analysis_id
                ORDER BY a.created_at DESC
                LIMIT ?
                """,
                (limit,),
            )
            return [dict(row) for row in cur.fetchall()]

    def get_analysis(self, analysis_id: str) -> dict[str, Any] | None:
        with self._connect() as conn, closing(conn.cursor()) as cur:
            cur.execute(
                "SELECT * FROM analyses WHERE analysis_id = ?", (analysis_id,)
            )
            row = cur.fetchone()
            if row is None:
                return None

            record = dict(row)
            record["drafts"] = json.loads(record.pop("drafts_json") or "[]")
            record["findings"] = json.loads(record.pop("findings_json") or "[]")
            record["transcript_stored"] = record.get("transcript") is not None

            cur.execute(
                "SELECT draft_id, title, number, url, ok, error "
                "FROM created_issues WHERE analysis_id = ? ORDER BY id",
                (analysis_id,),
            )
            record["issues"] = [dict(r) for r in cur.fetchall()]
            return record

    def delete_analysis(self, analysis_id: str) -> bool:
        """사용자 삭제 요청 처리 (개인정보 권리)."""
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM analyses WHERE analysis_id = ?", (analysis_id,)
            )
            conn.execute(
                "DELETE FROM created_issues WHERE analysis_id = ?", (analysis_id,)
            )
            return cur.rowcount > 0
