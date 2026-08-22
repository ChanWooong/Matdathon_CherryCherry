"""모델 연결 계층.

두 가지 공급자를 지원한다.

- ``copilot_sdk`` (로컬 기본): ``agent-framework-github-copilot`` 패키지의
  ``GitHubCopilotAgent``로 Copilot CLI 런타임을 제어한다.
- ``azure_openai`` (Azure 배포): Azure OpenAI / Azure AI Foundry 배포. API 키 또는
  관리 ID(``DefaultAzureCredential``)로 인증한다. 구조화 출력(response_format)이
  안정적이라 서버 파이프라인에 적합하다.

두 경로 모두 Microsoft Agent Framework의 ``SupportsAgentRun`` 계약을 만족하므로
오케스트레이터는 어느 쪽인지 알 필요가 없다.
"""

from __future__ import annotations

import logging
from typing import Any

from agent_framework import Agent, SupportsAgentRun
from agent_framework.openai import OpenAIChatCompletionClient

from app.core.config import Settings

logger = logging.getLogger(__name__)


class ModelConfigurationError(RuntimeError):
    """모델 공급자를 초기화할 수 없을 때."""


def _build_azure_openai_client(
    settings: Settings, model: str | None = None
) -> OpenAIChatCompletionClient:
    """Azure OpenAI(또는 Azure AI Foundry) 배포에 연결된 클라이언트.

    API 키가 있으면 그것을 쓰고, 없으면 ``DefaultAzureCredential``로
    관리 ID 인증을 시도한다. 후자가 운영 환경 권장 경로다 —
    컨테이너에 키를 두지 않아도 된다.
    """
    if not settings.azure_openai_endpoint:
        raise ModelConfigurationError(
            "AZURE_OPENAI_ENDPOINT가 필요합니다 "
            "(예: https://<리소스>.openai.azure.com/). "
            "Azure 리소스가 없다면 MODEL_PROVIDER=copilot_sdk를 사용하세요."
        )

    kwargs: dict[str, Any] = {
        "model": model or settings.model_id,
        "azure_endpoint": settings.azure_openai_endpoint,
        "api_version": settings.azure_openai_api_version,
    }

    if settings.azure_openai_api_key:
        kwargs["api_key"] = settings.azure_openai_api_key
    else:
        try:
            from azure.identity import DefaultAzureCredential
        except ImportError as exc:  # pragma: no cover - 선택 의존성
            raise ModelConfigurationError(
                "AZURE_OPENAI_API_KEY가 없어 관리 ID 인증을 시도했지만 "
                "azure-identity가 설치되지 않았습니다. "
                '`pip install -e ".[azure]"`를 실행하거나 API 키를 설정하세요.'
            ) from exc
        kwargs["credential"] = DefaultAzureCredential()

    return OpenAIChatCompletionClient(**kwargs)


def build_agent(
    *,
    name: str,
    instructions: str,
    settings: Settings,
    model: str | None = None,
    tools: list[Any] | None = None,
) -> SupportsAgentRun:
    """공급자 설정에 맞는 에이전트 하나를 만든다."""
    provider = settings.model_provider

    if provider == "copilot_sdk":
        try:
            from agent_framework.github import GitHubCopilotAgent
        except ImportError as exc:  # pragma: no cover - 선택 의존성
            raise ModelConfigurationError(
                "MODEL_PROVIDER=copilot_sdk를 쓰려면 "
                "`pip install agent-framework-github-copilot` 후 "
                "`python -m copilot download-runtime`을 실행해야 합니다."
            ) from exc

        return GitHubCopilotAgent(
            instructions,
            name=name,
            tools=tools or None,
            default_options={"model": model or settings.model_id},
        )

    if provider != "azure_openai":
        raise ModelConfigurationError(
            f"알 수 없는 MODEL_PROVIDER: {provider!r} "
            "(copilot_sdk 또는 azure_openai여야 합니다)"
        )
    client = _build_azure_openai_client(settings, model)

    return Agent(
        client=client,
        instructions=instructions,
        name=name,
        tools=tools or None,
    )
