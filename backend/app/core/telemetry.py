"""관찰성 — Application Insights (OpenTelemetry)."""

from __future__ import annotations

import logging

from app.core.config import Settings

logger = logging.getLogger(__name__)


def configure_logging(settings: Settings) -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s | %(message)s",
    )
    # 요청마다 나오는 접근 로그 소음을 줄인다.
    logging.getLogger("httpx").setLevel(logging.WARNING)


def configure_telemetry(settings: Settings, app) -> None:
    """App Insights 연결 문자열이 있으면 자동 계측을 켠다.

    연결 문자열이 없거나 패키지가 없으면 조용히 건너뛴다 —
    로컬 개발에서 Azure 의존성 없이 돌아가야 한다.
    """
    if not settings.telemetry_enabled:
        logger.info("App Insights 연결 문자열이 없어 원격 계측을 건너뜁니다.")
        return

    try:
        from azure.monitor.opentelemetry import configure_azure_monitor
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    except ImportError:
        logger.warning(
            "APPLICATIONINSIGHTS_CONNECTION_STRING이 설정됐지만 "
            "azure-monitor-opentelemetry가 설치되지 않았습니다. "
            "`pip install '.[azure]'`로 설치하세요."
        )
        return

    try:
        configure_azure_monitor(
            connection_string=settings.applicationinsights_connection_string,
            logger_name="app",
        )
        FastAPIInstrumentor.instrument_app(app)
        logger.info("Application Insights 계측을 활성화했습니다.")
    except Exception:  # pragma: no cover - 네트워크 의존
        logger.warning("Application Insights 초기화 실패", exc_info=True)
