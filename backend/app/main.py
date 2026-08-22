"""FastAPI 애플리케이션 진입점."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import Settings, get_settings
from app.core.telemetry import configure_logging, configure_telemetry
from app.services.history import HistoryStore

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings
    configure_logging(settings)

    app.state.history = HistoryStore(settings.history_db_path)

    if not settings.github_token:
        logger.warning(
            "GITHUB_TOKEN이 비어 있습니다. GitHub 리포 조회와 이슈 생성이 실패합니다."
        )

    logger.info(
        "%s 시작 (env=%s, provider=%s)",
        settings.app_name,
        settings.environment,
        settings.model_provider,
    )
    yield
    logger.info("%s 종료", settings.app_name)


def create_app(settings: Settings | None = None) -> FastAPI:
    """앱을 만든다.

    `settings`를 명시적으로 받는 이유: lifespan은 FastAPI의 dependency_overrides를
    거치지 않으므로, 테스트에서 설정을 갈아끼우려면 생성 시점에 주입해야 한다.
    """
    settings = settings or get_settings()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="회의록을 GitHub 이슈 초안으로 바꾸는 3-에이전트 파이프라인",
        lifespan=lifespan,
    )
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)
    configure_telemetry(settings, app)

    @app.get("/health")
    async def health():
        """컨테이너 상태 프로브. 외부 의존성을 호출하지 않는다."""
        return {
            "status": "ok",
            "environment": settings.environment,
            "provider": settings.model_provider,
            "github_token_configured": bool(settings.github_token),
        }

    return app


app = create_app()
