"""Typed GitHub issue, pull request, and read-only AI review routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.agents.chat_client import ModelConfigurationError
from app.agents.pr_review import (
    PullRequestReviewer,
    PullRequestReviewGenerationError,
)
from app.api.dependencies import get_github
from app.core.config import Settings, get_settings
from app.schemas import (
    GitHubIssueSummary,
    GitHubPullRequestDetail,
    GitHubPullRequestSummary,
    PullRequestReviewResponse,
)
from app.services.github import GitHubError, GitHubService

router = APIRouter(prefix="/repos/{owner}/{repo}", tags=["github"])

Limit = Annotated[int, Query(ge=1, le=100)]
PullNumber = Annotated[int, Path(ge=1)]


def get_pr_reviewer(
    settings: Settings = Depends(get_settings),
) -> PullRequestReviewer:
    try:
        return PullRequestReviewer(settings)
    except ModelConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _repo(owner: str, repo: str) -> str:
    return f"{owner}/{repo}"


def _github_error(exc: GitHubError) -> HTTPException:
    return HTTPException(status_code=exc.status or 502, detail=str(exc))


@router.get("/issues", response_model=list[GitHubIssueSummary])
async def list_open_issues(
    owner: str,
    repo: str,
    limit: Limit = 30,
    github: GitHubService = Depends(get_github),
) -> list[GitHubIssueSummary]:
    try:
        return await github.list_open_issues(_repo(owner, repo), limit=limit)
    except GitHubError as exc:
        raise _github_error(exc) from exc
    finally:
        await github.aclose()


@router.get("/pulls", response_model=list[GitHubPullRequestSummary])
async def list_open_pull_requests(
    owner: str,
    repo: str,
    limit: Limit = 30,
    github: GitHubService = Depends(get_github),
) -> list[GitHubPullRequestSummary]:
    try:
        return await github.list_open_pull_requests(_repo(owner, repo), limit=limit)
    except GitHubError as exc:
        raise _github_error(exc) from exc
    finally:
        await github.aclose()


@router.get("/pulls/{pull_number}", response_model=GitHubPullRequestDetail)
async def get_pull_request(
    owner: str,
    repo: str,
    pull_number: PullNumber,
    github: GitHubService = Depends(get_github),
) -> GitHubPullRequestDetail:
    try:
        return await github.get_pull_request(_repo(owner, repo), pull_number)
    except GitHubError as exc:
        raise _github_error(exc) from exc
    finally:
        await github.aclose()


@router.post(
    "/pulls/{pull_number}/review",
    response_model=PullRequestReviewResponse,
)
async def review_pull_request(
    owner: str,
    repo: str,
    pull_number: PullNumber,
    reviewer: PullRequestReviewer = Depends(get_pr_reviewer),
    github: GitHubService = Depends(get_github),
) -> PullRequestReviewResponse:
    full_name = _repo(owner, repo)
    try:
        pull = await github.get_pull_request(full_name, pull_number)
        diff = await github.get_pull_diff(full_name, pull_number)
    except GitHubError as exc:
        raise _github_error(exc) from exc
    finally:
        await github.aclose()

    try:
        return await reviewer.review(full_name, pull, diff)
    except PullRequestReviewGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
