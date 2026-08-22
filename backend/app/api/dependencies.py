"""Shared FastAPI dependencies for authenticated API routes."""

from __future__ import annotations

import secrets

from fastapi import Depends, HTTPException, Request

from app.core.config import Settings, get_settings
from app.services.github import GitHubError, GitHubService


def require_api_key(
    request: Request, settings: Settings = Depends(get_settings)
) -> None:
    """Require the configured shared API key for every /api route."""
    expected = settings.api_key
    if not expected:
        if settings.is_production:
            raise HTTPException(
                status_code=503,
                detail=(
                    "서버에 API_KEY가 설정되지 않았습니다. "
                    "운영 환경에서는 인증 없이 API를 열 수 없습니다."
                ),
            )
        return

    provided = request.headers.get("x-api-key", "")
    if not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="유효하지 않은 API 키입니다.")


def get_github(
    settings: Settings = Depends(get_settings),
) -> GitHubService:
    """Build the GitHub client with the configured server token."""
    try:
        return GitHubService(settings.github_token, settings)
    except GitHubError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
