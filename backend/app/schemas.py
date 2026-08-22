"""Pydantic 스키마 — 에이전트 간 계약(contract)이자 API 응답 모델."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator

from app.core.repo_ref import normalize_repo_ref

AI_NOTICE = "🤖 AI가 생성한 초안입니다. 병합 전 반드시 검토해 주세요."


# --------------------------------------------------------------------------
# 1단계: 추출 에이전트 (Extractor) 출력
# --------------------------------------------------------------------------


class Decision(BaseModel):
    """회의에서 확정된 결정사항."""

    statement: str = Field(
        validation_alias=AliasChoices("statement", "title", "decision"),
        description="결정된 내용 한 문장",
    )
    evidence: str = Field(
        default="",
        validation_alias=AliasChoices("evidence", "quote", "source"),
        description="회의록 원문에서 그대로 인용한 근거 문장",
    )

    @model_validator(mode="before")
    @classmethod
    def _coerce_string(cls, value: Any) -> Any:
        if isinstance(value, str):
            return {"statement": value}
        return value


class ExtractedTask(BaseModel):
    """회의록에서 추출한 할 일 하나."""

    title: str = Field(
        validation_alias=AliasChoices("title", "task", "item"),
        description="할 일을 요약한 한 문장",
    )
    detail: str = Field(
        default="",
        validation_alias=AliasChoices("detail", "description", "context"),
        description="맥락 및 배경 설명",
    )
    assignee: str | None = Field(
        default=None,
        validation_alias=AliasChoices("assignee", "owner", "person", "who"),
        description="회의록에 명시된 담당자. 불명확하면 null",
    )
    due: str | None = Field(
        default=None,
        validation_alias=AliasChoices("due", "deadline", "due_date"),
        description="기한. 회의록 표현 그대로(예: '다음 주 금요일'). 없으면 null",
    )
    evidence: str = Field(
        default="",
        validation_alias=AliasChoices("evidence", "quote", "source"),
        description="이 할 일의 근거가 되는 회의록 원문 인용 (환각 완화용)"
    )

    @model_validator(mode="before")
    @classmethod
    def _coerce_string(cls, value: Any) -> Any:
        if isinstance(value, str):
            return {"title": value}
        return value


class ExtractionResult(BaseModel):
    """추출 에이전트의 구조화 출력."""

    summary: str = Field(description="회의 전체 3줄 요약")
    decisions: list[Decision] = Field(default_factory=list)
    tasks: list[ExtractedTask] = Field(default_factory=list)
    open_questions: list[str] = Field(
        default_factory=list, description="회의에서 결론나지 않은 논점"
    )

    @field_validator("summary", mode="before")
    @classmethod
    def _coerce_summary(cls, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, list):
            return "\n".join(str(item) for item in value if str(item).strip())
        if isinstance(value, dict):
            return str(value.get("summary") or value.get("text") or "")
        return str(value)

    @field_validator("open_questions", mode="before")
    @classmethod
    def _coerce_open_questions(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        if not isinstance(value, list):
            return []
        normalized: list[str] = []
        for item in value:
            if isinstance(item, str):
                text = item.strip()
            elif isinstance(item, dict):
                text = str(item.get("question") or item.get("text") or "").strip()
            else:
                text = str(item).strip()
            if text:
                normalized.append(text)
        return normalized


# --------------------------------------------------------------------------
# 2단계: 정리 에이전트 (Composer) 출력
# --------------------------------------------------------------------------


class AcceptanceCriterion(BaseModel):
    """완료 조건(AC) 한 줄.

    확장 기능(PR 셀프 리뷰)에서 PR diff와 대조하는 단위가 되므로
    반드시 검증 가능한(verifiable) 형태로 작성한다.
    """

    id: str = Field(description="AC1, AC2 형태의 안정적인 식별자")
    text: str = Field(description="객관적으로 검증 가능한 완료 조건")


class IssueDraft(BaseModel):
    """GitHub 이슈 초안 하나. 사용자가 카드 UI에서 수정/제외/승인한다."""

    draft_id: str = Field(description="프론트엔드에서 카드를 식별하는 안정적인 ID")
    title: str = Field(description="이슈 제목 (동사로 시작, 60자 이내 권장)")
    body: str = Field(description="이슈 본문 마크다운 (AI 고지 제외 — 생성 시 자동 첨부)")
    acceptance_criteria: list[AcceptanceCriterion] = Field(default_factory=list)
    labels: list[str] = Field(
        default_factory=list, description="리포에 실제로 존재하는 라벨만 사용"
    )
    assignees: list[str] = Field(default_factory=list)
    evidence: str = Field(default="", description="원본 회의록 근거 인용")
    source_task_title: str = Field(
        default="", description="이 초안이 유래한 ExtractedTask.title"
    )

    def to_github_body(self) -> str:
        """AI 고지 + AC 체크리스트를 붙여 실제 게시할 이슈 본문을 만든다."""
        parts = [f"> {AI_NOTICE}", "", self.body.strip()]

        if self.acceptance_criteria:
            parts += ["", "## ✅ 완료 조건 (Acceptance Criteria)", ""]
            parts += [
                f"- [ ] `{ac.id}` {ac.text}" for ac in self.acceptance_criteria
            ]

        if self.evidence:
            parts += ["", "## 📌 회의록 근거", "", f"> {self.evidence}"]

        return "\n".join(parts)


class CompositionResult(BaseModel):
    """정리 에이전트의 구조화 출력."""

    drafts: list[IssueDraft] = Field(default_factory=list)


# --------------------------------------------------------------------------
# 3단계: 검수 에이전트 (Reviewer) 출력
# --------------------------------------------------------------------------


class FindingSeverity(StrEnum):
    BLOCKER = "blocker"
    WARNING = "warning"
    INFO = "info"


class FindingKind(StrEnum):
    MISSING_DUE = "missing_due"
    MISSING_ASSIGNEE = "missing_assignee"
    DUPLICATE = "duplicate"
    VAGUE_AC = "vague_ac"
    MISSING_TASK = "missing_task"
    OTHER = "other"


class ReviewFinding(BaseModel):
    """검수 에이전트가 지적한 문제 하나."""

    draft_id: str | None = Field(
        default=None, description="문제가 있는 초안 ID. 전체 수준 지적이면 null"
    )
    kind: FindingKind = FindingKind.OTHER
    severity: FindingSeverity = FindingSeverity.WARNING
    message: str = Field(description="사용자에게 보여줄 지적 내용")
    suggestion: str = Field(default="", description="구체적인 개선 제안")


class ReviewResult(BaseModel):
    """검수 에이전트의 구조화 출력."""

    findings: list[ReviewFinding] = Field(default_factory=list)
    verdict: str = Field(default="", description="전반적인 품질 총평 한 줄")


# --------------------------------------------------------------------------
# 분석 파이프라인 요청 / 최종 결과
# --------------------------------------------------------------------------

MAX_TRANSCRIPT_CHARS = 20_000


class AnalyzeRequest(BaseModel):
    """POST /api/analyze 요청 본문."""

    transcript: str = Field(min_length=1, max_length=MAX_TRANSCRIPT_CHARS)
    repo: str | None = Field(
        default=None,
        description=(
            "owner/repo 또는 GitHub 링크. "
            "지정하면 실제 라벨/멤버 목록을 컨텍스트로 넘겨준다."
        ),
    )
    meeting_title: str | None = None

    @field_validator("transcript")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("회의록 내용이 비어 있습니다.")
        return v

    @field_validator("repo")
    @classmethod
    def _valid_repo(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        return normalize_repo_ref(v)


class AnalysisResult(BaseModel):
    """분석 파이프라인 최종 결과 — SSE의 마지막 `result` 이벤트로 전달된다."""

    analysis_id: str
    repo: str | None = None
    summary: str = ""
    decisions: list[Decision] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    drafts: list[IssueDraft] = Field(default_factory=list)
    findings: list[ReviewFinding] = Field(default_factory=list)
    verdict: str = ""
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC)
    )


# --------------------------------------------------------------------------
# 이슈 생성 (승인 게이트 이후)
# --------------------------------------------------------------------------


class CreateIssuesRequest(BaseModel):
    """POST /api/issues 요청 본문.

    프론트에서 사용자가 수정/제외를 마친 초안만 담아 보낸다.
    `approved=True`가 아니면 서버가 거부한다 (책임 있는 AI: 승인 게이트).
    """

    repo: str = Field(description="owner/repo 또는 GitHub 링크")
    drafts: list[IssueDraft] = Field(min_length=1)
    approved: bool = Field(
        default=False, description="사용자가 명시적으로 승인했는가"
    )
    analysis_id: str | None = None

    @field_validator("repo")
    @classmethod
    def _valid_repo(cls, v: str) -> str:
        return normalize_repo_ref(v)


class IssueCreationOutcome(BaseModel):
    """초안 하나에 대한 생성 결과 (성공/실패 모두 표현)."""

    draft_id: str
    title: str
    ok: bool
    number: int | None = None
    url: str | None = None
    error: str | None = None


class CreateIssuesResponse(BaseModel):
    """부분 실패를 명시적으로 구분해서 돌려준다."""

    repo: str
    results: list[IssueCreationOutcome]

    @property
    def created(self) -> list[IssueCreationOutcome]:
        return [r for r in self.results if r.ok]

    @property
    def failed(self) -> list[IssueCreationOutcome]:
        return [r for r in self.results if not r.ok]

    succeeded_count: int = 0
    failed_count: int = 0


# --------------------------------------------------------------------------
# 리포 / 라벨 조회
# --------------------------------------------------------------------------


class RepoSummary(BaseModel):
    id: int
    full_name: str
    name: str
    owner: str
    private: bool = False
    description: str | None = None
    default_branch: str = "main"
    language: str | None = None
    html_url: str
    open_issues_count: int = 0
    updated_at: datetime | None = None
    pushed_at: datetime | None = None


class LabelSummary(BaseModel):
    name: str
    color: str = ""
    description: str | None = None


# --------------------------------------------------------------------------
# GitHub 이슈 / Pull Request 조회
# --------------------------------------------------------------------------


class GitHubUserSummary(BaseModel):
    login: str
    avatar_url: str | None = None
    html_url: str | None = None


class GitHubIssueSummary(BaseModel):
    number: int
    title: str
    state: str
    html_url: str
    body: str | None = None
    user: GitHubUserSummary | None = None
    labels: list[LabelSummary] = Field(default_factory=list)
    assignees: list[GitHubUserSummary] = Field(default_factory=list)
    comments: int = 0
    created_at: datetime
    updated_at: datetime


class GitHubPullRequestSummary(BaseModel):
    number: int
    title: str
    state: str
    html_url: str
    draft: bool = False
    user: GitHubUserSummary | None = None
    head_ref: str
    base_ref: str
    created_at: datetime
    updated_at: datetime


class GitHubPullRequestDetail(GitHubPullRequestSummary):
    body: str | None = None
    merged: bool = False
    mergeable: bool | None = None
    additions: int = 0
    deletions: int = 0
    changed_files: int = 0
    commits: int = 0
    comments: int = 0
    review_comments: int = 0
    diff_url: str | None = None
    patch_url: str | None = None


# --------------------------------------------------------------------------
# Pull Request AI 리뷰
# --------------------------------------------------------------------------


class PullRequestReviewVerdict(StrEnum):
    APPROVE = "approve"
    COMMENT = "comment"
    REQUEST_CHANGES = "request_changes"


class PullRequestReviewFinding(BaseModel):
    severity: FindingSeverity
    title: str
    message: str
    suggestion: str = ""
    file: str | None = None
    line: int | None = Field(default=None, ge=1)


class PullRequestReviewModelOutput(BaseModel):
    verdict: PullRequestReviewVerdict
    summary: str
    findings: list[PullRequestReviewFinding] = Field(default_factory=list)


class PullRequestReviewResponse(PullRequestReviewModelOutput):
    repo: str
    pull_number: int
    posted_to_github: Literal[False] = False


# --------------------------------------------------------------------------
# SSE 이벤트
# --------------------------------------------------------------------------

StageName = Literal["extract", "compose", "review"]


class StageStatus(StrEnum):
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class StageEvent(BaseModel):
    """에이전트 단계 시작/종료 알림."""

    stage: StageName
    status: StageStatus
    label: str = ""
    duration_ms: int | None = None
    attempt: int = 1


class DeltaEvent(BaseModel):
    """에이전트가 토큰을 생성하는 중 전달되는 부분 텍스트."""

    stage: StageName
    text: str


class ErrorEvent(BaseModel):
    stage: StageName | None = None
    message: str
    recoverable: bool = False


def sse(event: str, data: BaseModel | dict[str, Any] | str) -> str:
    """dict/모델을 SSE 와이어 포맷 한 프레임으로 직렬화한다."""
    import json

    if isinstance(data, BaseModel):
        payload = data.model_dump_json()
    elif isinstance(data, str):
        payload = json.dumps({"message": data}, ensure_ascii=False)
    else:
        payload = json.dumps(data, ensure_ascii=False, default=str)

    # 데이터에 개행이 있으면 SSE 프레임이 깨지므로 줄 단위로 나눠 보낸다.
    lines = "".join(f"data: {line}\n" for line in payload.split("\n"))
    return f"event: {event}\n{lines}\n"
