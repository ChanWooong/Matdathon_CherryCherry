"""FastAPI 라우트."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.agents.chat_client import ModelConfigurationError
from app.agents.pipeline import (
    PipelineInput,
    StageFailure,
    build_workflow,
)
from app.api.dependencies import get_github, require_api_key
from app.api.github_routes import router as github_router
from app.core.config import Settings, get_settings
from app.schemas import (
    AnalysisResult,
    AnalyzeRequest,
    CreateIssuesRequest,
    CreateIssuesResponse,
    DeltaEvent,
    ErrorEvent,
    LabelSummary,
    RepoSummary,
    StageEvent,
    sse,
)
from app.services.github import GitHubError, GitHubService
from app.services.history import HistoryStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", dependencies=[Depends(require_api_key)])
router.include_router(github_router)


def get_history(request: Request) -> HistoryStore:
    return request.app.state.history


# --------------------------------------------------------------------------
# 리포 / 라벨
# --------------------------------------------------------------------------


@router.get("/repos", response_model=list[RepoSummary])
async def list_repos(github: GitHubService = Depends(get_github)):
    try:
        return await github.list_repos()
    except GitHubError as exc:
        raise HTTPException(status_code=exc.status or 502, detail=str(exc)) from exc
    finally:
        await github.aclose()


@router.get("/repos/resolve", response_model=RepoSummary)
async def resolve_repo(q: str, github: GitHubService = Depends(get_github)):
    try:
        return await github.get_repo(q)
    except GitHubError as exc:
        raise HTTPException(status_code=exc.status or 502, detail=str(exc)) from exc
    finally:
        await github.aclose()


@router.get("/repos/{owner}/{repo}/labels", response_model=list[LabelSummary])
async def list_labels(
    owner: str, repo: str, github: GitHubService = Depends(get_github)
):
    try:
        return await github.list_labels(f"{owner}/{repo}")
    except GitHubError as exc:
        raise HTTPException(status_code=exc.status or 502, detail=str(exc)) from exc
    finally:
        await github.aclose()


# --------------------------------------------------------------------------
# 분석 (SSE 스트리밍)
# --------------------------------------------------------------------------


async def _gather_repo_context(
    repo: str | None, settings: Settings
) -> tuple[list[LabelSummary], list[str]]:
    """정리 에이전트가 실제 라벨/담당자만 쓰도록 컨텍스트를 모은다.

    조회에 실패해도 분석 자체는 계속 진행한다(라벨 없이 초안 생성).
    """
    if not repo or not settings.github_token:
        return [], []

    github = GitHubService(settings.github_token, settings)
    try:
        labels, assignees = await asyncio.gather(
            github.list_labels(repo),
            github.list_assignable_users(repo),
            return_exceptions=True,
        )
        return (
            labels if isinstance(labels, list) else [],
            assignees if isinstance(assignees, list) else [],
        )
    except Exception:  # noqa: BLE001 - 컨텍스트는 있으면 좋은 정도
        logger.warning("리포 컨텍스트 조회 실패: %s", repo, exc_info=True)
        return [], []
    finally:
        await github.aclose()


async def _analysis_stream(
    payload: AnalyzeRequest,
    settings: Settings,
    history: HistoryStore,
    request: Request,
) -> AsyncIterator[str]:
    """에이전트 파이프라인을 SSE 프레임으로 중계한다."""
    labels, assignees = await _gather_repo_context(payload.repo, settings)

    pipeline_input = PipelineInput(
        transcript=payload.transcript,
        repo=payload.repo,
        labels=labels,
        assignees=assignees,
    )

    yield sse(
        "start",
        {
            "analysis_id": pipeline_input.analysis_id,
            "repo": payload.repo,
            "label_count": len(labels),
        },
    )

    # 종료 프레임은 절대 `finally`에서 yield하지 않는다.
    # 클라이언트가 끊긴 상태에서 제너레이터가 닫히면 GeneratorExit이 던져지는데,
    # finally가 다시 yield하면 "async generator ignored GeneratorExit" RuntimeError가 난다.
    done_frame = sse("done", {"analysis_id": pipeline_input.analysis_id})
    result: AnalysisResult | None = None

    try:
        workflow = build_workflow(settings)

        async for event in workflow.run(pipeline_input, stream=True):
            if await request.is_disconnected():
                logger.info("클라이언트 연결이 끊겨 분석을 중단합니다.")
                return  # 받을 상대가 없으므로 done도 보내지 않는다

            data = event.data
            if isinstance(data, StageEvent):
                yield sse("stage", data)
            elif isinstance(data, DeltaEvent):
                yield sse("delta", data)
            elif isinstance(data, AnalysisResult):
                result = data
            elif event.type == "failed":
                yield sse(
                    "error",
                    ErrorEvent(message=str(event.details or "워크플로가 실패했습니다.")),
                )

    except ModelConfigurationError as exc:
        logger.error("모델 설정 오류: %s", exc)
        yield sse("error", ErrorEvent(message=str(exc)))
        yield done_frame
        return
    except StageFailure as exc:
        logger.error("%s 단계 실패: %s", exc.stage, exc)
        yield sse("error", ErrorEvent(stage=exc.stage, message=str(exc)))
        yield done_frame
        return
    except asyncio.CancelledError:
        raise  # 취소는 지체 없이 전파한다
    except Exception as exc:  # noqa: BLE001 - SSE는 항상 정상 종료해야 한다
        logger.exception("분석 중 예기치 못한 오류")
        yield sse("error", ErrorEvent(message=f"예기치 못한 오류: {exc}"))
        yield done_frame
        return

    if result is None:
        yield sse("error", ErrorEvent(message="분석 결과를 생성하지 못했습니다."))
        yield done_frame
        return

    if settings.history_enabled:
        try:
            history.save_analysis(
                result,
                meeting_title=payload.meeting_title,
                transcript=payload.transcript,
                persist_transcript=settings.persist_transcript,
            )
        except Exception:  # noqa: BLE001 - 이력 저장 실패가 응답을 막지 않게
            logger.warning("분석 이력 저장 실패", exc_info=True)

    yield sse("result", result)
    yield done_frame


@router.post("/analyze")
async def analyze(
    payload: AnalyzeRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
    history: HistoryStore = Depends(get_history),
):
    """회의록을 분석해 이슈 초안을 만든다 (SSE 스트리밍).

    이 엔드포인트는 **아무것도 생성하지 않는다**. 초안만 돌려주며,
    실제 이슈 생성은 사용자 승인 후 `/api/issues`에서 이뤄진다.
    """
    return StreamingResponse(
        _analysis_stream(payload, settings, history, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --------------------------------------------------------------------------
# 이슈 생성 (승인 게이트)
# --------------------------------------------------------------------------


@router.post("/issues", response_model=CreateIssuesResponse)
async def create_issues(
    payload: CreateIssuesRequest,
    settings: Settings = Depends(get_settings),
    history: HistoryStore = Depends(get_history),
):
    """승인된 초안을 GitHub 이슈로 만든다.

    책임 있는 AI: `approved=True`가 아니면 거부한다. 자동 생성 경로는 없다.
    승인 검사는 GitHub 클라이언트를 만들기 **전에** 수행해, 토큰 유무와 무관하게
    항상 같은 거부 사유를 돌려준다.
    """
    if not payload.approved:
        raise HTTPException(
            status_code=400,
            detail="사용자 승인 없이는 이슈를 생성할 수 없습니다. approved=true가 필요합니다.",
        )

    try:
        github = GitHubService(settings.github_token, settings)
    except GitHubError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    try:
        response = await github.create_issues(
            payload.repo,
            payload.drafts,
            concurrency=settings.issue_create_concurrency,
        )
    except GitHubError as exc:
        raise HTTPException(status_code=exc.status or 502, detail=str(exc)) from exc
    finally:
        await github.aclose()

    if settings.history_enabled:
        try:
            history.save_issue_results(
                payload.repo, response.results, payload.analysis_id
            )
        except Exception:  # noqa: BLE001
            logger.warning("이슈 생성 이력 저장 실패", exc_info=True)

    return response


# --------------------------------------------------------------------------
# 이력
# --------------------------------------------------------------------------


@router.get("/history")
async def list_history(
    limit: int = 30,
    history: HistoryStore = Depends(get_history),
    settings: Settings = Depends(get_settings),
):
    if not settings.history_enabled:
        raise HTTPException(status_code=404, detail="이력 기능이 비활성화되어 있습니다.")
    return history.list_analyses(limit=min(max(limit, 1), 100))


@router.get("/history/{analysis_id}")
async def get_history_item(
    analysis_id: str, history: HistoryStore = Depends(get_history)
):
    record = history.get_analysis(analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="해당 분석 이력을 찾을 수 없습니다.")
    return record


@router.delete("/history/{analysis_id}", status_code=204)
async def delete_history_item(
    analysis_id: str, history: HistoryStore = Depends(get_history)
):
    if not history.delete_analysis(analysis_id):
        raise HTTPException(status_code=404, detail="해당 분석 이력을 찾을 수 없습니다.")
