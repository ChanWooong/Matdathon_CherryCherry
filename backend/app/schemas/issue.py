from pydantic import BaseModel, Field


class IssueDraft(BaseModel):
    """정리 에이전트가 생성하는 이슈 초안."""

    title: str
    body: str
    labels: list[str] = Field(default_factory=list)
    assignee: str | None = None
    due_date: str | None = None
    acceptance_criteria: list[str] = Field(default_factory=list)
    source_quote: str | None = Field(
        default=None, description="회의록 원문 근거 문장 (환각 완화)"
    )


class AnalyzeRequest(BaseModel):
    repo: str
    transcript: str


class CreateIssuesRequest(BaseModel):
    repo: str
    drafts: list[IssueDraft]
