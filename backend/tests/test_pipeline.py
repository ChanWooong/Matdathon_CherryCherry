"""파이프라인 워크플로 통합 테스트 (네트워크 없이 실행)."""

from __future__ import annotations

import pytest

from app.agents.pipeline import (
    PipelineInput,
    StageFailure,
    _coerce,
    _repository_policy_tool,
    build_workflow,
)
from app.core.config import Settings
from app.schemas import (
    AnalysisResult,
    CompositionResult,
    DeltaEvent,
    ExtractionResult,
    LabelSummary,
    StageEvent,
    StageStatus,
)
from tests.fakes import scripted_agent

EXTRACTION = {
    "summary": "결제 지연 이슈를 논의했다.",
    "decisions": [{"statement": "타임아웃을 5초로 낮춘다", "evidence": "5초로 낮추죠"}],
    "tasks": [
        {
            "title": "결제 API 타임아웃 조정",
            "detail": "5초로 변경",
            "assignee": "chanwoong",
            "due": "다음 주 금요일",
            "evidence": "찬웅님이 다음 주 금요일까지 5초로 낮춰주세요",
        }
    ],
    "open_questions": ["재시도 정책은 미정"],
}

COMPOSITION = {
    "drafts": [
        {
            "draft_id": "draft-1",
            "title": "결제 API 타임아웃을 5초로 조정",
            "body": "## 배경\n결제 지연",
            "acceptance_criteria": [{"id": "AC1", "text": "타임아웃이 5초로 설정된다"}],
            "labels": ["bug", "존재하지않는라벨"],
            "assignees": ["chanwoong", "ghost"],
            "evidence": "찬웅님이 다음 주 금요일까지 5초로 낮춰주세요",
            "source_task_title": "결제 API 타임아웃 조정",
        }
    ]
}

REVIEW = {
    "findings": [
        {
            "draft_id": "draft-1",
            "kind": "missing_due",
            "severity": "warning",
            "message": "기한이 본문에 없습니다.",
            "suggestion": "본문 참고 항목에 '다음 주 금요일'을 명시하세요.",
        }
    ],
    "verdict": "1건은 기한 확인이 필요합니다.",
}


def _settings(**overrides) -> Settings:
    defaults = {"github_token": "test-token", "max_retries": 1}
    return Settings(**{**defaults, **overrides})


def _pipeline_input() -> PipelineInput:
    return PipelineInput(
        transcript="찬웅님이 다음 주 금요일까지 결제 API 타임아웃을 5초로 낮춰주세요.",
        analysis_id="test-analysis",
        repo="acme/web",
        labels=[LabelSummary(name="bug"), LabelSummary(name="p0")],
        assignees=["chanwoong"],
    )


def _agents(*, extractor_failures: int = 0) -> dict:
    return {
        "extractor": scripted_agent(
            "extractor",
            [EXTRACTION] * 3,
            failures=extractor_failures,
        ),
        "composer": scripted_agent("composer", [COMPOSITION]),
        "reviewer": scripted_agent("reviewer", [REVIEW]),
    }


async def _collect(workflow, message):
    """워크플로를 스트리밍 실행하고 (최종결과, 단계이벤트, 델타) 를 모은다."""
    result: AnalysisResult | None = None
    stages: list[StageEvent] = []
    deltas: list[DeltaEvent] = []

    async for event in workflow.run(message, stream=True):
        data = event.data
        if isinstance(data, StageEvent):
            stages.append(data)
        elif isinstance(data, DeltaEvent):
            deltas.append(data)
        elif isinstance(data, AnalysisResult):
            result = data

    return result, stages, deltas


async def test_pipeline_produces_analysis_result():
    workflow = build_workflow(_settings(), agents=_agents())
    result, stages, deltas = await _collect(workflow, _pipeline_input())

    assert result is not None
    assert result.analysis_id == "test-analysis"
    assert result.summary == "결제 지연 이슈를 논의했다."
    assert len(result.drafts) == 1
    assert result.verdict == "1건은 기한 확인이 필요합니다."
    assert len(result.findings) == 1

    # 세 단계가 모두 실행되고 완료되어야 한다.
    done = {s.stage for s in stages if s.status is StageStatus.DONE}
    assert done == {"extract", "compose", "review"}

    # 스트리밍 델타가 실제로 흘러나와야 한다 (첫 토큰 조기 표시).
    assert deltas, "스트리밍 델타가 하나도 없습니다."
    assert {d.stage for d in deltas} == {"extract", "compose", "review"}


async def test_pipeline_filters_hallucinated_labels_and_assignees():
    workflow = build_workflow(_settings(), agents=_agents())
    result, _, _ = await _collect(workflow, _pipeline_input())

    draft = result.drafts[0]
    assert draft.labels == ["bug"], "리포에 없는 라벨이 걸러지지 않았습니다."
    assert draft.assignees == ["chanwoong"], "없는 담당자가 걸러지지 않았습니다."


async def test_pipeline_retries_failed_stage():
    # 첫 시도는 실패하지만 max_retries=1이므로 두 번째 시도에서 성공해야 한다.
    workflow = build_workflow(_settings(), agents=_agents(extractor_failures=1))
    result, stages, _ = await _collect(workflow, _pipeline_input())

    assert result is not None
    failed = [s for s in stages if s.status is StageStatus.FAILED]
    assert len(failed) == 1
    assert failed[0].stage == "extract"
    assert failed[0].attempt == 1


async def test_pipeline_raises_when_retries_exhausted():
    workflow = build_workflow(
        _settings(max_retries=0), agents=_agents(extractor_failures=5)
    )
    with pytest.raises(StageFailure) as exc:
        await _collect(workflow, _pipeline_input())
    assert exc.value.stage == "extract"


async def test_pipeline_skips_downstream_when_no_tasks():
    empty = {"summary": "잡담만 했다.", "decisions": [], "tasks": [], "open_questions": []}
    agents = {
        "extractor": scripted_agent("extractor", [empty]),
        "composer": scripted_agent("composer", [COMPOSITION]),
        "reviewer": scripted_agent("reviewer", [REVIEW]),
    }
    workflow = build_workflow(_settings(), agents=agents)
    result, stages, _ = await _collect(workflow, _pipeline_input())

    assert result.drafts == []
    assert result.findings == []
    # 정리/검수 에이전트는 호출되지 않아야 한다.
    assert {s.stage for s in stages} == {"extract"}


def test_repository_policy_tool_exposes_only_server_verified_values():
    tool = _repository_policy_tool(_pipeline_input())

    assert tool.__name__ == "get_repository_policy"
    assert tool() == (
        '{"repo": "acme/web", "allowed_labels": ["bug", "p0"], '
        '"allowed_assignees": ["chanwoong"]}'
    )


def test_extraction_result_accepts_title_and_decision_aliases_for_decisions():
    result = ExtractionResult.model_validate(
        {
            "summary": "요약",
            "decisions": [
                {"title": "배포 순서 프로덕션으로 정함"},
                {"decision": "SSE 30초 타임아웃으로 확정"},
            ],
            "tasks": [],
            "open_questions": [],
        }
    )
    assert result.decisions[0].statement == "배포 순서 프로덕션으로 정함"
    assert result.decisions[1].statement == "SSE 30초 타임아웃으로 확정"


def test_extraction_result_accepts_copilot_style_shapes():
    result = ExtractionResult.model_validate(
        {
            "summary": [
                "로그인 토큰 만료 이슈를 논의했다.",
                "SSE keep-alive 핑 추가를 합의했다.",
            ],
            "decisions": [{"decision": "배포는 스테이징 검증 후 프로덕션"}],
            "tasks": [
                {"task": "로그인 토큰 만료 처리", "owner": "민지"},
                {"task": "SSE 연결 안정화", "deadline": "다음 주"},
            ],
            "open_questions": [{"question": "온보딩 문서 범위 확정 필요"}],
        }
    )
    assert "로그인 토큰 만료" in result.summary
    assert result.decisions[0].statement.startswith("배포는")
    assert result.tasks[0].title == "로그인 토큰 만료 처리"
    assert result.tasks[0].assignee == "민지"
    assert result.tasks[1].due == "다음 주"
    assert result.open_questions == ["온보딩 문서 범위 확정 필요"]


def test_coerce_accepts_composition_json_with_trailing_text():
    payload = (
        '{"draft_id":"draft-1","title":"초안","body":"본문","labels":[],'
        '"assignees":[],"acceptance_criteria":[]}\\n'
        "모델 설명 텍스트"
    )
    result = _coerce(payload, CompositionResult)
    assert len(result.drafts) == 1
    assert result.drafts[0].title == "초안"
